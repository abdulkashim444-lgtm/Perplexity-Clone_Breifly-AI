import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { ChatTurn, QueryPlan } from "./types";

export async function analyzeQuery(
  model: LanguageModel,
  query: string,
  history: ChatTurn[],
): Promise<QueryPlan> {
  const historyText = history.slice(-6).map((h) => `${h.role}: ${h.content.slice(0, 400)}`).join("\n");
  const prompt = `You are the query analyzer for a Perplexity-style AI answer engine. Analyze the user's latest question and produce a compact JSON plan.

Conversation so far:
${historyText || "(none)"}

Latest user query: "${query}"

Return ONLY a JSON object with these exact fields, no prose, no code fences:
{
  "needs_search": boolean,     // false only for pure math/definitions/greetings that don't need the live web
  "sub_queries": string[],     // 1 to 4 focused web-search queries. Rewrite pronouns using history if needed.
  "query_type": "factual" | "comparison" | "how-to" | "current-events" | "coding" | "opinion" | "follow-up",
  "requires_context": boolean  // true if prior turns are needed to interpret the query
}`;
  const { text } = await generateText({ model, prompt });
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as QueryPlan;
    if (!Array.isArray(parsed.sub_queries) || parsed.sub_queries.length === 0) {
      parsed.sub_queries = [query];
    }
    parsed.sub_queries = parsed.sub_queries.slice(0, 4).map(String);
    return parsed;
  } catch {
    return {
      needs_search: true,
      sub_queries: [query],
      query_type: "factual",
      requires_context: history.length > 0,
    };
  }
}
