import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { createThread } from "@/lib/threads.functions";
import { ArrowUp, Paperclip, X, FileText, ImageIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { ChatAttachment, ImageChatAttachment } from "@/lib/sse-client";

export const SIMPLIFY_STORAGE_KEY = "searchly:simplify";
export function getSimplifyPref(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SIMPLIFY_STORAGE_KEY) === "1";
}


interface Props {
  onSubmit?: (
    query: string,
    attachments: ChatAttachment[],
    imageAttachments: ImageChatAttachment[],
  ) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

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
  const [pdfs, setPdfs] = useState<ChatAttachment[]>([]);
  const [images, setImages] = useState<ImageChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createThread);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const nextPdfs: ChatAttachment[] = [];
    const nextImgs: ImageChatAttachment[] = [];
    for (const file of Array.from(files)) {
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isImg = IMAGE_MIME.includes(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
      if (isPdf) {
        if (file.size > MAX_PDF_BYTES) {
          toast.error(`${file.name}: over 15 MB`);
          continue;
        }
        nextPdfs.push({ filename: file.name, base64: await fileToBase64(file) });
      } else if (isImg) {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`${file.name}: over 10 MB`);
          continue;
        }
        const mimeType = IMAGE_MIME.includes(file.type) ? file.type : "image/jpeg";
        nextImgs.push({ filename: file.name, base64: await fileToBase64(file), mimeType });
      } else {
        toast.error(`${file.name}: unsupported file type`);
      }
    }
    if (nextPdfs.length) setPdfs((p) => [...p, ...nextPdfs]);
    if (nextImgs.length) setImages((p) => [...p, ...nextImgs]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const totalAttachments = pdfs.length + images.length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if ((!q && totalAttachments === 0) || busy) return;
    const query =
      q ||
      (images.length > 0 && pdfs.length === 0
        ? "Describe the attached image(s) and highlight key details."
        : "Summarize the attached file(s) and highlight key points.");
    if (onSubmit) {
      onSubmit(query, pdfs, images);
      setValue("");
      setPdfs([]);
      setImages([]);
      return;
    }
    setBusy(true);
    try {
      const { id } = await createFn();
      await qc.invalidateQueries({ queryKey: ["threads"] });
      if (pdfs.length > 0) {
        sessionStorage.setItem(`pending-attachments:${id}`, JSON.stringify(pdfs));
      }
      if (images.length > 0) {
        sessionStorage.setItem(`pending-images:${id}`, JSON.stringify(images));
      }
      navigate({ to: "/t/$threadId", params: { threadId: id }, search: { q: query } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="relative">
      <div className="w-full rounded-2xl border border-input bg-card shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/40 transition-all">
        {totalAttachments > 0 && (
          <div className="flex flex-wrap gap-2 p-3 pb-0">
            {pdfs.map((a, i) => (
              <span
                key={`pdf-${a.filename}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent/60 border px-2 py-1 text-xs"
              >
                <FileText size={12} />
                <span className="max-w-[160px] truncate">{a.filename}</span>
                <button
                  type="button"
                  onClick={() => setPdfs((prev) => prev.filter((_, j) => j !== i))}
                  className="hover:text-destructive"
                  aria-label={`Remove ${a.filename}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {images.map((a, i) => (
              <span
                key={`img-${a.filename}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent/60 border px-2 py-1 text-xs"
              >
                <ImageIcon size={12} />
                <span className="max-w-[160px] truncate">{a.filename}</span>
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
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
            title="Attach a PDF or image"
          >
            <Paperclip size={14} />
            Attach PDF or image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={(!value.trim() && totalAttachments === 0) || busy}
        className="absolute right-3 top-3 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
        aria-label="Ask"
      >
        <ArrowUp size={18} />
      </button>
    </form>
  );
}
