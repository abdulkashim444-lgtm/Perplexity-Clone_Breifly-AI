import { createLovableAiGateway } from "@/lib/ai-gateway.server";
import { analyzeQuery } from "./query-analyzer";
import { generateFollowUps } from "./followup";
import { rankSources, sourceQualityLow } from "./ranking";
import { runSearch, scrapeSources } from "./search";
import { streamSynthesis } from "./synthesis";
import { extractUploadedPdf } from "./pdf";
import { extractUploadedImage } from "./image";
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

export interface ImageAttachment {
  filename: string;
  /** Base64 (no data-URL prefix) of the image bytes. */
  base64: string;
  /** MIME type, e.g. image/png, image/jpeg, image/webp, image/gif. */
  mimeType: string;
}

interface RunArgs {
  lovableApiKey: string;
  tavilyApiKey: string;
  query: string;
  history: ChatTurn[];
  attachments?: PdfAttachment[];
  imageAttachments?: ImageAttachment[];
  simplify?: boolean;
}

export async function* runPipeline({
  lovableApiKey,
  tavilyApiKey,
  query,
  history,
  attachments = [],
  imageAttachments = [],
  simplify = false,
}: RunArgs): AsyncGenerator<PipelineEvent> {

  const gateway = createLovableAiGateway(lovableApiKey);
  const fastModel = gateway("google/gemini-3.5-flash");
  const answerModel = gateway("google/gemini-3.6-flash");

  try {
    // Extract uploaded PDFs and images first — they become high-priority sources.
    let uploadedDocs: ScrapedDoc[] = [];
    if (attachments.length > 0) {
      yield {
        type: "status",
        step: "reading-uploads",
        detail: `Reading ${attachments.length} uploaded PDF${attachments.length === 1 ? "" : "s"}`,
      };
      const extracted = await Promise.all(
        attachments.map((a, i) => extractUploadedPdf(a.filename, a.base64, i)),
      );
      uploadedDocs.push(...extracted.filter((d): d is ScrapedDoc => d !== null));
    }
    if (imageAttachments.length > 0) {
      yield {
        type: "status",
        step: "reading-uploads",
        detail: `Reading ${imageAttachments.length} uploaded image${imageAttachments.length === 1 ? "" : "s"}`,
      };
      const extracted = await Promise.all(
        imageAttachments.map((a, i) =>
          extractUploadedImage(lovableApiKey, a.filename, a.base64, a.mimeType, i),
        ),
      );
      uploadedDocs.push(...extracted.filter((d): d is ScrapedDoc => d !== null));
    }


    yield { type: "status", step: "analyzing", detail: "Understanding your question" };
    const plan = await analyzeQuery(fastModel, query, history);

    let ranked: RankedSource[] = [];
    let scraped: ScrapedDoc[] = [...uploadedDocs];

    // When the user attached files, answer from those files. Only search the
    // web if the query clearly asks for outside info (e.g. "compare with…",
    // "latest news on…"). Otherwise a vague prompt like "what is this" ran a
    // web search for "what is this" and drowned the uploaded PDF in junk.
    const hasUploads = uploadedDocs.length > 0;
    // Skip web search for coding questions — the model answers better from its
    // own training than from noisy scraped snippets.
    const isCoding = plan.query_type === "coding";
    const wantsExternal = hasUploads
      ? /\b(latest|news|compare|vs\.?|versus|recent|today|price|current|according to|online|web|internet|search)\b/i.test(query)
      : plan.needs_search && !isCoding;

    if (wantsExternal) {
      yield { type: "status", step: "searching", detail: `Searching ${plan.sub_queries.length} ${plan.sub_queries.length === 1 ? "query" : "queries"}` };
      let results = await runSearch(tavilyApiKey, plan.sub_queries);

      yield { type: "status", step: "reading", detail: `Reading ${Math.min(results.length, 6)} sources` };
      const webScraped = await scrapeSources(tavilyApiKey, results, 6, lovableApiKey);
      scraped = [...uploadedDocs, ...webScraped];

      yield { type: "status", step: "ranking", detail: "Ranking sources" };
      ranked = rankSources(query, scraped);

      if (!hasUploads && sourceQualityLow(ranked) && plan.sub_queries.length > 0) {
        yield { type: "status", step: "refining", detail: "Refining search" };
        const refined = plan.sub_queries.map((q) => `${q} explained in detail`);
        results = await runSearch(tavilyApiKey, refined);
        const rescraped = await scrapeSources(tavilyApiKey, results, 6, lovableApiKey);
        scraped = [...uploadedDocs, ...rescraped];
        ranked = rankSources(query, scraped);
      }
    } else if (hasUploads) {
      yield { type: "status", step: "ranking", detail: "Ranking attached sources" };
      ranked = rankSources(query, uploadedDocs);
    }
    void scraped;


    const citations: Citation[] = ranked.map((s) => ({
      id: s.citation_id,
      url: s.url,
      title: s.title,
      domain: s.source_domain,
    }));
    yield { type: "sources", sources: citations };

    yield { type: "status", step: "writing", detail: "Writing answer" };
    const stream = streamSynthesis(answerModel, query, ranked, history, simplify);
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
