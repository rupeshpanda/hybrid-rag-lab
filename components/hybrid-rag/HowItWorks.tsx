"use client";

import Link from "next/link";
import { SAP_MAPPING } from "../../lib/hybrid-rag/sap-mapping";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
      {children}
    </div>
  );
}

const RAG_PATTERNS = [
  {
    name: "Vector RAG",
    used: true,
    usedFor: "policy document retrieval, via a TF-IDF similarity index",
    body: "Rank passages by similarity to the question rather than exact keyword match. A question about a return policy retrieves the passages of policy text closest in meaning, even if the exact words differ.",
  },
  {
    name: "Metadata-Filtered RAG",
    used: true,
    usedFor: "narrowing candidate chunks by tier, region, and policy type before ranking",
    body: "Semantic retrieval filtered first by structured metadata: distributor tier, region, or policy type, so the search only ranks the chunks that could actually apply.",
  },
  {
    name: "Hybrid Search RAG",
    used: false,
    body: "Semantic retrieval plus a separate traditional keyword index, useful when exact terms (a SKU, a policy name) need to match as much as meaning does. This lab's single TF-IDF index already blends term overlap into its similarity score, but there is no separate keyword-index layer alongside it.",
  },
  {
    name: "Structured RAG",
    used: true,
    usedFor: "invoices, sales orders, returns, and credit memos, looked up by ID",
    body: "Retrieve exact information from structured sources, like an invoice amount, a quantity, or a date, by lookup, not by similarity.",
  },
  {
    name: "Graph RAG",
    used: true,
    usedFor: "resolving which policy applies to a distributor's tier and contract, or a product's warranty",
    body: "Retrieve knowledge through relationships between entities: a distributor connects to a contract, which connects to a policy.",
  },
  {
    name: "Agentic RAG",
    used: true,
    usedFor: "the router choosing which retrieval mechanisms a given question actually needs",
    body: "The LLM chooses and combines multiple retrieval mechanisms depending on the question, rather than always running the same fixed retrieval step.",
  },
];

const BROKEN_WITHOUT = [
  { layer: "Structured retrieval", breaks: "The model invents invoice amounts, dates, and quantities instead of looking them up." },
  { layer: "Knowledge graph", breaks: "The wrong tier's policy gets applied. Similarity picks a plausible-sounding policy, not the contracted one." },
  { layer: "Rules engine", breaks: "The model can approve a return that fails the eligibility rules, or state a refund amount it never actually calculated." },
  { layer: "Vector RAG", breaks: "The model paraphrases policy from training-data memory instead of citing the actual, current policy text." },
];

const ONTOLOGY_EDGES = [
  { s: "Distributor", r: "HAS_CONTRACT", t: "Contract" },
  { s: "Contract", r: "USES_POLICY", t: "Policy" },
  { s: "SalesOrder", r: "CONTAINS", t: "Product" },
];

