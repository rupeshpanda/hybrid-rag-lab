import { NextRequest, NextResponse } from "next/server";
import { answerCustomerQuery } from "../../../../../lib/hybrid-rag/agent";
import { clientIp, rateLimit } from "../../../../../lib/rateLimit";

export const maxDuration = 60;

const REQUESTS_PER_MINUTE = 20;

export async function POST(req: NextRequest) {
  if (!rateLimit(clientIp(req), REQUESTS_PER_MINUTE)) {
    return NextResponse.json({ error: "Too many requests — please wait a minute." }, { status: 429 });
  }

  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Missing message." }, { status: 400 });
    }
    if (message.length > 1000) {
      return NextResponse.json({ error: "Message too long." }, { status: 400 });
    }

    const result = await answerCustomerQuery(message.trim());
    return NextResponse.json(result);
  } catch (err) {
    console.error("Hybrid RAG query route error:", err);
    return NextResponse.json({ error: "Failed to process the request." }, { status: 500 });
  }
}
