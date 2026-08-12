"use client";

import { useRef, useState } from "react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────
// Types (mirrors lib/hybrid-rag/types.ts — kept local so the client bundle
// doesn't pull in the server-only retrieval modules).
// ─────────────────────────────────────────────────────────────────────────

type Distributor = { id: string; name: string; tier: string; region: string; since: string; primary_contact: string };
type Product = { id: string; name: string; category: string; unit_price: number; warranty_months: number; status: string };
type Invoice = { id: string; sales_order_id: string; distributor_id: string; product_id: string; quantity: number; unit_price: number; amount: number; invoice_date: string; payment_status: string };
type SalesOrder = { id: string; distributor_id: string; product_id: string; quantity: number; unit_price: number; order_date: string };
type ReturnUnit = { condition: string; quantity: number; installed_date?: string; reported_issue?: string };
type ReturnRecord = { id: string; distributor_id: string; invoice_id: string | null; product_id: string; quantity_returned: number; units: ReturnUnit[]; reason: string; request_date: string; recorded_status: string; credit_memo_id: string | null };
type CreditMemo = { id: string; return_id: string; invoice_id: string; distributor_id: string; amount: number; issued_date: string };
type PolicyChunk = { chunk_id: string; document: string; title: string; section: string; text: string; policy_type: string; tier: string; region: string; score: number };
type GraphEdge = { source: string; source_label: string; relationship: string; target: string; target_label: string };
type GraphPathNode = { id: string; label: string; type: string };
type RuleCheck = { id: string; label: string; passed: boolean; detail: string };
type UnitOutcome = { condition: string; quantity: number; outcome: string; detail: string };
type Decision = { status: string; headline: string; refund_amount: number; restocking_fee_applied_pct: number; warranty_units: number; approval_required: boolean; approval_threshold_usd: number | null; unit_outcomes: UnitOutcome[] };
type TraceStep = { step: string; detail: string };
type Citation = { label: string; type: string };
type ExtractedEntities = { intent: string; distributor_name: string | null; invoice_id: string | null; product_id: string | null; quantity: number | null; condition: string | null; reason: string | null };

type EvidenceBundle = {
  retrievalFlags: { structured: boolean; vector: boolean; graph: boolean };
  entities: ExtractedEntities;
  transactions: {
    distributor: Distributor | null;
    invoice: Invoice | null;
    salesOrder: SalesOrder | null;
    returnRecord: ReturnRecord | null;
    existingCreditMemos: CreditMemo[];
    product: Product | null;
    notFoundNote?: string;
  };
  graphPath: { nodes: GraphPathNode[]; edges: GraphEdge[] };
  retrievedChunks: PolicyChunk[];
  rules: RuleCheck[];
  decision: Decision | null;
  trace: TraceStep[];
  citations: Citation[];
};

type QueryResult = { answer: string; evidence: EvidenceBundle };

type Turn = {
  id: string;
  question: string;
  status: "loading" | "done" | "error";
  result: QueryResult | null;
  errorMessage?: string;
};

const SUGGESTED_QUESTIONS = [
  { label: "Complex Return", text: "Dallas Power Distributors wants to return 12 AGM batteries from invoice INV-1048. Eight are unopened and four are defective after installation. What should we do?" },
  { label: "Policy Comparison", text: "How is the return policy for Dallas Power Distributors different from Metro Auto Supply?" },
  { label: "Approval", text: "Can we refund invoice INV-1092 without manager approval?" },
  { label: "Warranty", text: "A customer installed an AGM-100 battery 14 months ago and says it has failed. Is it covered?" },
  { label: "Invoice Question", text: "Has invoice INV-1037 already received a credit?" },
];

const TECH_BADGES = ["Claude", "Structured Retrieval", "Vector RAG", "Knowledge Graph", "Deterministic Rules"];

