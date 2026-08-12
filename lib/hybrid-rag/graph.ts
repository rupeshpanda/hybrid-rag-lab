// ─────────────────────────────────────────────────────────────────────────
// Lightweight knowledge graph over the Supercharged Battery Co. ontology.
//
// This is intentionally not Neo4j or NetworkX — it is a small, in-memory
// triple store built from the same structured records used by structured
// retrieval. That is the point of the demo: the ontology gives the existing
// records business meaning by connecting them, rather than duplicating them
// into a separate graph database.
//
// Ontology (see /labs/hybrid-rag/how-it-works):
//   Distributor -HAS_CONTRACT-> Contract
//   Distributor -HAS_TIER-> DistributorTier
//   Distributor -OPERATES_IN-> Region
//   Distributor -PLACED_ORDER-> SalesOrder
//   SalesOrder -CONTAINS-> Product
//   SalesOrder -BILLED_BY-> Invoice
//   Invoice -BELONGS_TO-> Distributor
//   Return -REFERENCES-> Invoice
//   Return -CONTAINS-> Product
//   Contract -USES_POLICY-> Policy
//   Product -HAS_WARRANTY_POLICY-> Policy
//   DistributorTier -HAS_DEFAULT_POLICY-> Policy
//   CreditMemo -SETTLES-> Return
// ─────────────────────────────────────────────────────────────────────────

import type { GraphEdge, GraphPath, PolicyMeta } from "./types";
import {
  contracts,
  creditMemos,
  distributors,
  findPolicyById,
  findPolicyByProduct,
  findTier,
  invoices,
  policies,
  returns,
  salesOrders,
  tiers,
} from "./data";

function edge(source: string, sourceLabel: string, relationship: string, target: string, targetLabel: string): GraphEdge {
  return { source, source_label: sourceLabel, relationship, target, target_label: targetLabel };
}

/** Build the full edge list. Cheap enough to recompute per request for a lab of this size. */
export function buildGraph(): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const d of distributors) {
    const tier = findTier(d.tier);
    edges.push(edge(d.id, d.name, "HAS_TIER", d.tier, tier?.name ?? d.tier));
    edges.push(edge(d.id, d.name, "OPERATES_IN", d.region, d.region));
  }
  for (const c of contracts) {
    const d = distributors.find((x) => x.id === c.distributor_id);
    edges.push(edge(c.distributor_id, d?.name ?? c.distributor_id, "HAS_CONTRACT", c.id, c.id));
    const p = findPolicyById(c.policy_id);
    edges.push(edge(c.id, c.id, "USES_POLICY", c.policy_id, p?.title ?? c.policy_id));
  }
  for (const t of tiers) {
    const p = findPolicyById(t.default_policy_id);
    edges.push(edge(t.id, t.name, "HAS_DEFAULT_POLICY", t.default_policy_id, p?.title ?? t.default_policy_id));
  }
  for (const so of salesOrders) {
    const d = distributors.find((x) => x.id === so.distributor_id);
    edges.push(edge(so.distributor_id, d?.name ?? so.distributor_id, "PLACED_ORDER", so.id, so.id));
    edges.push(edge(so.id, so.id, "CONTAINS", so.product_id, so.product_id));
  }
  for (const inv of invoices) {
    edges.push(edge(inv.sales_order_id, inv.sales_order_id, "BILLED_BY", inv.id, inv.id));
    const d = distributors.find((x) => x.id === inv.distributor_id);
    edges.push(edge(inv.id, inv.id, "BELONGS_TO", inv.distributor_id, d?.name ?? inv.distributor_id));
  }
  for (const r of returns) {
    if (r.invoice_id) edges.push(edge(r.id, r.id, "REFERENCES", r.invoice_id, r.invoice_id));
    edges.push(edge(r.id, r.id, "CONTAINS", r.product_id, r.product_id));
  }
  for (const cm of creditMemos) {
    edges.push(edge(cm.id, cm.id, "SETTLES", cm.return_id, cm.return_id));
  }
  // Product -> warranty policy (AGM-series to the AGM policy, everything else to the general Defective Product policy)
  const productIds = new Set(salesOrders.map((s) => s.product_id));
  for (const productId of productIds) {
    const p = findPolicyByProduct(productId);
    if (p) edges.push(edge(productId, productId, "HAS_WARRANTY_POLICY", p.id, p.title));
  }

  return edges;
}

/**
 * Determine the applicable return policy for a distributor, following the
 * precedence order: contract override > tier default. Returns the policy
 * plus the graph path used to reach it, so the UI can render the traversal.
 */
export function resolveDistributorPolicy(distributorId: string): {
  policy: PolicyMeta | null;
  path: GraphPath;
} {
  const distributor = distributors.find((d) => d.id === distributorId);
  const contract = contracts.find((c) => c.distributor_id === distributorId);
  const tier = distributor ? findTier(distributor.tier) : null;

  const policyId = contract?.policy_id ?? tier?.default_policy_id ?? null;
  const policy = policyId ? findPolicyById(policyId) : null;

  const nodes: GraphPath["nodes"] = [];
  const edges: GraphEdge[] = [];

  if (distributor) {
    nodes.push({ id: distributor.id, label: distributor.name, type: "Distributor" });
  }
  if (contract && distributor) {
    nodes.push({ id: contract.id, label: contract.id, type: "Contract" });
    edges.push(edge(distributor.id, distributor.name, "HAS_CONTRACT", contract.id, contract.id));
  }
  if (tier && distributor) {
    nodes.push({ id: tier.id, label: tier.name, type: "DistributorTier" });
    edges.push(edge(distributor.id, distributor.name, "HAS_TIER", tier.id, tier.name));
  }
  if (policy) {
    nodes.push({ id: policy.id, label: policy.title, type: "Policy" });
    if (contract) {
      edges.push(edge(contract.id, contract.id, "USES_POLICY", policy.id, policy.title));
    } else if (tier) {
      edges.push(edge(tier.id, tier.name, "HAS_DEFAULT_POLICY", policy.id, policy.title));
    }
  }

  return { policy, path: { nodes, edges } };
}

/** Find the warranty policy that applies to a product, plus the graph path to reach it. */
export function resolveProductWarrantyPolicy(productId: string): { policy: PolicyMeta | null; path: GraphPath } {
  const policy = findPolicyByProduct(productId);
  const nodes: GraphPath["nodes"] = [{ id: productId, label: productId, type: "Product" }];
  const edges: GraphEdge[] = [];
  if (policy) {
    nodes.push({ id: policy.id, label: policy.title, type: "Policy" });
    edges.push(edge(productId, productId, "HAS_WARRANTY_POLICY", policy.id, policy.title));
  }
  return { policy, path: { nodes, edges } };
}

export function allPolicies(): PolicyMeta[] {
  return policies;
}
