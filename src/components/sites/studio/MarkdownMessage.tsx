import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renderização de Markdown das respostas do agente (C2). Estilos explícitos
 * (sem depender do plugin de tipografia) para um visual limpo.
 */
export function MarkdownMessage({ text }: { text: string }) {
  const components: Components = {
    p: ({ children }) => <p className="my-1.5 whitespace-pre-wrap break-words">{children}</p>,
    h1: ({ children }) => <h1 className="mb-1.5 mt-3 text-lg font-semibold">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-base font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
    ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{children}</a>
    ),
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
    hr: () => <hr className="my-3 border-border/60" />,
    table: ({ children }) => <table className="my-2 w-full border-collapse text-[12px]">{children}</table>,
    th: ({ children }) => <th className="border border-border/60 px-2 py-1 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border border-border/60 px-2 py-1">{children}</td>,
    pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-[12px] leading-relaxed text-emerald-100">{children}</pre>,
    code: ({ className, children }) => {
      const block = typeof className === "string" && className.includes("language-");
      if (block) return <code className="font-mono">{children}</code>;
      return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{children}</code>;
    },
  };

  return (
    <div className="text-[13px] leading-relaxed text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

