import { supabase } from "@/integrations/supabase/client";
import type { Citation, ChatTurn } from "@/lib/agents/types";

export type StreamEvent =
  | { type: "status"; step: string; detail?: string }
  | { type: "sources"; sources: Citation[] }
  | { type: "token"; text: string }
  | { type: "followups"; questions: string[] }
  | { type: "done"; answer: string; citations: Citation[]; followups: string[] }
  | { type: "error"; message: string };

export interface ChatAttachment {
  filename: string;
  base64: string;
}

export interface ImageChatAttachment {
  filename: string;
  base64: string;
  mimeType: string;
}

export async function* streamChat(args: {
  threadId: string;
  query: string;
  history: ChatTurn[];
  attachments?: ChatAttachment[];
  imageAttachments?: ImageChatAttachment[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      threadId: args.threadId,
      query: args.query,
      history: args.history,
      attachments: args.attachments ?? [],
      imageAttachments: args.imageAttachments ?? [],
    }),
    signal: args.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const payload = line.slice(6);
      try {
        yield JSON.parse(payload) as StreamEvent;
      } catch {
        // ignore malformed frames
      }
    }
  }
}
