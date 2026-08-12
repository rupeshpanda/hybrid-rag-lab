// ─────────────────────────────────────────────────────────────────────────
// Deterministic return / refund rules.
//
// These are the financial controls that must never be left to the LLM's
// judgment: return-window eligibility, warranty coverage, restocking fees,
// quantity limits, duplicate-refund prevention, and the manager-approval
// gate. The rules engine computes the decision; the LLM only explains it.
// ─────────────────────────────────────────────────────────────────────────

import type { Contract, CreditMemo, Decision, Distributor, Invoice, Product, ReturnRecord, RuleCheck, Tier, UnitOutcome } from "./types";
import { daysBetween, findTier, SIMULATED_TODAY } from "./data";

export type RulesInput = {
  distributor: Distributor | null;
  contract: Contract | null;
  invoice: Invoice | null;
  product: Product | null;
  returnRecord: ReturnRecord | null;
  existingCreditMemos: CreditMemo[];
};

export type RulesOutput = {
  rules: RuleCheck[];
  decision: Decision | null;
};

function effectiveWindowDays(tier: Tier | null, contract: Contract | null): number {
  return contract?.return_window_override_days ?? tier?.return_window_days ?? 30;
}

function effectiveApprovalThreshold(tier: Tier | null, contract: Contract | null): number {
  return contract?.approval_threshold_override_usd ?? tier?.approval_threshold_usd ?? 1000;
}

function warrantyMonthsFor(product: Product | null): number {
  return product?.warranty_months ?? 12;
}

function monthsBetween(earlier: string, later: string): number {
  return daysBetween(earlier, later) / 30.44;
}

