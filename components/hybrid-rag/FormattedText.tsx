// Minimal, safe renderer for the LLM's markdown-flavored output (**bold**
// and paragraph breaks). No HTML injection risk: text is split into React
// nodes, never dangerouslySetInnerHTML.

function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

export function FormattedText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return null;
  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : "0.8em 0 0", whiteSpace: "pre-wrap" }}>
          {formatInline(para)}
        </p>
      ))}
    </>
  );
}
