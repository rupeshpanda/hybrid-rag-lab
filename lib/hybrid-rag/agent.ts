// ─────────────────────────────────────────────────────────────────────────
// The Customer Service Returns Agent — orchestrates the hybrid retrieval
// pipeline described in the lab: route -> structured -> graph -> vector ->
// rules -> LLM synthesis. See how-it-works for the educational walkthrough.
// ─────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { AgentResponse, Citation, EvidenceBundle, GraphEdge, PolicyChunk, RoutingDecision, TraceStep, VectorOnlyResult } from "./types";
import { routeQuery, getClient, LLM_MODEL } from "./router";
import { runStructuredRetrieval, type StructuredResult } from "./structured-retrieval";
import { resolveDistributorPolicy, resolveProductWarrantyPolicy } from "./graph";
import { retrievePolicyChunks, retrieveDocumentChunks } from "./vector-retrieval";
import { runRules } from "./rules-engine";
import { distributors, findTier, findContractByDistributor, SIMULATED_TODAY } from "./data";

const GUARDRAILS = `You are the customer-service response step of a hybrid-RAG enterprise agent for Supercharged Battery Co., a company that sells automotive batteries through independent distributors.

You are given retrieved evidence: structured transaction facts, a knowledge-graph path showing which policy applies, retrieved policy text chunks, and the output of a deterministic rules engine (return eligibility, warranty eligibility, refund amount, approval requirement). Write a clear, concise customer-service response using ONLY this evidence.

Rules:
1. Never invent an invoice, distributor, product, quantity, or dollar amount that is not in the evidence.
2. Never state a policy exists or say what it requires unless it appears in the retrieved policy chunks.
3. Never override the rules engine's decision (status, refund amount, approval requirement, warranty outcome). Explain it, do not recompute or contradict it.
4. If required information could not be found in structured data, say plainly that it is unavailable — do not guess.
5. Keep the response focused and practical: 3-6 short sentences or a short list, written for a distributor account manager, not a legal document.
6. Do not repeat the raw evidence dump; summarize it in plain language.
7. Write in plain, direct sentences. Do not use em dashes; use a period, comma, or colon instead.`;

function buildContextBlock(evidence: EvidenceBundle): string {
  const lines: string[] = [];

  lines.push(`SIMULATED TODAY: ${SIMULATED_TODAY}`);

  const { distributor, invoice, salesOrder, returnRecord, existingCreditMemos, product } = evidence.transactions;
  lines.push("\n## Structured facts");
  if (distributor) {
    const tier = findTier(distributor.tier);
    const contract = findContractByDistributor(distributor.id);
    lines.push(`Distributor: ${distributor.name} (${distributor.id}), tier ${tier?.name}, region ${distributor.region}.`);
    if (contract) lines.push(`Contract ${contract.id}: ${contract.notes}`);
  } else {
    lines.push("Distributor: not resolved.");
  }
  if (invoice) {
    lines.push(`Invoice ${invoice.id}: ${invoice.quantity} × ${invoice.product_id} @ $${invoice.unit_price}, total $${invoice.amount}, invoiced ${invoice.invoice_date}, payment status: ${invoice.payment_status}.`);
    if (salesOrder) lines.push(`Sales order ${salesOrder.id} placed ${salesOrder.order_date}.`);
    if (existingCreditMemos.length > 0) {
      lines.push(`Existing credit memos: ${existingCreditMemos.map((c) => `${c.id} ($${c.amount}, ${c.issued_date})`).join("; ")}.`);
    } else {
      lines.push("No existing credit memos on this invoice.");
    }
  } else {
    lines.push("Invoice: not found in structured records.");
  }
  if (product) lines.push(`Product: ${product.name} (${product.id}), ${product.warranty_months}-month warranty, $${product.unit_price}.`);
  if (returnRecord) {
    lines.push(`Return request ${returnRecord.id}: ${returnRecord.units.map((u) => `${u.quantity} ${u.condition}${u.reported_issue ? ` ("${u.reported_issue}")` : ""}`).join(", ")}. Reason: ${returnRecord.reason}.`);
  }
  if (evidence.transactions.notFoundNote) lines.push(`Not found: ${evidence.transactions.notFoundNote}`);

  if (evidence.graphPath.nodes.length > 0) {
    lines.push("\n## Graph path (which policy applies)");
    lines.push(evidence.graphPath.nodes.map((n) => `${n.type}:${n.label}`).join(" -> "));
  }

  if (evidence.retrievedChunks.length > 0) {
    lines.push("\n## Retrieved policy text");
    for (const c of evidence.retrievedChunks) {
      lines.push(`[${c.title} ${c.section}] ${c.text}`);
    }
  }

  if (evidence.rules.length > 0) {
    lines.push("\n## Rules engine checks");
    for (const r of evidence.rules) lines.push(`${r.passed ? "PASS" : "FAIL"} — ${r.label}: ${r.detail}`);
  }

  if (evidence.decision) {
    lines.push("\n## Rules engine decision (authoritative — do not contradict)");
    lines.push(`Status: ${evidence.decision.status}`);
    lines.push(`Headline: ${evidence.decision.headline}`);
    lines.push(`Refund amount: $${evidence.decision.refund_amount}`);
    lines.push(`Warranty units: ${evidence.decision.warranty_units}`);
    lines.push(`Approval required: ${evidence.decision.approval_required} (threshold $${evidence.decision.approval_threshold_usd})`);
    for (const u of evidence.decision.unit_outcomes) lines.push(`  - ${u.quantity} ${u.condition}: ${u.outcome} — ${u.detail}`);
  }

  return lines.join("\n");
}

