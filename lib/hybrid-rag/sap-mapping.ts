// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for the "this lab entity → SAP equivalent" mapping.
// Shown on the How It Works page and as tooltips on evidence-panel badges,
// so the two never drift apart.
// ─────────────────────────────────────────────────────────────────────────

export const SAP_MAPPING: { entity: string; sapEquivalent: string }[] = [
  { entity: "Product", sapEquivalent: "Material Master" },
  { entity: "Distributor", sapEquivalent: "Customer Master" },
  { entity: "Sales Order", sapEquivalent: "SAP Sales Order" },
  { entity: "Invoice", sapEquivalent: "Billing Document" },
  { entity: "Return", sapEquivalent: "Return Order" },
  { entity: "Credit Memo", sapEquivalent: "Credit Memo" },
  { entity: "Supplier", sapEquivalent: "Vendor / Business Partner" },
  { entity: "Purchase Order", sapEquivalent: "SAP PO" },
];

export function sapEquivalentFor(entity: string): string | null {
  return SAP_MAPPING.find((m) => m.entity.toLowerCase() === entity.toLowerCase())?.sapEquivalent ?? null;
}
