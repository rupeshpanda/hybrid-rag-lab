import type { Metadata } from "next";
import HowItWorks from "../../../../components/hybrid-rag/HowItWorks";

export const metadata: Metadata = {
  title: "How It Works — Enterprise Hybrid RAG — Elegance AI",
  description:
    "How structured retrieval, Vector RAG, ontology, knowledge graphs, and deterministic rules combine into a grounded enterprise agent.",
};

export default function HowItWorksPage() {
  return <HowItWorks />;
}
