import Link from "next/link";

// This project has one real route: /lab/hybrid-rag. It is meant to be
// linked from eleganceai.ai's Lab index, not to have its own marketing
// home page — this is a minimal placeholder that points visitors there.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="section-label">Elegance AI</p>
      <h1 className="mt-2 max-w-xl font-serif text-3xl text-ink">Enterprise Hybrid RAG</h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        This project is a standalone demo lab. The interactive experience lives at the link below.
      </p>
      <Link
        href="/lab/hybrid-rag"
        className="mt-6 rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        Open the lab
      </Link>
    </div>
  );
}
