import { NextRequest, NextResponse } from "next/server";
import { runEvals } from "../../../../../lib/hybrid-rag/evals";
import { clientIp, rateLimit } from "../../../../../lib/rateLimit";

export const maxDuration = 60;

const REQUESTS_PER_MINUTE = 6;

export async function GET(req: NextRequest) {
  if (!rateLimit(clientIp(req), REQUESTS_PER_MINUTE)) {
    return NextResponse.json({ error: "Too many requests — please wait a minute." }, { status: 429 });
  }

  try {
    const result = await runEvals();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Hybrid RAG evals route error:", err);
    return NextResponse.json({ error: "Failed to run evaluations." }, { status: 500 });
  }
}
