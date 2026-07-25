import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { SearchBar } from "@/components/search-bar";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { SourcesPanel } from "@/components/sources-panel";
import { AgentStatus } from "@/components/agent-status";
import { Button } from "@/components/ui/button";
import { streamChat, type StreamEvent, type ChatAttachment, type ImageChatAttachment } from "@/lib/sse-client";
import { getSimplifyPref } from "@/components/search-bar";

import type { Citation, ChatTurn } from "@/lib/agents/types";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/g/$sessionId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Guest search — Searchly" },
      { name: "description", content: "A cited answer thread on Searchly — guest mode." },
    ],
  }),
  component: GuestThread,
});

interface AssistantMsg {
  id: string;
  role: "assistant";
  content: string;
  citations: Citation[];
  follow_ups: string[];
  streaming?: boolean;
  status?: { step: string; detail?: string };
}
interface UserMsg {
  id: string;
  role: "user";
  content: string;
}
type Msg = UserMsg | AssistantMsg;

function GuestThread() {
  const { sessionId } = Route.useParams();
  const { q } = Route.useSearch();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);

  const buildHistory = (): ChatTurn[] =>
    messages.map((m) => ({ role: m.role, content: m.content }));

  const ask = async (
    query: string,
    attachments: ChatAttachment[] = [],
    imageAttachments: ImageChatAttachment[] = [],
  ) => {
    if (running) return;
    setRunning(true);
    const notes: string[] = [];
    if (attachments.length) notes.push(`📎 ${attachments.length} PDF: ${attachments.map((a) => a.filename).join(", ")}`);
    if (imageAttachments.length) notes.push(`🖼️ ${imageAttachments.length} image: ${imageAttachments.map((a) => a.filename).join(", ")}`);
    const attachmentNote = notes.length ? `\n\n_${notes.join(" · ")}_` : "";
    const userMsg: UserMsg = { id: `u-${Date.now()}`, role: "user", content: query + attachmentNote };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: AssistantMsg = {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
      follow_ups: [],
      streaming: true,
    };
    const history = buildHistory();
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      for await (const ev of streamChat({ threadId: sessionId, query, history, attachments, imageAttachments, guest: true })) {
        handleEvent(ev, assistantId);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId && m.role === "assistant" ? { ...m, streaming: false } : m)),
      );
    } finally {
      setRunning(false);
    }
  };

  const handleEvent = (ev: StreamEvent, id: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id || m.role !== "assistant") return m;
        switch (ev.type) {
          case "status":
            return { ...m, status: { step: ev.step, detail: ev.detail } };
          case "sources":
            return { ...m, citations: ev.sources };
          case "token":
            return { ...m, content: m.content + ev.text };
          case "followups":
            return { ...m, follow_ups: ev.questions };
          case "done":
            return { ...m, content: ev.answer, citations: ev.citations, follow_ups: ev.followups, streaming: false, status: undefined };
          case "error":
            return { ...m, streaming: false, status: undefined, content: m.content || `Error: ${ev.message}` };
        }
      }),
    );
  };

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (q) {
      const pdfKey = `pending-attachments:${sessionId}`;
      const imgKey = `pending-images:${sessionId}`;
      let pdfs: ChatAttachment[] = [];
      let imgs: ImageChatAttachment[] = [];
      try {
        const rp = sessionStorage.getItem(pdfKey);
        if (rp) pdfs = JSON.parse(rp) as ChatAttachment[];
        const ri = sessionStorage.getItem(imgKey);
        if (ri) imgs = JSON.parse(ri) as ImageChatAttachment[];
      } catch { /* ignore */ }
      sessionStorage.removeItem(pdfKey);
      sessionStorage.removeItem(imgKey);
      ask(q, pdfs, imgs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background/80 backdrop-blur z-10">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-serif">S</div>
          <span className="font-serif text-lg">Searchly</span>
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-accent/60 text-muted-foreground">Guest</span>
        </Link>
        <Link
          to="/auth"
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:border-primary/50 hover:bg-accent/40 transition-colors"
        >
          Sign in to save
        </Link>
      </header>
      <main className="flex-1 flex flex-col h-[calc(100vh-57px)]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id}>
                  <h2 className="font-serif text-2xl leading-snug">{m.content}</h2>
                </div>
              ) : (
                <AssistantBlock key={m.id} msg={m} onFollowup={ask} disabled={running} />
              ),
            )}
            {messages.length === 0 && (
              <p className="text-muted-foreground text-sm">Ask something below to begin.</p>
            )}
          </div>
        </div>
        <div className="border-t bg-background/80 backdrop-blur">
          <div className="max-w-3xl mx-auto px-6 py-4">
            <SearchBar onSubmit={ask} placeholder="Ask a follow-up…" />
          </div>
        </div>
      </main>
    </div>
  );
}

function AssistantBlock({
  msg,
  onFollowup,
  disabled,
}: {
  msg: AssistantMsg;
  onFollowup: (q: string) => void;
  disabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-4">
      {msg.status && msg.streaming ? <AgentStatus step={msg.status.step} detail={msg.status.detail} /> : null}
      {msg.citations.length > 0 && <SourcesPanel sources={msg.citations} />}
      {msg.content && (
        <div>
          <AnswerMarkdown content={msg.content} citations={msg.citations} />
          {!msg.streaming && (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={copy} className="gap-1.5 text-xs">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>
      )}
      {msg.follow_ups.length > 0 && !msg.streaming && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Related</div>
          <div className="flex flex-col gap-1.5">
            {msg.follow_ups.map((q) => (
              <button
                key={q}
                type="button"
                disabled={disabled}
                onClick={() => onFollowup(q)}
                className="text-left rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/50 hover:bg-accent/40 disabled:opacity-50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
