import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createThread } from "@/lib/threads.functions";
import { ArrowUp } from "lucide-react";

interface Props {
  onSubmit?: (query: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

export function SearchBar({ onSubmit, autoFocus, placeholder }: Props) {
  const [value, setValue] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createThread);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    if (onSubmit) {
      onSubmit(q);
      setValue("");
      return;
    }
    setBusy(true);
    try {
      const { id } = await createFn();
      await qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/t/$threadId", params: { threadId: id }, search: { q } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="relative">
      <textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit(e as unknown as React.FormEvent);
          }
        }}
        placeholder={placeholder ?? "Ask anything…"}
        className="w-full resize-none rounded-2xl border border-input bg-card p-4 pr-14 text-base shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/40 transition-all"
      />
      <button
        type="submit"
        disabled={!value.trim() || busy}
        className="absolute right-3 bottom-3 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
        aria-label="Ask"
      >
        <ArrowUp size={18} />
      </button>
    </form>
  );
}
