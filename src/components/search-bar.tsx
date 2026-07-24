import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { createThread } from "@/lib/threads.functions";
import { ArrowUp, Paperclip, X, FileText } from "lucide-react";
import { toast } from "sonner";
import type { ChatAttachment } from "@/lib/sse-client";

interface Props {
  onSubmit?: (query: string, attachments: ChatAttachment[]) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

const MAX_PDF_BYTES = 15 * 1024 * 1024;

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function SearchBar({ onSubmit, autoFocus, placeholder }: Props) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createThread);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast.error(`${file.name}: not a PDF`);
        continue;
      }
      if (file.size > MAX_PDF_BYTES) {
        toast.error(`${file.name}: over 15 MB`);
        continue;
      }
      const base64 = await fileToBase64(file);
      next.push({ filename: file.name, base64 });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if ((!q && attachments.length === 0) || busy) return;
    const query = q || "Summarize the attached PDF and highlight key points.";
    if (onSubmit) {
      onSubmit(query, attachments);
      setValue("");
      setAttachments([]);
      return;
    }
    setBusy(true);
    try {
      const { id } = await createFn();
      await qc.invalidateQueries({ queryKey: ["threads"] });
      // Stash attachments for the new thread page to pick up.
      if (attachments.length > 0) {
        sessionStorage.setItem(`pending-attachments:${id}`, JSON.stringify(attachments));
      }
      navigate({ to: "/t/$threadId", params: { threadId: id }, search: { q: query } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="relative">
      <div className="w-full rounded-2xl border border-input bg-card shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/40 transition-all">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-0">
            {attachments.map((a, i) => (
              <span
                key={`${a.filename}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent/60 border px-2 py-1 text-xs"
              >
                <FileText size={12} />
                <span className="max-w-[160px] truncate">{a.filename}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="hover:text-destructive"
                  aria-label={`Remove ${a.filename}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
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
          className="w-full resize-none bg-transparent p-4 pr-14 text-base outline-none"
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
            title="Attach a PDF"
          >
            <Paperclip size={14} />
            Attach PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={(!value.trim() && attachments.length === 0) || busy}
        className="absolute right-3 top-3 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
        aria-label="Ask"
      >
        <ArrowUp size={18} />
      </button>
    </form>
  );
}
