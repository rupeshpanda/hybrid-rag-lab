// ─────────────────────────────────────────────────────────────────────────
// Supercharged Battery Co. — Enterprise Hybrid RAG lab
// Shared types for structured data, retrieval, rules, and the agent response.
// ─────────────────────────────────────────────────────────────────────────

export type TierId = "gold" | "silver" | "standard";

export type Distributor = {
  id: string;
  name: string;
  tier: TierId;
  region: string;
  since: string;
  primary_contact: string;
};

export type Supplier = {
  id: string;
  name: string;
  supplies: string;
  region: string;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  unit_price: number;
  warranty_months: number;
  status: string;
};

export type Tier = {
  id: TierId;
  name: string;
  return_window_days: number;
  restocking_fee_pct: number;
  approval_threshold_usd: number;
  default_policy_id: string;
  notes: string;
};

export type PolicyType = "return" | "warranty" | "refund" | "approval" | "regional" | "finance";

export type PolicyMeta = {
  id: string;
  title: string;
  doc_slug: string;
  policy_type: PolicyType;
  tier: TierId | "all";
  region: string;
};

export type Contract = {
  id: string;
  distributor_id: string;
  start_date: string;
  policy_id: string;
  return_window_override_days: number | null;
  approval_threshold_override_usd: number | null;
  notes: string;
};

export type SalesOrder = {
  id: string;
  distributor_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  order_date: string;
};

export type Invoice = {
  id: string;
  sales_order_id: string;
  distributor_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  invoice_date: string;
  payment_status: string;
};

export type ReturnUnit = {
  condition: "unopened" | "installed_defective";
  quantity: number;
  installed_date?: string;
  reported_issue?: string;
};

export type ReturnRecord = {
  id: string;
  distributor_id: string;
  invoice_id: string | null;
  invoice_reference_raw?: string;
  product_id: string;
  quantity_returned: number;
  units: ReturnUnit[];
  reason: string;
  request_date: string;
  recorded_status: string;
  credit_memo_id: string | null;
  notes?: string;
};

export type CreditMemo = {
  id: string;
  return_id: string;
  invoice_id: string;
  distributor_id: string;
  amount: number;
  issued_date: string;
};

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  item: string;
  quantity: number;
  order_date: string;
  status: string;
};

// ── Retrieval / router ─────────────────────────────────────────────────

export type RetrievalFlags = {
  structured: boolean;
  vector: boolean;
  graph: boolean;
};

export type ExtractedEntities = {
  intent: string;
  distributor_name: string | null;
  distributor_id: string | null;
  invoice_id: string | null;
  product_id: string | null;
  quantity: number | null;
  condition: string | null;
  reason: string | null;
};

export type PolicyChunk = {
  chunk_id: string;
  document: string;
  title: string;
  section: string;
  text: string;
  policy_type: PolicyType;
  tier: TierId | "all";
  region: string;
  score: number;
};

export type GraphEdge = {
  source: string;
  source_label: string;
  relationship: string;
  target: string;
  target_label: string;
};

// ── Rules / decision ───────────────────────────────────────────────────

export type RuleCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type UnitOutcome = {
  condition: string;
  quantity: number;
  outcome: "normal_return_eligible" | "warranty_eligible" | "warranty_out_of_coverage" | "not_eligible";
  detail: string;
};

export type Decision = {
  status: "approved" | "partial_approved" | "rejected" | "pending_manager_approval" | "info_unavailable";
  headline: string;
  refund_amount: number;
  restocking_fee_applied_pct: number;
  warranty_units: number;
  approval_required: boolean;
  approval_threshold_usd: number | null;
  unit_outcomes: UnitOutcome[];
};

// ── Trace / evidence for the UI ────────────────────────────────────────

export type TraceStep = {
  step: string;
  detail: string;
};

export type GraphPathNode = {
  id: string;
  label: string;
  type: string;
};

export type GraphPath = {
  nodes: GraphPathNode[];
  edges: GraphEdge[];
};

export type Citation = {
  label: string;
  type: "invoice" | "contract" | "policy" | "return" | "credit_memo" | "sales_order" | "distributor";
};

export type EvidenceBundle = {
  retrievalFlags: RetrievalFlags;
  entities: ExtractedEntities;
  transactions: {
    distributor: Distributor | null;
    invoice: Invoice | null;
    salesOrder: SalesOrder | null;
    returnRecord: ReturnRecord | null;
    existingCreditMemos: CreditMemo[];
    product: Product | null;
    notFoundNote?: string;
  };
  graphPath: GraphPath;
  retrievedChunks: PolicyChunk[];
  rules: RuleCheck[];
  decision: Decision | null;
  trace: TraceStep[];
  citations: Citation[];
};

export type AgentResponse = {
  answer: string;
  evidence: EvidenceBundle;
};
