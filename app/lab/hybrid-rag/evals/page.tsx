import type { Metadata } from "next";
import EvalsView from "../../../../components/hybrid-rag/EvalsView";

export const metadata: Metadata = {
  title: "Evals — Enterprise Hybrid RAG — Elegance AI",
  description: "Ten evaluation scenarios exercising the Enterprise Hybrid RAG retrieval and rules pipeline.",
  robots: { index: false },
};

export default function EvalsPage() {
  return <EvalsView />;
}
