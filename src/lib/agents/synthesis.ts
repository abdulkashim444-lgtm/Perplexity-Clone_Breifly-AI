import { streamText } from "ai";
import type { LanguageModel } from "ai";
import type { ChatTurn, RankedSource } from "./types";

export function buildSynthesisPrompt(
  query: string,
  sources: RankedSource[],
  history: ChatTurn[],
  simplify = false,
): { system: string; messages: { role: "user" | "assistant"; content: string }[] } {
  const hasSources = sources.length > 0;
  const sourceBlock = sources
    .map(
      (s) =>
        `[${s.citation_id}] ${s.title} — ${s.source_domain}\nURL: ${s.url}\n${s.clean_text.slice(0, 2500)}`,
    )
    .join("\n\n---\n\n");

  const hasUpload = sources.some((s) => s.url.startsWith("attachment://"));
  const uploadRule = hasUpload
    ? `\n- The user attached one or more files (sources whose URL starts with "attachment://"). Treat these as the primary subject. If the question is vague like "what is this", "summarize", or "explain", describe and summarize the attached source(s) directly — do not ask for more context.`
    : "";

  const baseRules = hasSources
    ? `Rules:
- Every factual claim MUST include an inline citation like [1] or [2, 3] matching the source numbers below.
- Do not invent facts or citations outside the numbered list.
- If sources conflict, explicitly say so and cite both sides.
- If the sources don't fully answer the question, combine them with your own knowledge to give the best complete answer — never refuse.
- Do not include a "Sources" section — the UI renders that separately.${uploadRule}`
    : `Rules:
- No external sources were retrieved for this question. Answer directly and confidently from your own knowledge.
- Do NOT say "no sources were provided" or refuse — just answer the question fully and clearly.
- Do not fabricate citation markers like [1] since there are no sources.
- For coding questions, include a complete, correct, runnable code solution with a short explanation.`;


  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: query },
  ];
  return { system, messages };
}

export function streamSynthesis(
  model: LanguageModel,
  query: string,
  sources: RankedSource[],
  history: ChatTurn[],
  simplify = false,
) {
  const { system, messages } = buildSynthesisPrompt(query, sources, history, simplify);
  return streamText({ model, system, messages });
}

