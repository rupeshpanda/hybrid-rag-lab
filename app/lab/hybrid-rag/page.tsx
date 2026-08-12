import type { Metadata } from "next";
import HybridRagLab from "../../../components/hybrid-rag/HybridRagLab";

export const metadata: Metadata = {
  title: "Enterprise Hybrid RAG — Elegance AI",
  description:
    "See how an AI customer-service agent combines enterprise data, Vector RAG, a lightweight knowledge graph, and deterministic rules to resolve complex distributor returns for a fictional battery company.",
  openGraph: {
    title: "Enterprise Hybrid RAG",
    description:
      "A customer-service agent for Supercharged Battery Co. combines structured enterprise data, Vector RAG, a lightweight knowledge graph, and deterministic rules to resolve distributor returns.",
    type: "article",
  },
};

export default function HybridRagPage() {
  return <HybridRagLab />;
}