const EVIDENCE_TABS = ["Transaction", "Graph", "Retrieved Knowledge", "Rules", "Decision"] as const;
type EvidenceTab = (typeof EVIDENCE_TABS)[number];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    approved: { bg: "var(--success-bg)", fg: "var(--success)", label: "Approved" },
    partial_approved: { bg: "var(--warning-bg)", fg: "var(--warning)", label: "Partially approved" },
    rejected: { bg: "var(--danger-bg)", fg: "var(--danger)", label: "Rejected" },
    pending_manager_approval: { bg: "var(--warning-bg)", fg: "var(--warning)", label: "Pending manager approval" },
    info_unavailable: { bg: "var(--bg-secondary)", fg: "var(--muted)", label: "Information unavailable" },
  };
  const s = map[status] ?? { bg: "var(--bg-secondary)", fg: "var(--muted)", label: status };
  return (
    <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.03em", padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: "0.86rem", color: "var(--ink)", wordBreak: "break-word" }}>{value ?? "—"}</div>
    </div>
  );
}

export default function HybridRagLab() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("Transaction");
  const [showTrace, setShowTrace] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const latestTurn = [...turns].reverse().find((t) => t.status === "done" && t.result);
  const evidence = latestTurn?.result?.evidence ?? null;

  async function runQuery(question: string) {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;

    setTurns((prev) => [...prev, { id, question: trimmed, status: "loading", result: null }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/lab/hybrid-rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, status: "done", result: data as QueryResult } : t)));
      setActiveTab("Decision");
    } catch (err) {
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "error", errorMessage: err instanceof Error ? err.message : "Something went wrong." } : t))
      );
    } finally {
      setSending(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }

  function reset() {
    setTurns([]);
    setActiveTab("Transaction");
  }

  return (
    <main style={{ background: "var(--bg)", color: "var(--ink)", minHeight: "100vh", paddingBottom: 60 }}>
      {/* Breadcrumb */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "12px 24px", fontSize: "0.82rem", color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <a href="https://eleganceai.ai" style={{ color: "var(--muted)", textDecoration: "none" }}>Home</a>
        <span>/</span>
        <a href="https://eleganceai.ai/lab" style={{ color: "var(--muted)", textDecoration: "none" }}>Lab</a>
        <span>/</span>
        <span style={{ color: "var(--ink)" }}>Enterprise Hybrid RAG</span>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "52px 24px 32px" }}>
        <SectionLabel>Elegance AI Enterprise Lab · Supercharged Battery Co.</SectionLabel>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.9rem, 4.2vw, 2.7rem)", color: "var(--navy)", lineHeight: 1.18, marginBottom: 16 }}>
          Enterprise Hybrid RAG
        </h1>
        <p style={{ fontSize: "1.05rem", color: "var(--muted)", lineHeight: 1.75, maxWidth: 720, marginBottom: 24 }}>
          See how an AI customer-service agent combines enterprise data, Vector RAG, ontology and Graph RAG
          to resolve complex distributor returns for a fictional automotive-battery company. Ask a question
          below and watch exactly which knowledge the agent retrieves, and why, before it answers.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
          {TECH_BADGES.map((tag) => (
            <span key={tag} style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", padding: "3px 10px", borderRadius: 20, border: "1px solid var(--gold)", color: "var(--gold)" }}>
              {tag}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="#interactive-lab" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px" }}>
            Try the lab →
          </a>
          <a href="#architecture" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px" }}>
            See the architecture →
          </a>
          <Link href="/lab/hybrid-rag/how-it-works" style={{ fontSize: "0.85rem", fontWeight: 600, color: "white", textDecoration: "none", background: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 8, padding: "8px 16px" }}>
            How it works →
          </Link>
          <Link href="/lab/hybrid-rag/evals" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 16px" }}>
            Eval scenarios →
          </Link>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* Interactive lab */}
      <section id="interactive-lab" style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>Interactive lab</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", color: "var(--navy)", marginBottom: 20 }}>
          Ask the Customer Service Returns Agent
        </h2>

        <div className="hybrid-rag-grid">
          {/* Chat panel */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
                Supercharged Battery Co.
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--navy)", marginTop: 4 }}>Customer Service Returns Agent</div>
              <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Synthetic distributor data · simulated</div>
            </div>

            <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column", gap: 16, maxHeight: 520, overflowY: "auto" }}>
              {turns.length === 0 && (
                <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Ask about a return, refund, warranty, or policy, or click a suggestion below.</p>
              )}
              {turns.map((t) => (
                <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ alignSelf: "flex-end", maxWidth: "92%", background: "var(--bg-secondary)", borderRadius: 10, padding: "8px 12px", fontSize: "0.88rem" }}>
                    {t.question}
                  </div>
                  {t.status === "loading" && (
                    <div style={{ fontSize: "0.82rem", color: "var(--muted)", display: "flex", alignItems: "center" }}>
                      <span className="live-dot" /> Retrieving evidence…
                    </div>
                  )}
                  {t.status === "error" && <div style={{ fontSize: "0.85rem", color: "var(--danger)" }}>{t.errorMessage}</div>}
                  {t.status === "done" && t.result && (
                    <div style={{ fontSize: "0.88rem", color: "var(--ink)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{t.result.answer}</div>
                  )}
                  {t.status === "done" && t.result && t.result.evidence.citations.length > 0 && (
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      Sources: {t.result.evidence.citations.slice(0, 6).map((c) => c.label).join(" · ")}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => runQuery(q.text)}
                    disabled={sending}
                    title={q.text}
                    style={{ fontSize: "0.72rem", padding: "4px 10px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted)", cursor: sending ? "default" : "pointer" }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); runQuery(input); }} style={{ display: "flex", gap: 8 }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about a return, refund, invoice, or policy…"
                  disabled={sending}
                  style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: "0.88rem", background: "var(--bg)", color: "var(--ink)" }}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  style={{ fontSize: "0.85rem", fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "white", cursor: sending ? "default" : "pointer", opacity: sending || !input.trim() ? 0.6 : 1 }}
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={sending || turns.length === 0}
                  style={{ fontSize: "0.85rem", padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}
                >
                  Reset
                </button>
              </form>
            </div>
          </div>

          {/* Evidence panel */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>
                Grounding / Evidence
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--navy)", marginTop: 4 }}>What the agent actually retrieved</div>
            </div>

            {!evidence ? (
              <div style={{ padding: 24, fontSize: "0.85rem", color: "var(--muted)" }}>
                Ask a question to see structured facts, the knowledge-graph path, retrieved policy text, rule
                checks, and the final decision.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
                  {EVIDENCE_TABS.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        flex: "1 1 auto",
                        padding: "10px 8px",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        border: "none",
                        borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                        background: "none",
                        color: activeTab === tab ? "var(--accent)" : "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div style={{ padding: 20, maxHeight: 480, overflowY: "auto" }}>
                  {activeTab === "Transaction" && <TransactionTab evidence={evidence} />}
                  {activeTab === "Graph" && <GraphTab evidence={evidence} />}
                  {activeTab === "Retrieved Knowledge" && <PolicyTab evidence={evidence} />}
                  {activeTab === "Rules" && <RulesTab evidence={evidence} />}
                  {activeTab === "Decision" && <DecisionTab evidence={evidence} />}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Retrieval path explainer */}
        {evidence && (
          <div style={{ marginTop: 20, border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
            <button
              onClick={() => setShowTrace((v) => !v)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: "var(--navy)" }}
            >
              <span>How did the agent reach this answer?</span>
              <span>{showTrace ? "▲" : "▼"}</span>
            </button>
            {showTrace && (
              <div style={{ borderTop: "1px solid var(--border)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                {evidence.trace.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, fontSize: "0.85rem" }}>
                    <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700 }}>
                      {i + 1}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--navy)" }}>{t.step}</span>
                      <span style={{ color: "var(--muted)" }}> - {t.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* Architecture */}
      <section id="architecture" style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px" }}>
        <SectionLabel>Architecture</SectionLabel>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", color: "var(--navy)", marginBottom: 20 }}>
          The LLM reasons. Enterprise data grounds it.
        </h2>
        <ArchitectureDiagram />
        <p style={{ marginTop: 20, fontSize: "0.92rem", color: "var(--muted)", lineHeight: 1.75, maxWidth: 720 }}>
          Structured retrieval provides exact facts (invoice amounts, dates, quantities). Vector RAG
          retrieves relevant policy language from a small knowledge base. The knowledge graph resolves
          which policy applies to a given distributor, tier, contract, or product. Deterministic rules
          compute eligibility, refund amount, and approval requirements. The LLM never overrides them. Read
          the full walkthrough on the{" "}
          <Link href="/lab/hybrid-rag/how-it-works" style={{ color: "var(--accent)", fontWeight: 600 }}>
            How It Works
          </Link>{" "}
          page.
        </p>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      {/* Footer note */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px 0" }}>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.7 }}>
          Elegance AI Lab. Practical learning for applied and agentic AI. Supercharged Battery Co. is a
          fictional company built from synthetic data for this demo. Not connected to a production system.
        </p>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Evidence tabs
// ─────────────────────────────────────────────────────────────────────────

function TransactionTab({ evidence }: { evidence: EvidenceBundle }) {
  const { distributor, invoice, salesOrder, returnRecord, existingCreditMemos, product, notFoundNote } = evidence.transactions;
  if (notFoundNote) {
    return (
      <div style={{ fontSize: "0.85rem", color: "var(--danger)", lineHeight: 1.6 }}>
        Not found in structured records: {notFoundNote}. The agent will not fabricate this information.
      </div>
    );
  }
  if (!distributor && !invoice) {
    return <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>No specific transaction referenced in this question.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {distributor && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <Field label="Distributor" value={distributor.name} />
          <Field label="Tier" value={distributor.tier} />
          <Field label="Region" value={distributor.region} />
        </div>
      )}
      {invoice && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <Field label="Invoice" value={invoice.id} />
          <Field label="Product" value={product ? `${product.name} (${product.id})` : invoice.product_id} />
          <Field label="Quantity" value={invoice.quantity} />
          <Field label="Unit price" value={`$${invoice.unit_price}`} />
          <Field label="Invoice amount" value={`$${invoice.amount.toLocaleString()}`} />
          <Field label="Invoice date" value={invoice.invoice_date} />
          {salesOrder && <Field label="Sales order" value={salesOrder.id} />}
        </div>
      )}
      {returnRecord && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Return request {returnRecord.id}
          </div>
          {returnRecord.units.map((u, i) => (
            <div key={i} style={{ fontSize: "0.85rem", color: "var(--ink)", marginBottom: 2 }}>
              {u.quantity} × {u.condition.replace("_", " ")}
              {u.reported_issue ? ` - "${u.reported_issue}"` : ""}
              {u.installed_date ? ` (installed ${u.installed_date})` : ""}
            </div>
          ))}
        </div>
      )}
      {existingCreditMemos.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
            Existing credit memos
          </div>
          {existingCreditMemos.map((c) => (
            <div key={c.id} style={{ fontSize: "0.85rem", color: "var(--ink)" }}>
              {c.id}: ${c.amount.toLocaleString()} issued {c.issued_date}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GraphTab({ evidence }: { evidence: EvidenceBundle }) {
  const { nodes, edges } = evidence.graphPath;
  if (nodes.length === 0) return <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>No graph traversal was needed for this question.</p>;
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 18 }}>
        {nodes.map((n, i) => (
          <div key={n.id + i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", background: "var(--bg-secondary)", fontSize: "0.82rem" }}>
              <span style={{ color: "var(--muted)", fontSize: "0.68rem", textTransform: "uppercase", marginRight: 6 }}>{n.type}</span>
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>{n.label}</span>
            </div>
            {i < nodes.length - 1 && <span style={{ color: "var(--accent)" }}>↓</span>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
        Relationships traversed
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {edges.map((e, i) => (
          <div key={i} style={{ fontSize: "0.78rem", fontFamily: "var(--font-mono, monospace)", color: "var(--muted)" }}>
            {e.source_label} —<span style={{ color: "var(--accent)" }}>{e.relationship}</span>→ {e.target_label}
          </div>
        ))}
      </div>
    </div>
  );
}

function PolicyTab({ evidence }: { evidence: EvidenceBundle }) {
  if (evidence.retrievedChunks.length === 0) {
    return <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>No policy documents retrieved for this question.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {evidence.retrievedChunks.map((c) => (
        <div key={c.chunk_id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--bg-secondary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--navy)" }}>
              {c.title} {c.section}
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>relevance {(c.score * 100).toFixed(0)}%</span>
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--ink)", lineHeight: 1.6, margin: 0 }}>{c.text}</p>
        </div>
      ))}
    </div>
  );
}

function RulesTab({ evidence }: { evidence: EvidenceBundle }) {
  if (evidence.rules.length === 0) {
    return <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>No deterministic rules were evaluated for this question.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {evidence.rules.map((r) => (
        <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: "0.9rem", color: r.passed ? "var(--success)" : "var(--danger)", flexShrink: 0 }}>{r.passed ? "✓" : "✗"}</span>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}>{r.label}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{r.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DecisionTab({ evidence }: { evidence: EvidenceBundle }) {
  const d = evidence.decision;
  if (!d) return <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>No return or refund decision applies to this question.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <StatusPill status={d.status} />
        <p style={{ fontSize: "0.9rem", color: "var(--ink)", marginTop: 10, lineHeight: 1.6 }}>{d.headline}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Field label="Refund amount" value={`$${d.refund_amount.toLocaleString()}`} />
        <Field label="Restocking fee" value={`${d.restocking_fee_applied_pct}%`} />
        <Field label="Warranty units" value={d.warranty_units} />
        <Field label="Approval required" value={d.approval_required ? "Yes" : "No"} />
        {d.approval_threshold_usd != null && <Field label="Approval threshold" value={`$${d.approval_threshold_usd.toLocaleString()}`} />}
      </div>
      {d.unit_outcomes.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>
            Unit-level outcomes
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {d.unit_outcomes.map((u, i) => (
              <div key={i} style={{ fontSize: "0.83rem", color: "var(--ink)" }}>
                <strong>{u.quantity} × {u.condition.replace("_", " ")}</strong>: {u.outcome.replace(/_/g, " ")}
                <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{u.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Architecture diagram
// ─────────────────────────────────────────────────────────────────────────

function ArchitectureDiagram() {
  const box: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: "0.82rem", color: "var(--ink)", background: "var(--card)", textAlign: "center" };
  const sources = ["Structured Data", "Vector RAG (ChromaDB-style)", "Knowledge Graph"];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={box}>User question</div>
      <div style={{ color: "var(--muted)" }}>↓</div>
      <div style={box}>Intent + entity extraction (LLM)</div>
      <div style={{ color: "var(--muted)" }}>↓</div>
      <div style={{ ...box, borderColor: "var(--accent)" }}>Retrieval router</div>
      <div style={{ color: "var(--muted)" }}>↓</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 12, width: "100%", maxWidth: 640 }}>
        {sources.map((s) => (
          <div key={s} style={box}>{s}</div>
        ))}
      </div>
      <div style={{ color: "var(--muted)" }}>↓</div>
      <div style={{ ...box, borderColor: "var(--gold)", color: "var(--gold)", fontWeight: 600 }}>Deterministic rules engine</div>
      <div style={{ color: "var(--muted)" }}>↓</div>
      <div style={{ ...box, background: "var(--accent-light)", borderColor: "var(--accent)", fontWeight: 600 }}>LLM synthesis → grounded response</div>
    </div>
  );
}
