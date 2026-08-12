// ─────────────────────────────────────────────────────────────────────────
// Read-only, joined views over the same structured data the agent uses,
// for the Data tab. Nothing here is a separate copy of the data — every
// field is read live from lib/hybrid-rag/data.ts and lib/hybrid-rag/graph.ts
// so this view cannot drift from what the agent actually sees.
// ─────────────────────────────────────────────────────────────────────────

import {
  contracts,
  creditMemos,
  distributors,
  findContractByDistributor,
  findDistributorById,
  findPolicyByProduct,
  invoices,
  policies,
  products,
  returns,
  salesOrders,
  tiers,
} from "./data";

function distributorName(id: string): string {
  return findDistributorById(id)?.name ?? id;
}

/** A short, plain-language summary of a policy's key terms, derived from live tier/product data rather than hand-written duplicate figures. */
function summarizePolicy(policyId: string, docSlug: string, policyType: string, region: string): string {
  const tier = tiers.find((t) => t.default_policy_id === policyId);
  if (tier) {
    return `${tier.return_window_days}-day return window, ${tier.restocking_fee_pct}% restocking fee, $${tier.approval_threshold_usd.toLocaleString()} approval threshold.`;
  }
  if (docSlug === "agm-warranty-policy") {
    const months = products.find((p) => p.category === "AGM")?.warranty_months;
    return `${months ?? "—"}-month warranty coverage for AGM-series products, including after installation.`;
  }
  if (docSlug === "defective-product-policy") {
    const byCategory = Array.from(new Set(products.map((p) => `${p.category} (${p.warranty_months}mo)`)));
    return `General warranty terms by product category: ${byCategory.join(", ")}.`;
  }
  if (docSlug === "manager-approval-policy") {
    const thresholds = tiers.map((t) => t.approval_threshold_usd).sort((a, b) => a - b);
    return `Approval thresholds range from $${thresholds[0].toLocaleString()} to $${thresholds[thresholds.length - 1].toLocaleString()} by distributor tier, or a contract override.`;
  }
  if (policyType === "regional") {
    return `Regional process requirements for distributors in ${region}.`;
  }
  if (policyType === "finance") {
    return "How credit memos settle approved returns against the original invoice.";
  }
  if (policyType === "refund") {
    return "Refund calculation, existing-credit checks, and the manager-approval gate.";
  }
  return "Company-wide baseline terms, overridden by tier and contract policies where they conflict.";
}

export function buildDataSnapshot() {
  return {
    distributors: distributors.map((d) => ({
      id: d.id,
      name: d.name,
      tier: d.tier,
      region: d.region,
      contract_id: findContractByDistributor(d.id)?.id ?? null,
    })),
    contracts: contracts.map((c) => {
      const policy = policies.find((p) => p.id === c.policy_id);
      return {
        id: c.id,
        distributor_id: c.distributor_id,
        distributor_name: distributorName(c.distributor_id),
        policy_id: c.policy_id,
        policy_title: policy?.title ?? c.policy_id,
        return_window_override_days: c.return_window_override_days,
        approval_threshold_override_usd: c.approval_threshold_override_usd,
      };
    }),
    policies: policies.map((p) => ({
      id: p.id,
      title: p.title,
      policy_type: p.policy_type,
      tier: p.tier,
      region: p.region,
      summary: summarizePolicy(p.id, p.doc_slug, p.policy_type, p.region),
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      unit_price: p.unit_price,
      warranty_months: p.warranty_months,
      applicable_warranty_policy: findPolicyByProduct(p.id)?.title ?? null,
    })),
    salesOrders: salesOrders.map((s) => ({
      id: s.id,
      distributor_name: distributorName(s.distributor_id),
      product_id: s.product_id,
      quantity: s.quantity,
      order_date: s.order_date,
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      distributor_name: distributorName(i.distributor_id),
      product_id: i.product_id,
      amount: i.amount,
      invoice_date: i.invoice_date,
      status: i.payment_status,
    })),
    returns: returns.map((r) => ({
      id: r.id,
      distributor_name: distributorName(r.distributor_id),
      invoice_id: r.invoice_id ?? r.invoice_reference_raw ?? null,
      quantity_returned: r.quantity_returned,
      request_date: r.request_date,
      status: r.recorded_status,
    })),
    creditMemos: creditMemos.map((c) => ({
      id: c.id,
      distributor_name: distributorName(c.distributor_id),
      invoice_id: c.invoice_id,
      amount: c.amount,
      issued_date: c.issued_date,
    })),
    tierDefaults: tiers,
  };
}

export type DataSnapshot = ReturnType<typeof buildDataSnapshot>;
