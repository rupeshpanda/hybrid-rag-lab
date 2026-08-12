# Enterprise Hybrid RAG

A standalone Elegance AI demo lab: a customer-service returns agent for a fictional
automotive-battery distributor, Supercharged Battery Co. Demonstrates how an LLM combines
structured enterprise data, Vector RAG over a policy knowledge base, a lightweight
ontology-backed knowledge graph, and deterministic business rules to answer complex
distributor-return questions with full provenance.

This project is meant to be linked from [eleganceai.ai](https://eleganceai.ai)'s Lab index,
not to have its own marketing home page. The interactive experience lives at
`/lab/hybrid-rag`.

## Stack

- Next.js (App Router), TypeScript, Tailwind
- Claude via `@anthropic-ai/sdk` for intent/entity extraction and response synthesis
- No vector database, no graph database: a small in-process TF-IDF cosine-similarity index
  stands in for Chroma, and the knowledge graph is built in memory from the structured JSON
  data at request time. Both are documented as deliberate MVP simplifications, not real
  infrastructure a production deployment would use as-is. See `/lab/hybrid-rag/how-it-works`.

## Local development

```bash
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm install
npm run dev
```

Without `ANTHROPIC_API_KEY`, the agent falls back to a heuristic entity extractor and a
templated response built directly from the retrieved evidence, so the lab still works end
to end without a key.

## Structure

```
app/lab/hybrid-rag/          the lab, how-it-works, and evals pages
app/api/lab/hybrid-rag/      query + evals API routes
components/hybrid-rag/       chat UI, evidence panel, how-it-works, evals view
lib/hybrid-rag/              retrieval router, structured/graph/vector retrieval,
                              rules engine, agent orchestration, eval scenarios
data/supercharged/           synthetic structured enterprise data (~100 records)
knowledge/supercharged/      policy documents chunked for vector retrieval
```

## Evals

`GET /api/lab/hybrid-rag/evals` runs 10 predefined scenarios through the full pipeline and
checks the deterministic parts of the result (eligibility, refund amount, approval
requirement). View them at `/lab/hybrid-rag/evals`.
