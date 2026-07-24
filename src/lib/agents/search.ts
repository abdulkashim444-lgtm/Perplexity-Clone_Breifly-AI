import type { ScrapedDoc, SearchResult } from "./types";
import { fetchAndExtractPdf, isPdfUrl } from "./pdf";

const BLOCKED = new Set(["pinterest.com", "quora.com"]);

interface TavilyResult {
  url: string;
  title: string;
  content: string;
  raw_content?: string | null;
  published_date?: string;
  score?: number;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function tavilySearch(
  apiKey: string,
  query: string,
  { maxResults = 6, includeRaw = true }: { maxResults?: number; includeRaw?: boolean } = {},
): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: maxResults,
      include_raw_content: includeRaw,
    }),
  });
  if (!res.ok) {
    console.error("Tavily error", res.status, await res.text());
    return [];
  }
  const data = (await res.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

/** Agent 2: search across sub-queries in parallel, dedupe URLs. */
export async function runSearch(apiKey: string, subQueries: string[]): Promise<SearchResult[]> {
  const batches = await Promise.all(
    subQueries.map((q) => tavilySearch(apiKey, q, { maxResults: 6, includeRaw: false })),
  );
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const batch of batches) {
    for (const r of batch) {
      if (!r.url || seen.has(r.url)) continue;
      const domain = domainOf(r.url);
      if (BLOCKED.has(domain)) continue;
      seen.add(r.url);
      out.push({
        url: r.url,
        title: r.title || domain,
        snippet: r.content || "",
        source_domain: domain,
        published_date: r.published_date,
      });
    }
  }
  return out.slice(0, 12);
}

/**
 * Agent 3: fetch clean full-text content. Uses Tavily's include_raw_content by
 * re-querying with the URL as the query string — this reuses the same provider
 * (per user choice) instead of hand-rolling httpx+trafilatura.
 */
export async function scrapeSources(
  apiKey: string,
  results: SearchResult[],
  topN = 6,
): Promise<ScrapedDoc[]> {
  const top = results.slice(0, topN);
  const scraped = await Promise.all(
    top.map(async (r): Promise<ScrapedDoc> => {
      try {
        const res = await fetch("https://api.tavily.com/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: apiKey, urls: [r.url] }),
        });
        if (!res.ok) throw new Error(`extract ${res.status}`);
        const data = (await res.json()) as { results?: { raw_content?: string }[] };
        const raw = data.results?.[0]?.raw_content ?? "";
        const clean = raw.replace(/\s+/g, " ").trim().slice(0, 6000);
        if (clean.length < 200) {
          return { ...r, clean_text: r.snippet, word_count: r.snippet.split(/\s+/).length, fetch_status: "fallback" };
        }
        return { ...r, clean_text: clean, word_count: clean.split(/\s+/).length, fetch_status: "ok" };
      } catch {
        return { ...r, clean_text: r.snippet, word_count: r.snippet.split(/\s+/).length, fetch_status: "fallback" };
      }
    }),
  );
  return scraped;
}