function templatedFallbackAnswer(evidence: EvidenceBundle): string {
  const { decision } = evidence;
  const { distributor, invoice } = evidence.transactions;

  if (evidence.transactions.notFoundNote) {
    return `I could not find ${evidence.transactions.notFoundNote} in our records, so I can't process this request. Please double-check the reference and try again.`;
  }
  if (!decision) {
    if (evidence.retrievedChunks.length > 0) {
      return evidence.retrievedChunks.map((c) => `${c.title} ${c.section}: ${c.text}`).join("\n\n");
    }
    return "I don't have enough information retrieved to answer that. Please mention a distributor, invoice number, or specific policy topic.";
  }

  const parts: string[] = [];
  parts.push(decision.headline);
  if (distributor) parts.push(`Distributor: ${distributor.name}.`);
  if (invoice) parts.push(`Invoice: ${invoice.id}.`);
  for (const u of decision.unit_outcomes) {
    parts.push(`${u.quantity} unit(s), ${u.condition.replace("_", " ")}: ${u.outcome.replace(/_/g, " ")}.`);
  }
  if (decision.approval_required) {
    parts.push(`Manager approval is required before a credit memo can be issued (threshold $${decision.approval_threshold_usd?.toLocaleString()}).`);
  }
  return parts.join(" ");
}