export function runRules(input: RulesInput): RulesOutput {
  const { distributor, contract, invoice, product, returnRecord, existingCreditMemos } = input;
  const rules: RuleCheck[] = [];
  const tier = distributor ? findTier(distributor.tier) : null;

  if (!invoice) {
    rules.push({
      id: "invoice_found",
      label: "Invoice located in structured records",
      passed: false,
      detail: "The referenced invoice could not be found in structured enterprise data.",
    });
    return { rules, decision: null };
  }
  rules.push({
    id: "invoice_found",
    label: "Invoice located in structured records",
    passed: true,
    detail: `${invoice.id} found: ${invoice.quantity} units, $${invoice.amount.toLocaleString()}, invoiced ${invoice.invoice_date}.`,
  });

  if (!returnRecord) {
    // No specific return request to evaluate (e.g. a general policy or invoice-status question).
    return { rules, decision: null };
  }

  const windowDays = effectiveWindowDays(tier, contract);
  const approvalThreshold = effectiveApprovalThreshold(tier, contract);
  const restockingFeePct = tier?.restocking_fee_pct ?? 15;
  const unitPrice = invoice.unit_price;

  // ── Quantity rule ──
  const quantityOk = returnRecord.quantity_returned <= invoice.quantity;
  rules.push({
    id: "quantity_within_invoice",
    label: "Quantity does not exceed invoiced quantity",
    passed: quantityOk,
    detail: quantityOk
      ? `${returnRecord.quantity_returned} of ${invoice.quantity} invoiced units.`
      : `Requested ${returnRecord.quantity_returned} exceeds the ${invoice.quantity} units invoiced on ${invoice.id}.`,
  });

  // ── Duplicate refund rule ──
  const refundedSoFar = existingCreditMemos.reduce((sum, cm) => sum + cm.amount, 0);
  const fullyRefunded = refundedSoFar >= invoice.amount - 0.01;
  rules.push({
    id: "no_duplicate_refund",
    label: "Invoice has not already been fully refunded",
    passed: !fullyRefunded,
    detail: fullyRefunded
      ? `${invoice.id} already has ${existingCreditMemos.map((c) => c.id).join(", ")} totaling $${refundedSoFar.toLocaleString()}, covering the invoiced amount.`
      : existingCreditMemos.length > 0
        ? `${existingCreditMemos.map((c) => c.id).join(", ")} on file totaling $${refundedSoFar.toLocaleString()}, below the invoiced amount, so a further refund is not automatically blocked.`
        : "No prior credit memo on this invoice.",
  });

  if (!quantityOk || fullyRefunded) {
    return {
      rules,
      decision: {
        status: "rejected",
        headline: !quantityOk ? "Return rejected: quantity exceeds invoice." : "Return rejected: invoice already fully refunded.",
        refund_amount: 0,
        restocking_fee_applied_pct: restockingFeePct,
        warranty_units: 0,
        approval_required: false,
        approval_threshold_usd: approvalThreshold,
        unit_outcomes: [],
      },
    };
  }

  // ── Per-unit evaluation ──
  const unitOutcomes: UnitOutcome[] = [];
  let refundableQty = 0;
  let warrantyQty = 0;

  const daysSinceInvoice = daysBetween(invoice.invoice_date, SIMULATED_TODAY);
  const withinWindow = daysSinceInvoice <= windowDays;
  rules.push({
    id: "within_return_window",
    label: `Within ${windowDays}-day return window`,
    passed: withinWindow,
    detail: `${daysSinceInvoice} days since invoice date (${invoice.invoice_date}); window is ${windowDays} days${contract?.return_window_override_days ? " (contract override)" : ""}.`,
  });

  const warrantyMonths = warrantyMonthsFor(product);

  for (const unit of returnRecord.units) {
    if (unit.condition === "unopened") {
      if (withinWindow) {
        unitOutcomes.push({
          condition: "unopened",
          quantity: unit.quantity,
          outcome: "normal_return_eligible",
          detail: `Eligible as a normal return under the ${daysSinceInvoice}-day / ${windowDays}-day window.`,
        });
        refundableQty += unit.quantity;
      } else {
        unitOutcomes.push({
          condition: "unopened",
          quantity: unit.quantity,
          outcome: "not_eligible",
          detail: `Outside the ${windowDays}-day return window (${daysSinceInvoice} days since invoice).`,
        });
      }
    } else {
      // installed_defective
      const referenceDate = unit.installed_date ?? invoice.invoice_date;
      const monthsSince = monthsBetween(referenceDate, SIMULATED_TODAY);
      const inWarranty = monthsSince <= warrantyMonths;
      unitOutcomes.push({
        condition: "installed_defective",
        quantity: unit.quantity,
        outcome: inWarranty ? "warranty_eligible" : "warranty_out_of_coverage",
        detail: inWarranty
          ? `Installed ~${monthsSince.toFixed(1)} months ago, within the ${warrantyMonths}-month warranty. Reported: ${unit.reported_issue ?? "reported defective"}.`
          : `Installed ~${monthsSince.toFixed(1)} months ago, past the ${warrantyMonths}-month warranty window.`,
      });
      if (inWarranty) warrantyQty += unit.quantity;
    }
  }

  const refundAmount = Math.round(refundableQty * unitPrice * (1 - restockingFeePct / 100) * 100) / 100;
  const approvalRequired = refundAmount > approvalThreshold;

  rules.push({
    id: "no_restocking_fee_on_warranty",
    label: "Restocking fee applies only to normal-return units, not warranty units",
    passed: true,
    detail: `${restockingFeePct}% restocking fee applied to ${refundableQty} normal-return unit(s); ${warrantyQty} warranty unit(s) excluded from the fee.`,
  });

  rules.push({
    id: "approval_threshold",
    label: `Refund at or below the $${approvalThreshold.toLocaleString()} approval threshold`,
    passed: !approvalRequired,
    detail: approvalRequired
      ? `Calculated refund $${refundAmount.toLocaleString()} exceeds the $${approvalThreshold.toLocaleString()} threshold${contract?.approval_threshold_override_usd ? " (contract override)" : ""}. Manager approval required.`
      : `Calculated refund $${refundAmount.toLocaleString()} is within the $${approvalThreshold.toLocaleString()} threshold.`,
  });

  const anyEligible = refundableQty > 0 || warrantyQty > 0;
  const anyRejected = unitOutcomes.some((u) => u.outcome === "not_eligible" || u.outcome === "warranty_out_of_coverage");

  let status: Decision["status"];
  let headline: string;
  if (!anyEligible) {
    status = "rejected";
    headline = "Return rejected: no units qualify for a normal return or warranty claim.";
  } else if (approvalRequired) {
    status = "pending_manager_approval";
    headline = `Manager approval required. Calculated refund $${refundAmount.toLocaleString()} exceeds the $${approvalThreshold.toLocaleString()} threshold.`;
  } else if (anyRejected) {
    status = "partial_approved";
    headline = `Partial return approved: $${refundAmount.toLocaleString()} refund${warrantyQty > 0 ? `, ${warrantyQty} unit(s) routed to warranty evaluation` : ""}.`;
  } else {
    status = "approved";
    headline = warrantyQty > 0
      ? `Approved: $${refundAmount.toLocaleString()} refund plus ${warrantyQty} unit(s) approved for warranty.`
      : `Approved: $${refundAmount.toLocaleString()} refund.`;
  }

  return {
    rules,
    decision: {
      status,
      headline,
      refund_amount: refundAmount,
      restocking_fee_applied_pct: restockingFeePct,
      warranty_units: warrantyQty,
      approval_required: approvalRequired,
      approval_threshold_usd: approvalThreshold,
      unit_outcomes: unitOutcomes,
    },
  };
}
