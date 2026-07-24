import type { Citation } from "@/lib/agents/types";
import { ExternalLink } from "lucide-react";

export function SourcesPanel({ sources }: { sources: Citation[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Sources</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.map((s) => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg border bg-card p-3 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="citation-badge">{s.id}</span>
              <img
                src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                alt=""
                className="w-3.5 h-3.5"
                loading="lazy"
              />
              <span className="truncate">{s.domain}</span>
              <ExternalLink size={12} className="ml-auto opacity-0 group-hover:opacity-100" />
            </div>
            <div className="text-sm mt-1.5 line-clamp-2 leading-snug">{s.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