export async function answerCustomerQuery(message: string): Promise<AgentResponse> {
  const trace: TraceStep[] = [];

  // Step 1 — route
  const { entities, flags } = await routeQuery(message);
  trace.push({ step: "Intent + entity extraction", detail: `intent=${entities.intent}, distributor=${entities.distributor_name ?? "-"}, invoice=${entities.invoice_id ?? "-"}, product=${entities.product_id ?? "-"}` });

  // Step 2 — structured retrieval. Only runs when the question actually names
  // something to look up (a distributor, invoice, or product). A pure policy
  // question like "what does our return policy say about X" has nothing for
  // structured retrieval to find, so it's genuinely skipped, not run and
  // discarded — see the Routing tab.
  const needsStructured = Boolean(entities.distributor_name || entities.distributor_id || entities.invoice_id || entities.product_id);
  const emptyStructured: StructuredResult = {
    distributor: null,
    invoice: null,
    salesOrder: null,
    returnRecord: null,
    existingCreditMemos: [],
    product: null,
    citations: [],
    notFound: [],
  };
  const structured = needsStructured ? runStructuredRetrieval(entities, message) : emptyStructured;
  trace.push({
    step: "Structured retrieval",
    detail: !needsStructured
      ? "Skipped: no distributor, invoice, or product named in the question."
      : structured.invoice
        ? `Retrieved ${structured.invoice.id} from structured enterprise data.`
        : structured.notFound.length > 0
          ? `Not found: ${structured.notFound.join("; ")}.`
          : "No specific invoice referenced.",
  });

  // Step 3 — graph traversal
  let graphEdges: GraphEdge[] = [];
  let graphNodes: EvidenceBundle["graphPath"]["nodes"] = [];
  let applicablePolicySlug: string | null = null;

  if (structured.distributor) {
    const { policy, path } = resolveDistributorPolicy(structured.distributor.id);
    graphEdges = [...graphEdges, ...path.edges];
    graphNodes = [...graphNodes, ...path.nodes];
    if (policy) applicablePolicySlug = policy.doc_slug;
    trace.push({ step: "Graph traversal", detail: `${structured.distributor.name} -> tier/contract -> ${policy?.title ?? "no policy resolved"}.` });
  }

  let warrantyPolicySlug: string | null = null;
  const isWarrantyRelevant = structured.returnRecord?.units.some((u) => u.condition === "installed_defective") || entities.intent === "warranty_question";
  if (isWarrantyRelevant && structured.product) {
    const { policy, path } = resolveProductWarrantyPolicy(structured.product.id);
    graphEdges = [...graphEdges, ...path.edges];
    graphNodes = [...graphNodes, ...path.nodes.filter((n) => !graphNodes.some((g) => g.id === n.id))];
    if (policy) warrantyPolicySlug = policy.doc_slug;
    if (policy) trace.push({ step: "Graph traversal", detail: `${structured.product.id} -> ${policy.title}.` });
  }

  // Step 4 — vector retrieval
  let chunks: PolicyChunk[] = [];
  const vectorAttempted = Boolean(flags.vector || entities.intent === "policy_question" || entities.intent === "warranty_question" || structured.returnRecord);
  if (vectorAttempted) {
    if (applicablePolicySlug) chunks = chunks.concat(retrieveDocumentChunks(applicablePolicySlug, message, 3));
    if (warrantyPolicySlug) chunks = chunks.concat(retrieveDocumentChunks(warrantyPolicySlug, message, 2));
    if (entities.intent === "approval_question") chunks = chunks.concat(retrievePolicyChunks(message, 2, { policy_type: "approval" }));
    if (entities.intent === "invoice_status") chunks = chunks.concat(retrievePolicyChunks(message, 2, { policy_type: "finance" }));
    // A general "what is our policy" question with no distributor in context maps to the
    // company-wide baseline policy, not a distributor-specific tier document.
    if (entities.intent === "policy_question" && !structured.distributor) {
      chunks = chunks.concat(retrieveDocumentChunks("standard-return-policy", message, 2));
    }
    // A policy comparison mentioning two or more distributors by name: pull each
    // distributor's applicable policy document, not just the one entity extraction grabbed.
    const mentionedDistributors = distributors.filter((d) => message.toLowerCase().includes(d.name.toLowerCase()));
    if (entities.intent === "policy_question" && mentionedDistributors.length >= 2) {
      for (const d of mentionedDistributors) {
        const { policy, path } = resolveDistributorPolicy(d.id);
        graphEdges = [...graphEdges, ...path.edges];
        graphNodes = [...graphNodes, ...path.nodes.filter((n) => !graphNodes.some((g) => g.id === n.id))];
        if (policy) chunks = chunks.concat(retrieveDocumentChunks(policy.doc_slug, message, 2));
      }
      trace.push({ step: "Graph traversal", detail: `Resolved policies for ${mentionedDistributors.map((d) => d.name).join(", ")}.` });
    }
    if (chunks.length === 0) chunks = retrievePolicyChunks(message, 4, structured.distributor ? { tier: structured.distributor.tier } : undefined);
    // De-dupe by chunk_id, cap at 5 for the evidence panel.
    const seen = new Set<string>();
    chunks = chunks.filter((c) => (seen.has(c.chunk_id) ? false : (seen.add(c.chunk_id), true))).slice(0, 5);
  }
  trace.push({ step: "Vector retrieval", detail: chunks.length > 0 ? `${chunks.length} policy chunk(s) retrieved.` : "No policy chunks retrieved for this question." });

  // Step 5 — deterministic rules
  const contract = structured.distributor ? findContractByDistributor(structured.distributor.id) : null;
  const { rules, decision } = runRules({
    distributor: structured.distributor,
    contract,
    invoice: structured.invoice,
    product: structured.product,
    returnRecord: structured.returnRecord,
    existingCreditMemos: structured.existingCreditMemos,
  });
  trace.push({ step: "Rules engine", detail: `${rules.length} rule(s) evaluated. ${decision ? decision.headline : "No return to evaluate."}` });

  const citations: Citation[] = [...structured.citations];
  for (const c of chunks) citations.push({ label: `${c.title} ${c.section}`, type: "policy" });
  if (contract) citations.push({ label: contract.id, type: "contract" });

  const notFoundNote = structured.notFound.length > 0 ? structured.notFound.join("; ") : undefined;

  // Routing section for the evidence panel — honest about what actually ran.
  // The rules engine is unconditional in this implementation (see its call
  // site above), so it is labeled "always runs" rather than presented as a
  // routed decision. Structured retrieval and the knowledge graph are real,
  // conditional routing decisions: they only run when the question actually
  // names something to look up.
  const graphInvoked = graphNodes.length > 0;
  const routing: RoutingDecision[] = [
    {
      mechanism: "Structured retrieval",
      invoked: needsStructured,
      always: false,
      reason: needsStructured
        ? structured.invoice
          ? `Looked up ${structured.invoice.id} and related records.`
          : structured.distributor
            ? `Looked up ${structured.distributor.name}'s records.`
            : "Attempted, but no matching distributor, invoice, or product was found."
        : "Skipped: no distributor, invoice, or product was named to look up.",
    },
    {
      mechanism: "Knowledge graph",
      invoked: graphInvoked,
      always: false,
      reason: graphInvoked
        ? `Resolved which policy applies via ${structured.distributor ? structured.distributor.name : structured.product?.id ?? "the resolved entity"}.`
        : "Skipped: no distributor or product was resolved to trace a policy through.",
    },
    {
      mechanism: "Vector RAG",
      invoked: chunks.length > 0,
      always: false,
      reason: chunks.length > 0
        ? `Retrieved ${chunks.length} policy chunk(s) relevant to a ${entities.intent.replace(/_/g, " ")} question.`
        : vectorAttempted
          ? "Attempted, but no policy chunk scored above zero similarity for this question."
          : "Skipped: this question does not require policy text (e.g. a specific invoice-status lookup).",
    },
    {
      mechanism: "Rules engine",
      invoked: true,
      always: true,
      reason: decision
        ? "Runs on every question. A specific return was present to evaluate."
        : "Runs on every question, but no specific return was present, so it produced no decision.",
    },
  ];

  const evidence: EvidenceBundle = {
    retrievalFlags: flags,
    entities,
    transactions: {
      distributor: structured.distributor,
      invoice: structured.invoice,
      salesOrder: structured.salesOrder,
      returnRecord: structured.returnRecord,
      existingCreditMemos: structured.existingCreditMemos,
      product: structured.product,
      notFoundNote,
    },
    graphPath: { nodes: graphNodes, edges: graphEdges },
    retrievedChunks: chunks,
    rules,
    decision,
    trace,
    citations,
    routing,
  };

  // Step 6 — LLM synthesis
  const client = getClient();
  let answer: string;
  if (!client) {
    answer = templatedFallbackAnswer(evidence);
    trace.push({ step: "LLM synthesis", detail: "No ANTHROPIC_API_KEY configured — used a templated response built directly from the evidence." });
  } else {
    try {
      const contextBlock = buildContextBlock(evidence);
      const response = await client.messages.create({
        model: LLM_MODEL,
        max_tokens: 600,
        system: GUARDRAILS,
        messages: [
          {
            role: "user",
            content: `Customer question: "${message}"\n\nRetrieved evidence:\n${contextBlock}\n\nWrite the customer-service response now.`,
          },
        ],
      });
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      answer = textBlock?.text.trim() || templatedFallbackAnswer(evidence);
      trace.push({ step: "LLM synthesis", detail: "Response generated from retrieved evidence and the rules engine decision." });
    } catch {
      answer = templatedFallbackAnswer(evidence);
      trace.push({ step: "LLM synthesis", detail: "LLM call failed — used a templated response built directly from the evidence." });
    }
  }

  return { answer, evidence };
}

