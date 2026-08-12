// ─────────────────────────────────────────────────────────────────────────
// Intent + entity extraction and the retrieval router.
//
// The LLM reads the raw customer-service question and returns structured
// entities plus which retrieval mechanisms are needed. A heuristic fallback
// (regex + keyword matching over the known distributor/product lists) keeps
// the lab usable without an API key, mirroring the other Elegance AI labs.
// ─────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedEntities, RetrievalFlags } from "./types";
import { distributors, products } from "./data";

export const LLM_PROVIDER = process.env.LLM_PROVIDER || "anthropic";
export const LLM_MODEL = process.env.LLM_MODEL || "claude-haiku-4-5-20251001";

let _client: Anthropic | null = null;
export function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const ROUTER_TOOL: Anthropic.Tool = {
  name: "route_query",
  description: "Classify a customer-service question about Supercharged Battery Co. distributor returns and extract the entities needed to answer it.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["process_return", "policy_question", "invoice_status", "warranty_question", "approval_question", "general"],
        description: "process_return: evaluate/process a specific return. policy_question: what does a policy say, or compare policies. invoice_status: facts about a specific invoice (amount, credited?). warranty_question: is a specific unit covered. approval_question: does a refund need manager approval. general: anything else.",
      },
      distributor_name: { type: ["string", "null"], description: "Distributor name as mentioned, or null." },
      invoice_id: { type: ["string", "null"], description: "Invoice number like INV-1048, or null." },
      product_id: { type: ["string", "null"], description: "Product SKU like AGM-100 if mentioned or inferable, or null." },
      quantity: { type: ["number", "null"], description: "Quantity mentioned, or null." },
      condition: { type: ["string", "null"], description: "unopened, installed, defective, or null." },
      reason: { type: ["string", "null"], description: "Stated reason for the return, or null." },
      needs_structured: { type: "boolean", description: "True if the answer requires exact transaction facts (invoice, order, quantity, refund history)." },
      needs_vector: { type: "boolean", description: "True if the answer requires retrieving policy text." },
      needs_graph: { type: "boolean", description: "True if the answer requires knowing which policy applies to a distributor or product via its tier/contract/warranty relationships." },
    },
    required: ["intent", "distributor_name", "invoice_id", "product_id", "quantity", "condition", "reason", "needs_structured", "needs_vector", "needs_graph"],
  },
};

const SYSTEM_PROMPT = `You are the intent and entity extraction step of a customer-service agent for Supercharged Battery Co., a company that sells automotive batteries through independent distributors. Extract exactly what is stated or clearly implied in the question. Do not invent distributor names, invoice numbers, or quantities that are not mentioned.`;

export type RouteResult = { entities: ExtractedEntities; flags: RetrievalFlags };

export async function routeQuery(message: string): Promise<RouteResult> {
  const client = getClient();
  if (!client) return heuristicRoute(message);

  try {
    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
      tools: [ROUTER_TOOL],
      tool_choice: { type: "tool", name: "route_query" },
    });
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) return heuristicRoute(message);
    const input = toolUse.input as Record<string, unknown>;
    return {
      entities: {
        intent: String(input.intent ?? "general"),
        distributor_name: (input.distributor_name as string) ?? null,
        distributor_id: null,
        invoice_id: (input.invoice_id as string) ?? null,
        product_id: (input.product_id as string) ?? null,
        quantity: (input.quantity as number) ?? null,
        condition: (input.condition as string) ?? null,
        reason: (input.reason as string) ?? null,
      },
      flags: {
        structured: Boolean(input.needs_structured),
        vector: Boolean(input.needs_vector),
        graph: Boolean(input.needs_graph),
      },
    };
  } catch {
    return heuristicRoute(message);
  }
}

/** Regex + keyword fallback used when no ANTHROPIC_API_KEY is configured. */
function heuristicRoute(message: string): RouteResult {
  const lower = message.toLowerCase();

  const distributor = distributors.find((d) => lower.includes(d.name.toLowerCase()));
  const invoiceMatch = message.match(/INV-\d{3,5}/i);
  const product = products.find((p) => lower.includes(p.id.toLowerCase()) || lower.includes(p.name.toLowerCase()));
  const qtyMatch = message.match(/(\d+)\s*(units?|batteries|agm|std|hd|marine)/i);

  let condition: string | null = null;
  if (lower.includes("unopened") && (lower.includes("install") || lower.includes("defective"))) condition = "mixed";
  else if (lower.includes("unopened")) condition = "unopened";
  else if (lower.includes("install") || lower.includes("defective") || lower.includes("failed")) condition = "installed_defective";

  let intent = "general";
  if (lower.includes("return") || lower.includes("refund") && (lower.includes("process") || lower.includes("accept"))) intent = "process_return";
  if (lower.includes("approval") || lower.includes("without manager")) intent = "approval_question";
  else if (lower.includes("warranty") || lower.includes("covered")) intent = "warranty_question";
  else if (lower.includes("credit") || lower.includes("already") || lower.includes("status of invoice")) intent = "invoice_status";
  else if (lower.includes("policy") && (lower.includes("different") || lower.includes("compare") || lower.includes("what is"))) intent = "policy_question";
  else if (lower.includes("return") || lower.includes("refund")) intent = "process_return";

  return {
    entities: {
      intent,
      distributor_name: distributor?.name ?? null,
      distributor_id: distributor?.id ?? null,
      invoice_id: invoiceMatch ? invoiceMatch[0].toUpperCase() : null,
      product_id: product?.id ?? null,
      quantity: qtyMatch ? Number(qtyMatch[1]) : null,
      condition,
      reason: null,
    },
    flags: {
      structured: true,
      vector: true,
      graph: true,
    },
  };
}
