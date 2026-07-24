import { Loader2, Search, BookOpen, ListChecks, PenLine, Sparkles, RefreshCw } from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  analyzing: Sparkles,
  searching: Search,
  reading: BookOpen,
  ranking: ListChecks,
  refining: RefreshCw,
  writing: PenLine,
  followups: Sparkles,
};

export function AgentStatus({ step, detail }: { step: string; detail?: string }) {
  const Icon = ICONS[step] ?? Loader2;
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
      <Icon size={14} className="text-primary" />
      <span>{detail ?? step}</span>
      <Loader2 size={12} className="animate-spin opacity-60" />
    </div>
  );
}