export default function HowItWorks() {
  return (
    <main style={{ background: "var(--bg)", color: "var(--ink)", minHeight: "100vh", paddingBottom: 60 }}>
      <div style={{ borderBottom: "1px solid var(--border)", padding: "12px 24px", fontSize: "0.82rem", color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <a href="https://eleganceai.ai" style={{ color: "var(--muted)", textDecoration: "none" }}>Home</a>
        <span>/</span>
        <a href="https://eleganceai.ai/lab" style={{ color: "var(--muted)", textDecoration: "none" }}>Lab</a>
        <span>/</span>
        <Link href="/lab/hybrid-rag" style={{ color: "var(--muted)", textDecoration: "none" }}>Enterprise Hybrid RAG</Link>
        <span>/</span>
        <span style={{ color: "var(--ink)" }}>How It Works</span>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "52px 24px 32px" }}>
        <SectionLabel>How It Works</SectionLabel>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.8rem, 4vw, 2.5rem)", color: "var(--navy)", lineHeight: 1.2, marginBottom: 16 }}>
          An LLM is not an enterprise system of record
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--muted)", lineHeight: 1.75 }}>
          Structured retrieval provides exact facts. Vector RAG retrieves relevant knowledge. Ontology
          defines what enterprise concepts mean. A knowledge graph connects those concepts. Graph RAG
          retrieves the relationships relevant to the question. Deterministic rules protect critical
          business decisions. The LLM brings all of this context together and turns it into a useful
          customer-service response.
        </p>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* What an LLM knows */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>1. What an LLM knows</SectionLabel>
        <p style={{ fontSize: "0.95rem", color: "var(--muted)", lineHeight: 1.75 }}>
          A large language model contains broad, learned knowledge from its training data. It does not
          automatically know today&rsquo;s enterprise transactions, a specific customer&rsquo;s contract
          terms, the latest policy revisions, an invoice&rsquo;s payment status, or anything sitting in an
          internal SAP or CRM system. Ask it about a real invoice and, left alone, it will either say it
          doesn&rsquo;t know, or, worse, guess.
        </p>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* What is RAG */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>2. What is RAG?</SectionLabel>
        <p style={{ fontSize: "0.95rem", color: "var(--muted)", lineHeight: 1.75, marginBottom: 24 }}>
          Retrieval-Augmented Generation closes that gap: before the model answers, the system retrieves
          relevant knowledge and hands it to the model as context.
        </p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {["Question", "Retrieve relevant enterprise knowledge", "Give question + retrieved knowledge to the LLM", "Generate a grounded response"].map((step, i, arr) => (
            <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 18px", background: "var(--card)", fontSize: "0.9rem", textAlign: "center", maxWidth: 420 }}>
                {step}
              </div>
              {i < arr.length - 1 && <span style={{ color: "var(--muted)" }}>↓</span>}
            </div>
          ))}
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* Six RAG patterns */}
      <section id="retrieval-patterns" style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>3. Six retrieval patterns, one agent</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.35rem", color: "var(--navy)", marginBottom: 20 }}>
          Different knowledge should be retrieved differently
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {RAG_PATTERNS.map((p) => (
            <div key={p.name} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 20, background: "var(--card)" }}>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--navy)", marginBottom: 6 }}>{p.name}</div>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: p.used ? "var(--accent)" : "var(--muted)", marginBottom: 10 }}>
                {p.used ? `Used in this lab: ${p.usedFor}` : "Not used in this lab"}
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.65, margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* What breaks without each layer */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>What breaks without each layer</SectionLabel>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem", minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 600 }}>Remove this</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "var(--muted)", fontWeight: 600 }}>What goes wrong</th>
              </tr>
            </thead>
            <tbody>
              {BROKEN_WITHOUT.map((row) => (
                <tr key={row.layer} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--navy)", whiteSpace: "nowrap" }}>{row.layer}</td>
                  <td style={{ padding: "10px 12px", color: "var(--ink)" }}>{row.breaks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* Ontology */}
      <section id="ontology" style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>4. What is an ontology?</SectionLabel>
        <p style={{ fontSize: "0.95rem", color: "var(--muted)", lineHeight: 1.75, marginBottom: 20 }}>
          An ontology defines the important things in a business and how those things relate to one
          another. It gives business meaning to otherwise disconnected records.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ONTOLOGY_EDGES.map((e) => (
            <div key={e.s + e.r} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.88rem", fontFamily: "var(--font-mono, monospace)" }}>
              <span style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", background: "var(--card)" }}>{e.s}</span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>{e.r}</span>
              <span style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", background: "var(--card)" }}>{e.t}</span>
            </div>
          ))}
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* Ontology -> graph -> graph rag */}
      <section style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>5. Ontology → Knowledge Graph → Graph RAG</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { title: "Ontology", body: "What kinds of things exist, and how can they relate?" },
            { title: "Knowledge Graph", body: "Here are the actual entities and relationships: Dallas Power Distributors, Contract C-004, Gold Tier." },
            { title: "Graph RAG", body: "Retrieve the relationships relevant to this question, such as which policy applies to this distributor." },
            { title: "LLM", body: "Reason over the retrieved context and explain the outcome." },
          ].map((s, i, arr) => (
            <div key={s.title} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 20px", background: "var(--card)", textAlign: "center", maxWidth: 480 }}>
                <div style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{s.body}</div>
              </div>
              {i < arr.length - 1 && <span style={{ color: "var(--muted)" }}>↓</span>}
            </div>
          ))}
        </div>
        <p style={{ marginTop: 24, fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.7 }}>
          In this lab: Dallas Power Distributors → Contract C-004 → Gold tier → Gold Distributor Return
          Policy, and AGM-100 → AGM Battery Warranty Policy. See it live on the{" "}
          <Link href="/lab/hybrid-rag#interactive-lab" style={{ color: "var(--accent)", fontWeight: 600 }}>Graph tab</Link> of the evidence panel.
        </p>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* SAP connection */}
      <section id="sap-mapping" style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>6. Where this connects to SAP</SectionLabel>
        <p style={{ fontSize: "0.95rem", color: "var(--muted)", lineHeight: 1.75, marginBottom: 24 }}>
          This lab intentionally simplifies a real enterprise architecture. In production, the equivalent
          retrieval layer might reach into S/4HANA, Salesforce, SharePoint, a contracts repository, a data
          warehouse, and a real graph database.
        </p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ border: "1px solid var(--accent)", borderRadius: 10, padding: "10px 18px", fontSize: "0.9rem", fontWeight: 600, color: "var(--accent)" }}>Enterprise AI Agent</div>
          <span style={{ color: "var(--muted)" }}>↓</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 12, width: "100%", maxWidth: 620 }}>
            {["SAP Data", "Vector RAG", "Knowledge Graph"].map((s) => (
              <div key={s} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", background: "var(--card)", fontSize: "0.85rem", textAlign: "center" }}>{s}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 12, width: "100%", maxWidth: 620 }}>
            {["Transactions", "Policies", "Relationships"].map((s) => (
              <div key={s} style={{ fontSize: "0.78rem", color: "var(--muted)", textAlign: "center" }}>{s}</div>
            ))}
          </div>
          <span style={{ color: "var(--muted)" }}>↓</span>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 18px", fontSize: "0.9rem", background: "var(--card)" }}>LLM</div>
          <span style={{ color: "var(--muted)" }}>↓</span>
          <div style={{ border: "1px solid var(--gold)", borderRadius: 10, padding: "10px 18px", fontSize: "0.9rem", fontWeight: 600, color: "var(--gold)" }}>Customer Answer</div>
        </div>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {SAP_MAPPING.map((m) => (
            <div key={m.entity} style={{ fontSize: "0.78rem", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>{m.entity}</span> → {m.sapEquivalent}
            </div>
          ))}
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      <section style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 0" }}>
        <Link href="/lab/hybrid-rag" style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
          ← Back to the interactive lab
        </Link>
      </section>
    </main>
  );
}
