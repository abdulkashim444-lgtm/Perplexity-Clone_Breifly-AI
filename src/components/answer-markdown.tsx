import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import type { Citation } from "@/lib/agents/types";

interface Props {
  content: string;
  citations: Citation[];
}

function transform(text: string, citations: Citation[]): string {
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (match, group: string) => {
    // Skip inside code fences? ReactMarkdown handles code blocks before rehype, so safe.
    const ids = group.split(",").map((s) => Number.parseInt(s.trim(), 10)).filter(Boolean);
    return ids
      .map((id) => {
        const c = citations.find((x) => x.id === id);
        if (!c) return `[${id}]`;
        return `<a class="citation-badge" href="${c.url}" target="_blank" rel="noopener noreferrer" title="${c.domain}">${id}</a>`;
      })
      .join("");
  });
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="my-4 rounded-lg overflow-hidden border border-border bg-[#282c34]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/40 text-xs text-muted-foreground font-mono">
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{ margin: 0, background: "transparent", fontSize: "0.875rem" }}
        PreTag="div"
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

export function AnswerMarkdown({ content, citations }: Props) {
  const prepared = transform(content, citations);
  return (
    <div className="prose prose-invert max-w-none prose-headings:font-serif prose-p:font-serif prose-p:text-[1.05rem] prose-p:leading-relaxed prose-li:font-serif prose-li:leading-relaxed prose-a:text-primary prose-strong:text-foreground">
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const value = String(children).replace(/\n$/, "");
            if (!inline && (match || value.includes("\n"))) {
              return <CodeBlock language={match?.[1] ?? ""} value={value} />;
            }
            return (
              <code className="rounded bg-accent/60 px-1.5 py-0.5 font-mono text-[0.9em]" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
