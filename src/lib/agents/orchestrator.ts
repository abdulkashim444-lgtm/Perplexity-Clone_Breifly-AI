import { createLovableAiGateway } from "@/lib/ai-gateway.server";
import { analyzeQuery } from "./query-analyzer";
import { generateFollowUps } from "./followup";
import { rankSources, sourceQualityLow } from "./ranking";
import { runSearch, scrapeSources } from "./search";
import { streamSynthesis } from "./synthesis";
import { extractUploadedPdf } from "./pdf";
import type { ChatTurn, Citation, RankedSource, ScrapedDoc } from "./types";

export type PipelineEvent =
  | { type: "status"; step: string; detail?: string }
  | { type: "sources"; sources: Citation[] }
  | { type: "token"; text: string }
  | { type: "followups"; questions: string[] }
  | { type: "done"; answer: string; citations: Citation[]; followups: string[] }
  | { type: "error"; message: string };

export interface PdfAttachment {
  filename: string;
  /** Base64 (no data-URL prefix) of the PDF bytes. */
  base64: string;
}

interface RunArgs {
  lovableApiKey: string;
  tavilyApiKey: string;
  query: string;
  history: ChatTurn[];
  attachments?: PdfAttachment[];
}

export async function* runPipeline({
  lovableApiKey,
  tavilyApiKey,
  query,
  history,
  attachments = [],
}: RunArgs): AsyncGenerator<PipelineEvent> {
  const gateway = createLovableAiGateway(lovableApiKey);
  const fastModel = gateway("google/gemini-3.5-flash");
  const answerModel = gateway("google/gemini-3.6-flash");

  try {
    yield { type: "status", step: "analyzing", detail: "Understanding your question" };
    const plan = await analyzeQuery(fastModel, query, history);

    let ranked: RankedSource[] = [];
    if (plan.needs_search) {
      yield { type: "status", step: "searching", detail: `Searching ${plan.sub_queries.length} ${plan.sub_queries.length === 1 ? "query" : "queries"}` };
      let results = await runSearch(tavilyApiKey, plan.sub_queries);

      yield { type: "status", step: "reading", detail: `Reading ${Math.min(results.length, 6)} sources` };
      let scraped = await scrapeSources(tavilyApiKey, results);

      yield { type: "status", step: "ranking", detail: "Ranking sources" };
      ranked = rankSources(query, scraped);

      if (sourceQualityLow(ranked) && plan.sub_queries.length > 0) {
        yield { type: "status", step: "refining", detail: "Refining search" };
        const refined = plan.sub_queries.map((q) => `${q} explained in detail`);
        results = await runSearch(tavilyApiKey, refined);
        scraped = await scrapeSources(tavilyApiKey, results);
        ranked = rankSources(query, scraped);
      }
    }

    const citations: Citation[] = ranked.map((s) => ({
      id: s.citation_id,
      url: s.url,
      title: s.title,
      domain: s.source_domain,
    }));
    yield { type: "sources", sources: citations };

    yield { type: "status", step: "writing", detail: "Writing answer" };
    const stream = streamSynthesis(answerModel, query, ranked, history);
    let full = "";
    for await (const chunk of stream.textStream) {
      full += chunk;
      yield { type: "token", text: chunk };
    }

    yield { type: "status", step: "followups", detail: "Suggesting next questions" };
    const followups = await generateFollowUps(fastModel, query, full);
    yield { type: "followups", questions: followups };

    yield { type: "done", answer: full, citations, followups };
  } catch (err) {
    console.error("pipeline error", err);
    const message = err instanceof Error ? err.message : String(err);
    yield { type: "error", message };
  }
}
