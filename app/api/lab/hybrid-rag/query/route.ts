import { NextRequest, NextResponse } from "next/server";
import { answerCustomerQuery, answerVectorOnly } from "../../../../../lib/hybrid-rag/agent";
import { clientIp, rateLimit } from "../../../../../lib/rateLimit";

export const maxDuration = 60;

const REQUESTS_PER_MINUTE = 20;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  try {
    const { message, compareMode } = await req.json();
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Missing message." }, { status: 400 });
    }
    if (message.length > 1000) {
      return NextResponse.json({ error: "Message too long." }, { status: 400 });
    }

    // Comparison mode runs two LLM pipelines (hybrid + vector-only) per
    // question, so it consumes two slots of the per-IP rate limit.
    const slotsNeeded = compareMode ? 2 : 1;
    for (let i = 0; i < slotsNeeded; i++) {
      if (!rateLimit(ip, REQUESTS_PER_MINUTE)) {
        return NextResponse.json({ error: "Too many requests — please wait a minute." }, { status: 429 });
      }
    }

    const trimmed = message.trim();

    if (compareMode) {
      const [hybrid, vectorOnly] = await Promise.all([answerCustomerQuery(trimmed), answerVectorOnly(trimmed)]);
      return NextResponse.json({ hybrid, vectorOnly });
    }

    const result = await answerCustomerQuery(trimmed);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Hybrid RAG query route error:", err);
    return NextResponse.json({ error: "Failed to process the request." }, { status: 500 });
  }
}
