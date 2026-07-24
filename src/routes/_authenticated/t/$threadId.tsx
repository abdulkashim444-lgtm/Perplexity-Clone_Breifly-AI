import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Sidebar } from "@/components/sidebar";
import { SearchBar } from "@/components/search-bar";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { SourcesPanel } from "@/components/sources-panel";
import { AgentStatus } from "@/components/agent-status";
import { Button } from "@/components/ui/button";
import { getThreadMessages } from "@/lib/threads.functions";
import { streamChat, type StreamEvent, type ChatAttachment, type ImageChatAttachment } from "@/lib/sse-client";
import type { Citation, ChatTurn } from "@/lib/agents/types";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/t/$threadId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Thread — Searchly" },
      { name: "description", content: "A cited answer thread on Searchly." },
    ],
  }),
  component: ThreadView,
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

function ThreadView() {
  const { threadId } = Route.useParams();
  const { q } = Route.useSearch();
  const getMsgs = useServerFn(getThreadMessages);
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootstrappedFor = useRef<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getMsgs({ data: { threadId } }),
  });

  // Hydrate messages from DB
  useEffect(() => {
    if (!data) return;
    const hydrated: Msg[] = data.messages.map((m) => {
      if (m.role === "user") return { id: m.id, role: "user", content: m.content };
      return {
        id: m.id,
        role: "assistant",
        content: m.content,
        citations: (m.citations as unknown as Citation[]) ?? [],
        follow_ups: (m.follow_ups as unknown as string[]) ?? [],
      };
    });
    setMessages(hydrated);
  }, [data]);

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
    if (attachments.length > 0) {
      notes.push(`📎 ${attachments.length} PDF: ${attachments.map((a) => a.filename).join(", ")}`);
    }
    if (imageAttachments.length > 0) {
      notes.push(`🖼️ ${imageAttachments.length} image: ${imageAttachments.map((a) => a.filename).join(", ")}`);
    }
    const attachmentNote = notes.length ? `\n\n_${notes.join(" · ")}_` : "";
    const userMsg: UserMsg = { id: `tmp-u-${Date.now()}`, role: "user", content: query + attachmentNote };
    const assistantId = `tmp-a-${Date.now()}`;
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
      for await (const ev of streamChat({ threadId, query, history, attachments, imageAttachments })) {
        handleEvent(ev, assistantId);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId && m.role === "assistant" ? { ...m, streaming: false } : m)),
      );
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["threads"] });
      qc.invalidateQueries({ queryKey: ["thread", threadId] });
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
            return {
              ...m,
              content: ev.answer,
              citations: ev.citations,
              follow_ups: ev.followups,
              streaming: false,
              status: undefined,
            };
          case "error":
            return { ...m, streaming: false, status: undefined, content: m.content || `Error: ${ev.message}` };
        }
      }),
    );
  };

  // Auto-run query from search param exactly once per thread
  useEffect(() => {
    if (isLoading) return;
    if (bootstrappedFor.current === threadId) return;
    bootstrappedFor.current = threadId;
    if (q && data && data.messages.length === 0) {
      const pdfKey = `pending-attachments:${threadId}`;
      const imgKey = `pending-images:${threadId}`;
      let pendingPdfs: ChatAttachment[] = [];
      let pendingImgs: ImageChatAttachment[] = [];
      try {
        const rawPdf = sessionStorage.getItem(pdfKey);
        if (rawPdf) pendingPdfs = JSON.parse(rawPdf) as ChatAttachment[];
        const rawImg = sessionStorage.getItem(imgKey);
        if (rawImg) pendingImgs = JSON.parse(rawImg) as ImageChatAttachment[];
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(pdfKey);
      sessionStorage.removeItem(imgKey);
      ask(q, pendingPdfs, pendingImgs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, threadId, q, data]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen">
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
            {messages.length === 0 && !isLoading && (
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
