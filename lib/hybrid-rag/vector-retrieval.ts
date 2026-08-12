// ─────────────────────────────────────────────────────────────────────────
// Vector RAG over the policy knowledge base.
//
// The lab's spec calls for ChromaDB. For this MVP, deployed on Vercel with
// no persistent filesystem and no separate vector service to operate, the
// same retrieval *pattern* — chunk, embed, rank by similarity, return the
// top-k chunks with metadata — is implemented with a small in-process
// TF-IDF cosine similarity index built from the markdown policy documents
// at module load. It is a stand-in for a hosted embedding + Chroma
// pipeline, not a simulation of exact-string matching: chunks are scored
// by weighted term overlap, not by whether a keyword literally appears.
// Swapping this module for a real Chroma client with an embeddings API
// would not change any other part of the pipeline. See how-it-works.
// ─────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import type { PolicyChunk, PolicyType, TierId } from "./types";

type DocMeta = {
  document: string;
  title: string;
  policy_type: PolicyType;
  tier: TierId | "all";
  region: string;
  version: string;
};

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge", "supercharged");

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to", "of", "in", "on", "for",
  "and", "or", "as", "at", "by", "with", "from", "this", "that", "these", "those", "it", "its", "if",
  "not", "no", "any", "may", "must", "will", "can", "than", "then", "so", "such", "which", "who",
  "does", "do", "did", "has", "have", "had", "each", "per", "into", "over", "under", "within", "without",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%$\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function parseFrontmatter(raw: string): { meta: DocMeta; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Policy document missing frontmatter");
  const [, fmBlock, body] = match;
  const meta: Record<string, string> = {};
  for (const line of fmBlock.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return {
    meta: {
      document: meta.document,
      title: meta.title,
      policy_type: meta.policy_type as PolicyType,
      tier: meta.tier as TierId | "all",
      region: meta.region,
      version: meta.version,
    },
    body,
  };
}

function splitIntoSections(body: string): { section: string; text: string }[] {
  const sections: { section: string; text: string }[] = [];
  const parts = body.split(/\n(?=## §)/g);
  for (const part of parts) {
    const headingMatch = part.match(/^## (§\d+[^\n]*)\n([\s\S]*)$/);
    if (!headingMatch) continue;
    const [, heading, text] = headingMatch;
    sections.push({ section: heading.trim(), text: text.trim() });
  }
  return sections;
}

type IndexedChunk = {
  chunk: PolicyChunk;
  termFreq: Map<string, number>;
};

let CACHED_INDEX: { chunks: IndexedChunk[]; idf: Map<string, number> } | null = null;

function buildIndex() {
  if (CACHED_INDEX) return CACHED_INDEX;

  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".md"));
  const chunks: IndexedChunk[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const sections = splitIntoSections(body);
    sections.forEach((s, i) => {
      const tokens = tokenize(`${meta.title} ${s.section} ${s.text}`);
      const termFreq = new Map<string, number>();
      for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
      chunks.push({
        chunk: {
          chunk_id: `${meta.document}#${i}`,
          document: meta.document,
          title: meta.title,
          section: s.section,
          text: s.text,
          policy_type: meta.policy_type,
          tier: meta.tier,
          region: meta.region,
          score: 0,
        },
        termFreq,
      });
    });
  }

  const docFreq = new Map<string, number>();
  for (const { termFreq } of chunks) {
    for (const term of termFreq.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) idf.set(term, Math.log((1 + chunks.length) / (1 + df)) + 1);

  CACHED_INDEX = { chunks, idf };
  return CACHED_INDEX;
}

function vectorize(termFreq: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, tf] of termFreq) vec.set(term, tf * (idf.get(term) ?? 0.5));
  return vec;
}

function cosineSim(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [term, v] of small) {
    const other = large.get(term);
    if (other) dot += v * other;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type ChunkFilter = {
  tier?: TierId;
  region?: string;
  policy_type?: PolicyType;
  document?: string;
};

/**
 * Retrieve the top-k policy chunks most similar to the query, optionally
 * filtered by metadata (metadata-filtered RAG: narrow the candidate set to
 * a tier / region / policy type before ranking by similarity).
 */
export function retrievePolicyChunks(query: string, topK = 4, filter?: ChunkFilter): PolicyChunk[] {
  const { chunks, idf } = buildIndex();
  const queryTokens = tokenize(query);
  const queryTf = new Map<string, number>();
  for (const t of queryTokens) queryTf.set(t, (queryTf.get(t) ?? 0) + 1);
  const queryVec = vectorize(queryTf, idf);

  let candidates = chunks;
  if (filter) {
    candidates = candidates.filter(({ chunk }) => {
      if (filter.document && chunk.document !== filter.document) return false;
      if (filter.policy_type && chunk.policy_type !== filter.policy_type) return false;
      if (filter.tier && chunk.tier !== "all" && chunk.tier !== filter.tier) return false;
      if (filter.region && chunk.region !== "all" && chunk.region !== filter.region) return false;
      return true;
    });
  }

  const scored = candidates.map(({ chunk, termFreq }) => ({
    ...chunk,
    score: cosineSim(queryVec, vectorize(termFreq, idf)),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((c) => c.score > 0);
}

/** Retrieve every chunk belonging to one document, in order — used when a specific policy is already known (e.g. from the graph) rather than searched for. */
export function retrieveDocumentChunks(documentSlug: string, query?: string, topK = 3): PolicyChunk[] {
  const { chunks, idf } = buildIndex();
  const docChunks = chunks.filter(({ chunk }) => chunk.document === documentSlug);
  if (!query) {
    return docChunks.slice(0, topK).map(({ chunk }) => ({ ...chunk, score: 1 }));
  }
  const queryTokens = tokenize(query);
  const queryTf = new Map<string, number>();
  for (const t of queryTokens) queryTf.set(t, (queryTf.get(t) ?? 0) + 1);
  const queryVec = vectorize(queryTf, idf);
  return docChunks
    .map(({ chunk, termFreq }) => ({ ...chunk, score: cosineSim(queryVec, vectorize(termFreq, idf)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
