import { createFileRoute } from "@tanstack/react-router";

import { runPipeline, type PdfAttachment, type ImageAttachment, type PipelineEvent } from "@/lib/agents/orchestrator";
import type { ChatTurn } from "@/lib/agents/types";

interface Body {
  threadId: string;
  query: string;
  history: ChatTurn[];
  attachments?: PdfAttachment[];
  imageAttachments?: ImageAttachment[];
  guest?: boolean;
  simplify?: boolean;
}


function sseFrame(event: PipelineEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lovableKey = process.env.LOVABLE_API_KEY;
        const tavilyKey = process.env.TAVILY_API_KEY;
        if (!lovableKey || !tavilyKey) {
          return new Response("Missing API keys", { status: 500 });
        }

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!body.query?.trim()) {
          return new Response("Missing query", { status: 400 });
        }

        // Guest mode: no auth, no persistence
        const guest = body.guest === true;
        let supabase: any = null;
        let userId: string | null = null;

        if (!guest) {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.replace(/^Bearer\s+/i, "");
          if (!token) return new Response("Unauthorized", { status: 401 });

          const sbUrl = process.env.SUPABASE_URL!;
          const sbKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const { createClient } = await import("@supabase/supabase-js");
          supabase = createClient(sbUrl, sbKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
          userId = userData.user.id;

          if (!body.threadId) {
            return new Response("Missing threadId", { status: 400 });
          }

          // Persist user message
          await supabase.from("messages").insert({
            thread_id: body.threadId,
            user_id: userId,
            role: "user",
            content: body.query,
          });

          // Update thread title if still default
          const { data: thread } = await supabase
            .from("threads")
            .select("title")
            .eq("id", body.threadId)
            .maybeSingle();
          if (thread && (thread.title === "New search" || !thread.title)) {
            await supabase
              .from("threads")
              .update({ title: body.query.slice(0, 80) })
              .eq("id", body.threadId);
          }
        }


        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let finalAnswer = "";
            let finalCitations: PipelineEvent extends { type: "done"; citations: infer C } ? C : never = [] as never;
            let finalFollowups: string[] = [];
            try {
              for await (const event of runPipeline({
                lovableApiKey: lovableKey,
                tavilyApiKey: tavilyKey,
                query: body.query,
                history: body.history ?? [],
                attachments: body.attachments ?? [],
                imageAttachments: body.imageAttachments ?? [],
              })) {
                controller.enqueue(encoder.encode(sseFrame(event)));
                if (event.type === "done") {
                  finalAnswer = event.answer;
                  finalCitations = event.citations as never;
                  finalFollowups = event.followups;
                }
              }
              // Persist assistant message (skip for guests)
              if (finalAnswer && supabase && userId) {
                await supabase.from("messages").insert({
                  thread_id: body.threadId,
                  user_id: userId,
                  role: "assistant",
                  content: finalAnswer,
                  citations: finalCitations,
                  follow_ups: finalFollowups,
                });
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              controller.enqueue(encoder.encode(sseFrame({ type: "error", message })));
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
          },
        });
      },
    },
  },
});

