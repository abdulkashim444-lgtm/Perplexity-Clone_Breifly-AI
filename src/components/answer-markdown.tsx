import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import type { Citation } from "@/lib/agents/types";

interface Props {
  content: string;
  citations: Citation[];
}

function transform(text: string, citations: Citation[]): string {
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_, group: string) => {
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

export function AnswerMarkdown({ content, citations }: Props) {
  const prepared = transform(content, citations);
  return (
    <div className="prose prose-neutral max-w-none prose-headings:font-serif prose-p:leading-relaxed prose-a:text-primary">
      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{prepared}</ReactMarkdown>
    </div>
  );
}