// ─────────────────────────────────────────────────────────────────────────
// Vector-only comparison pipeline (Priority 5).
//
// A deliberately degraded pipeline for the "Hybrid vs Vector-only" toggle:
// no structured retrieval, no knowledge graph, no rules engine. Only the
// same Vector RAG index feeds the LLM. This is a real, separate LLM call
// with a different system prompt, not a simulated or hand-scripted answer —
// whatever it produces, correct or not, is what actually comes back.
// ─────────────────────────────────────────────────────────────────────────

const VECTOR_ONLY_SYSTEM_PROMPT = `You are a customer-service assistant for Supercharged Battery Co., a company that sells automotive batteries through independent distributors.

Answer the customer's question using ONLY the retrieved policy text below. You do NOT have access to structured transaction records (invoices, sales orders, returns, credit memos) and you do NOT have access to a knowledge graph that resolves which specific policy applies to this distributor's tier or contract.

If the question needs a specific number, date, or eligibility decision that depends on that missing information, answer as best you can from the policy text and general reasoning, and say plainly that you have not verified it against actual records. Do not pretend you looked anything up. Write in plain, direct sentences without em dashes.`;

const VECTOR_ONLY_MISSING_CALLOUTS = [
  "No exact invoice, order, or return data available: any amount, date, or quantity in this answer is not verified against real records.",
  "Policy selected by text similarity, not by the distributor's actual tier or contract: this may be the wrong policy for this specific distributor.",
  "No rules engine ran: eligibility, refund amount, and approval requirements above are not verified.",
];

