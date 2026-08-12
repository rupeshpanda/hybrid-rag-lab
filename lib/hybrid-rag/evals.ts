// ─────────────────────────────────────────────────────────────────────────
// Ten predefined evaluation scenarios exercising every retrieval path and
// rules-engine branch. These check the deterministic parts of the pipeline
// (structured retrieval, graph resolution, rules engine decision) rather
// than the free-text LLM wording, since that's the part with a real right
// answer to check.
// ─────────────────────────────────────────────────────────────────────────

import type { Decision, EvidenceBundle } from "./types";
import { answerCustomerQuery } from "./agent";

export type EvalScenario = {
  id: string;
  title: string;
  question: string;
  expectedRetrieval: { structured: boolean; vector: boolean; graph: boolean };
  expectedPolicies: string[];
  expect: (evidence: EvidenceBundle) => { pass: boolean; detail: string };
};

function decisionStatusIs(status: Decision["status"]) {
  return (evidence: EvidenceBundle) => {
    const actual = evidence.decision?.status;
    return {
      pass: actual === status,
      detail: actual ? `decision.status = "${actual}"` : "no decision produced",
    };
  };
}

export const EVAL_SCENARIOS: EvalScenario[] = [
  {
    id: "eval-01",
    title: "Normal return within window",
    question: "Metro Auto Supply wants to return 2 unopened STD-205 batteries from invoice INV-1031. Can we accept it?",
    expectedRetrieval: { structured: true, vector: true, graph: true },
    expectedPolicies: ["Silver Distributor Return Policy"],
    expect: (e) => {
      const check = decisionStatusIs("approved")(e);
      return { pass: check.pass, detail: `Expected approved normal return. ${check.detail}` };
    },
  },
  {
    id: "eval-02",
    title: "Return after window",
    question: "Gulf Coast Automotive wants to return 6 unopened MAR-405 batteries from invoice INV-1046. Is that still within the return window?",
    expectedRetrieval: { structured: true, vector: true, graph: true },
    expectedPolicies: ["Standard-Tier Distributor Return Policy"],
    expect: (e) => {
      const check = decisionStatusIs("rejected")(e);
      return { pass: check.pass, detail: `Expected rejection for being outside the window. ${check.detail}` };
    },
  },
  {
    id: "eval-03",
    title: "Gold distributor exception (no restocking fee)",
    question: "Dallas Power Distributors wants to return 8 unopened AGM-100 batteries from invoice INV-1048. What's the refund?",
    expectedRetrieval: { structured: true, vector: true, graph: true },
    expectedPolicies: ["Gold Distributor Return Policy"],
    expect: (e) => {
      const fee = e.decision?.restocking_fee_applied_pct;
      return { pass: fee === 0, detail: `Expected 0% restocking fee for Gold tier, got ${fee}%.` };
    },
  },
  {
    id: "eval-04",
    title: "Installed defective battery routed to warranty",
    question: "Dallas Power Distributors wants to return 12 AGM-100 batteries from invoice INV-1048. 8 are unopened and 4 were installed but are reported defective. What should we do?",
    expectedRetrieval: { structured: true, vector: true, graph: true },
    expectedPolicies: ["Gold Distributor Return Policy", "AGM Battery Warranty Policy"],
    expect: (e) => {
      const warrantyUnits = e.decision?.warranty_units ?? 0;
      const refund = e.decision?.refund_amount ?? 0;
      const pass = warrantyUnits === 4 && refund === 3840;
      return { pass, detail: `Expected 4 warranty units and a $3,840 refund; got ${warrantyUnits} warranty units and $${refund}.` };
    },
  },
  {
    id: "eval-05",
    title: "Refund exceeding approval threshold",
    question: "Can we refund invoice INV-1092 without manager approval?",
    expectedRetrieval: { structured: true, vector: true, graph: true },
    expectedPolicies: ["Silver Distributor Return Policy", "Manager Approval Policy"],
    expect: (e) => {
      return { pass: e.decision?.approval_required === true, detail: `Expected approval_required = true, got ${e.decision?.approval_required}.` };
    },
  },
  {
    id: "eval-06",
    title: "Already-refunded invoice",
    question: "Has invoice INV-1037 already received a credit?",
    expectedRetrieval: { structured: true, vector: false, graph: false },
    expectedPolicies: [],
    expect: (e) => {
      const hasCredit = (e.transactions.existingCreditMemos?.length ?? 0) > 0;
      return { pass: hasCredit, detail: hasCredit ? `Found ${e.transactions.existingCreditMemos.length} credit memo(s) on INV-1037.` : "No credit memo found on INV-1037." };
    },
  },
  {
    id: "eval-07",
    title: "Quantity exceeds purchase quantity",
    question: "Pacific Power Distribution wants to return 10 EV-500 batteries from invoice INV-1041.",
    expectedRetrieval: { structured: true, vector: true, graph: true },
    expectedPolicies: ["Gold Distributor Return Policy"],
    expect: (e) => {
      const check = decisionStatusIs("rejected")(e);
      const rule = e.rules.find((r) => r.id === "quantity_within_invoice");
      const pass = check.pass && rule?.passed === false;
      return { pass, detail: `Expected rejection on quantity_within_invoice. ${check.detail}, rule passed = ${rule?.passed}.` };
    },
  },
  {
    id: "eval-08",
    title: "Missing invoice",
    question: "Midwest Battery Partners wants to return 2 MAR-400 batteries referencing invoice INV-1120.",
    expectedRetrieval: { structured: true, vector: false, graph: false },
    expectedPolicies: [],
    expect: (e) => {
      const pass = !!e.transactions.notFoundNote && !e.transactions.invoice;
      return { pass, detail: pass ? `Correctly reported invoice as not found: ${e.transactions.notFoundNote}` : "Expected invoice to be unresolved." };
    },
  },
  {
    id: "eval-09",
    title: "Contract overrides standard policy",
    question: "Lone Star Auto Supply wants to return 3 unopened STD-200 batteries from invoice INV-1030. Are they within their return window?",
    expectedRetrieval: { structured: true, vector: true, graph: true },
    expectedPolicies: ["Standard-Tier Distributor Return Policy"],
    expect: (e) => {
      const rule = e.rules.find((r) => r.id === "within_return_window");
      const pass = rule?.passed === true && rule.detail.includes("45");
      return { pass, detail: `Expected the 45-day contract override to apply and pass. Rule: ${rule?.detail}` };
    },
  },
  {
    id: "eval-10",
    title: "General policy question",
    question: "What is our normal return policy?",
    expectedRetrieval: { structured: false, vector: true, graph: false },
    expectedPolicies: ["Standard Company Return Policy"],
    expect: (e) => {
      const pass = e.retrievedChunks.some((c) => c.document === "standard-return-policy");
      return { pass, detail: pass ? "Retrieved the Standard Company Return Policy." : "Did not retrieve the standard return policy." };
    },
  },
  {
    id: "eval-11",
    title: "Article headline question",
    question: "Can Dallas Power Distributors return 25 batteries from invoice INV-10042, what is the refund amount, and who needs to approve it?",
    expectedRetrieval: { structured: true, vector: true, graph: true },
    expectedPolicies: ["Gold Distributor Return Policy", "Manager Approval Policy"],
    expect: (e) => {
      const refund = e.decision?.refund_amount;
      const approvalRequired = e.decision?.approval_required;
      const invoked = (m: string) => e.routing.find((r) => r.mechanism === m)?.invoked === true;
      const allPathsFired = invoked("Structured retrieval") && invoked("Knowledge graph") && invoked("Vector RAG");
      const pass = refund === 12000 && approvalRequired === true && allPathsFired;
      return {
        pass,
        detail: `Expected $12,000 refund requiring manager approval, with structured, graph, and vector all invoked. Got refund=$${refund}, approval_required=${approvalRequired}, all paths fired=${allPathsFired}.`,
      };
    },
  },
  {
    id: "eval-12",
    title: "Simple policy question genuinely skips structured and graph",
    question: "What does our return policy say about damaged batteries?",
    expectedRetrieval: { structured: false, vector: true, graph: false },
    expectedPolicies: ["Defective Product Policy"],
    expect: (e) => {
      const invoked = (m: string) => e.routing.find((r) => r.mechanism === m)?.invoked;
      const pass = invoked("Structured retrieval") === false && invoked("Knowledge graph") === false && invoked("Vector RAG") === true;
      return {
        pass,
        detail: `Expected structured and graph skipped, vector invoked. Got structured=${invoked("Structured retrieval")}, graph=${invoked("Knowledge graph")}, vector=${invoked("Vector RAG")}.`,
      };
    },
  },
  {
    id: "eval-13",
    title: "Payment status is retrieved from structured data",
    question: "Has invoice INV-10042 been paid?",
    expectedRetrieval: { structured: true, vector: false, graph: false },
    expectedPolicies: [],
    expect: (e) => {
      const status = e.transactions.invoice?.payment_status;
      const pass = status === "paid";
      return { pass, detail: `Expected payment_status "paid" on INV-10042 from structured data. Got "${status}".` };
    },
  },
];

export type EvalRunResult = {
  id: string;
  title: string;
  question: string;
  pass: boolean;
  detail: string;
  answer: string;
};

export async function runEvals(): Promise<{ results: EvalRunResult[]; passed: number; total: number }> {
  const results: EvalRunResult[] = [];
  for (const scenario of EVAL_SCENARIOS) {
    const { answer, evidence } = await answerCustomerQuery(scenario.question);
    const { pass, detail } = scenario.expect(evidence);
    results.push({ id: scenario.id, title: scenario.title, question: scenario.question, pass, detail, answer });
  }
  return { results, passed: results.filter((r) => r.pass).length, total: results.length };
}
