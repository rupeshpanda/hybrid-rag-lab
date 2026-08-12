import { NextResponse } from "next/server";
import { buildDataSnapshot } from "../../../../../lib/hybrid-rag/data-view";

// Read-only, no rate limiting needed: this returns the same static synthetic
// dataset to every visitor, it's not an LLM call.
export async function GET() {
  return NextResponse.json(buildDataSnapshot());
}