export async function answerVectorOnly(message: string): Promise<VectorOnlyResult> {
  const chunks = retrievePolicyChunks(message, 4);
  const client = getClient();

  if (!client) {
    const answer = chunks.length > 0
      ? `Based on retrieved policy text only, no live records checked:\n\n${chunks.map((c) => `${c.title} ${c.section}: ${c.text}`).join("\n\n")}`
      : "No policy text was retrieved for this question, and no live records were checked.";
    return { answer, chunks, missingCallouts: VECTOR_ONLY_MISSING_CALLOUTS };
  }

  const chunkText = chunks.length > 0
    ? chunks.map((c) => `[${c.title} ${c.section}] ${c.text}`).join("\n\n")
    : "(No policy text matched this question.)";

  try {
    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 500,
      system: VECTOR_ONLY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Customer question: "${message}"\n\nRetrieved policy text:\n${chunkText}\n\nWrite the response now.`,
        },
      ],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const answer = textBlock?.text.trim() || "The model did not return a response.";
    return { answer, chunks, missingCallouts: VECTOR_ONLY_MISSING_CALLOUTS };
  } catch {
    return {
      answer: "The vector-only pipeline failed to generate a response.",
      chunks,
      missingCallouts: VECTOR_ONLY_MISSING_CALLOUTS,
    };
  }
}
