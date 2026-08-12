import type { Metadata } from "next";
import EvalsView from "../../../../components/hybrid-rag/EvalsView";
import { EVAL_SCENARIOS } from "../../../../lib/hybrid-rag/evals";

export const metadata: Metadata = {
  title: "Evals — Enterprise Hybrid RAG — Elegance AI",
  description: "Ten evaluation scenarios exercising the Enterprise Hybrid RAG retrieval and rules pipeline.",
  robots: { index: false },
};

export default function EvalsPage() {
  const scenarios = EVAL_SCENARIOS.map((s) => ({ id: s.id, title: s.title, question: s.question }));
  return <EvalsView scenarios={scenarios} />;
}
