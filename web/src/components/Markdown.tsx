import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check, ExternalLink } from "lucide-react";

function CodeBlock({ language, children }: { language?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = String(children ?? "").replace(/\n$/, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-xl border-sub surface my-3 overflow-hidden theme-fade">
      <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-sub">
        <span className="font-mono text-[11px] fg-faint uppercase tracking-wide">
          {language || "code"}
        </span>
        <button
          onClick={copy}
          className="pressable flex items-center gap-1.5 text-[11px] fg-faint hover:fg-app py-0.5"
          aria-label={copied ? "Copié" : "Copier le code"}
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="p-3.5 font-mono text-[13px] leading-relaxed fg-app">
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}

// Répare l'artefact « une lettre par ligne » produit par certains modèles
// (ex. "d\ne\nr\ne\nv\ne\nn\nu\ns"), en dehors des blocs de code.
function fixLetterLines(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      i++;
      continue;
    }
    if (!inFence && /^\S$/.test(line)) {
      let j = i;
      while (j < lines.length && /^\S$/.test(lines[j])) j++;
      if (j - i >= 3) {
        out.push(lines.slice(i, j).join(""));
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md text-[15px] leading-relaxed fg-app">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, errorColor: "#d1453b" }], rehypeHighlight]}
        components={{
          code(props) {
            const { className, children } = props;
            const match = /language-(\w+)/.exec(className || "");
            const isBlock =
              typeof children === "string" &&
              (children.includes("\n") || (props.node && props.node.position?.start.line !== props.node.position?.end.line));
            if (!match && !isBlock) {
              return (
                <code className="font-mono text-[0.85em] rounded px-1.5 py-0.5 surface-2 border-sub">
                  {children}
                </code>
              );
            }
            return <CodeBlock language={match ? match[1] : undefined}>{children}</CodeBlock>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-baseline gap-0.5 text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
              >
                {children}
                <ExternalLink size={12} className="self-center shrink-0 opacity-70" />
              </a>
            );
          },
          h1: ({ children }) => <h1 className="text-2xl font-serif font-semibold tracking-tight mt-5 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-serif font-semibold tracking-tight mt-5 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-1.5">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1">{children}</h4>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent pl-4 my-3 fg-muted italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border-sub">
              <table className="min-w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="surface-2">{children}</thead>,
          th: ({ children }) => (
            <th className="text-left font-semibold px-3 py-2 border-b border-sub">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-sub align-top">{children}</td>
          ),
          kbd: ({ children }) => <kbd>{children}</kbd>
        }}
      >
        {fixLetterLines(content)}
      </ReactMarkdown>
    </div>
  );
}
