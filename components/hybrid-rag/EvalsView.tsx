"use client";

import { useState } from "react";
import Link from "next/link";

type ScenarioSummary = { id: string; title: string; question: string };
type EvalRunResult = { id: string; title: string; question: string; pass: boolean; detail: string; answer: string };
type EvalRunResponse = { results: EvalRunResult[]; passed: number; total: number };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
      {children}
    </div>
  );
}

export default function EvalsView({ scenarios }: { scenarios: ScenarioSummary[] }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [data, setData] = useState<EvalRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/lab/hybrid-rag/evals");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to run evals.");
      setData(json);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  const results = new Map((data?.results ?? []).map((r) => [r.id, r]));

  return (
    <main style={{ background: "var(--bg)", color: "var(--ink)", minHeight: "100vh", paddingBottom: 60 }}>
      <div style={{ borderBottom: "1px solid var(--border)", padding: "12px 24px", fontSize: "0.82rem", color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <a href="https://eleganceai.ai" style={{ color: "var(--muted)", textDecoration: "none" }}>Home</a>
        <span>/</span>
        <a href="https://eleganceai.ai/lab" style={{ color: "var(--muted)", textDecoration: "none" }}>Lab</a>
        <span>/</span>
        <Link href="/lab/hybrid-rag" style={{ color: "var(--muted)", textDecoration: "none" }}>Enterprise Hybrid RAG</Link>
        <span>/</span>
        <span style={{ color: "var(--ink)" }}>Evals</span>
      </div>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "52px 24px 32px" }}>
        <SectionLabel>Developer / debug view</SectionLabel>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.7rem, 3.6vw, 2.3rem)", color: "var(--navy)", lineHeight: 1.2, marginBottom: 16 }}>
          {scenarios.length} evaluation scenarios
        </h1>
        <p style={{ fontSize: "0.95rem", color: "var(--muted)", lineHeight: 1.75, maxWidth: 640, marginBottom: 24 }}>
          Each scenario runs the full pipeline: routing, structured retrieval, graph traversal, vector
          retrieval, and the rules engine, then checks the deterministic parts of the result: eligibility,
          refund amount, approval requirement, and retrieval outcome. This checks the parts of the system
          that have a single right answer, not the LLM&rsquo;s exact wording.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button
            onClick={run}
            disabled={state === "loading"}
            style={{ fontSize: "0.88rem", fontWeight: 600, padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "white", cursor: state === "loading" ? "default" : "pointer", opacity: state === "loading" ? 0.7 : 1 }}
          >
            {state === "loading" ? "Running…" : data ? "Run again" : "Run evaluations"}
          </button>
          {data && (
            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", color: data.passed === data.total ? "var(--success)" : "var(--warning)" }}>
              {data.passed} / {data.total} passed
            </span>
          )}
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: "0.88rem", marginTop: 12 }}>{error}</p>}
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {scenarios.map((s) => {
            const r = results.get(s.id);
            return (
              <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
                <button
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "0.95rem", color: r ? (r.pass ? "var(--success)" : "var(--danger)") : "var(--border)" }}>
                      {r ? (r.pass ? "✓" : "✗") : "○"}
                    </span>
                    <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--navy)" }}>{s.title}</span>
                    {!r && state !== "loading" && (
                      <span style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)" }}>not run yet</span>
                    )}
                  </span>
                  <span style={{ color: "var(--muted)" }}>{expanded === s.id ? "▲" : "▼"}</span>
                </button>
                {expanded === s.id && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--ink)" }}><strong>Question:</strong> {s.question}</div>
                    {r ? (
                      <>
                        <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}><strong>Check:</strong> {r.detail}</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--ink)", whiteSpace: "pre-wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                          <strong>Agent answer:</strong> {r.answer}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Click &ldquo;Run evaluations&rdquo; above to see the result.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
