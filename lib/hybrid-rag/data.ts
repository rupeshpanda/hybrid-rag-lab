// ─────────────────────────────────────────────────────────────────────────
// Structured data loader — the simulated "SAP-like" system of record.
// Plain JSON files under /data/supercharged. In a real enterprise this
// would be S/4HANA, a data warehouse, or a customer/billing system.
// ─────────────────────────────────────────────────────────────────────────

import distributorsJson from "../../data/supercharged/distributors.json";
import suppliersJson from "../../data/supercharged/suppliers.json";
import productsJson from "../../data/supercharged/products.json";
import tiersJson from "../../data/supercharged/tiers.json";
import policiesJson from "../../data/supercharged/policies.json";
import contractsJson from "../../data/supercharged/contracts.json";
import salesOrdersJson from "../../data/supercharged/sales-orders.json";
import invoicesJson from "../../data/supercharged/invoices.json";
import returnsJson from "../../data/supercharged/returns.json";
import creditMemosJson from "../../data/supercharged/credit-memos.json";
import purchaseOrdersJson from "../../data/supercharged/purchase-orders.json";

import type {
  Distributor,
  Supplier,
  Product,
  Tier,
  PolicyMeta,
  Contract,
  SalesOrder,
  Invoice,
  ReturnRecord,
  CreditMemo,
  PurchaseOrder,
} from "./types";

// The lab freezes "today" so the seeded dataset (return windows, warranty
// coverage, ages of installed units) always evaluates the same way. A real
// system would use the actual current date.
export const SIMULATED_TODAY = "2026-08-03";

export const distributors = distributorsJson as Distributor[];
export const suppliers = suppliersJson as Supplier[];
export const products = productsJson as Product[];
export const tiers = tiersJson as Tier[];
export const policies = policiesJson as PolicyMeta[];
export const contracts = contractsJson as Contract[];
export const salesOrders = salesOrdersJson as SalesOrder[];
export const invoices = invoicesJson as Invoice[];
export const returns = returnsJson as ReturnRecord[];
export const creditMemos = creditMemosJson as CreditMemo[];
export const purchaseOrders = purchaseOrdersJson as PurchaseOrder[];

export function daysBetween(earlier: string, later: string): number {
  const a = new Date(earlier + "T00:00:00Z").getTime();
  const b = new Date(later + "T00:00:00Z").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function findDistributorById(id: string): Distributor | null {
  return distributors.find((d) => d.id === id) ?? null;
}

export function findDistributorByName(name: string): Distributor | null {
  const norm = name.trim().toLowerCase();
  return (
    distributors.find((d) => d.name.toLowerCase() === norm) ??
    distributors.find((d) => d.name.toLowerCase().includes(norm) || norm.includes(d.name.toLowerCase())) ??
    null
  );
}

export function findProductById(id: string): Product | null {
  return products.find((p) => p.id.toLowerCase() === id.toLowerCase()) ?? null;
}

export function findProductByName(text: string): Product | null {
  const norm = text.toLowerCase();
  return (
    products.find((p) => p.id.toLowerCase() === norm) ??
    products.find((p) => norm.includes(p.id.toLowerCase())) ??
    products.find((p) => p.name.toLowerCase().includes(norm) || norm.includes(p.category.toLowerCase())) ??
    null
  );
}

export function findInvoiceById(id: string): Invoice | null {
  return invoices.find((i) => i.id.toLowerCase() === id.toLowerCase()) ?? null;
}

export function findSalesOrderById(id: string): SalesOrder | null {
  return salesOrders.find((s) => s.id === id) ?? null;
}

export function findContractByDistributor(distributorId: string): Contract | null {
  return contracts.find((c) => c.distributor_id === distributorId) ?? null;
}

export function findTier(tierId: string): Tier | null {
  return tiers.find((t) => t.id === tierId) ?? null;
}

export function findPolicyById(id: string): PolicyMeta | null {
  return policies.find((p) => p.id === id) ?? null;
}

export function findPolicyByProduct(productId: string): PolicyMeta | null {
  const product = findProductById(productId);
  if (!product) return null;
  if (product.category === "AGM") return findPolicyById("P-05");
  return findPolicyById("P-06");
}

export function creditMemosForInvoice(invoiceId: string): CreditMemo[] {
  return creditMemos.filter((c) => c.invoice_id === invoiceId);
}

export function returnsForInvoice(invoiceId: string): ReturnRecord[] {
  return returns.filter((r) => r.invoice_id === invoiceId);
}

export function findReturnReferencingInvoiceText(text: string): ReturnRecord | null {
  return returns.find((r) => r.invoice_reference_raw && text.toLowerCase().includes(r.invoice_reference_raw.toLowerCase())) ?? null;
}
