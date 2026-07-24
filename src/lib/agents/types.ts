export type QueryType =
  | "factual" | "comparison" | "how-to" | "current-events" | "coding" | "opinion" | "follow-up";

export interface QueryPlan {
  needs_search: boolean;
  sub_queries: string[];
  query_type: QueryType;
  requires_context: boolean;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  source_domain: string;
  published_date?: string;
}

export interface ScrapedDoc extends SearchResult {
  clean_text: string;
  word_count: number;
  fetch_status: "ok" | "fallback" | "failed";
}

export interface RankedSource extends ScrapedDoc {
  relevance_score: number;
  citation_id: number;
}

export interface Citation {
  id: number;
  url: string;
  title: string;
  domain: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
