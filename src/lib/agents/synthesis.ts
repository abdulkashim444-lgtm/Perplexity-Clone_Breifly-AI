import { streamText } from "ai";
import type { LanguageModel } from "ai";
import type { ChatTurn, RankedSource } from "./types";

export function buildSynthesisPrompt(
  query: string,
  sources: RankedSource[],
  history: ChatTurn[],
  simplify = false,
): { system: string; messages: { role: "user" | "assistant"; content: string }[] } {
  const sourceBlock = sources
    .map(
      (s) =>
        `[${s.citation_id}] ${s.title} — ${s.source_domain}\nURL: ${s.url}\n${s.clean_text.slice(0, 2500)}`,
    )
    .join("\n\n---\n\n");

  const baseRules = `Rules:
- Every factual claim MUST include an inline citation like [1] or [2, 3] matching the source numbers below.
- Do not invent facts or citations outside the numbered list.
- If sources conflict, explicitly say so and cite both sides.
- If the sources don't answer the question, say what's missing rather than guessing.
- Do not include a "Sources" section — the UI renders that separately.`;

  const simplifyRules = `
- SIMPLIFY MODE: write for a curious 12-year-old. Use short sentences (max ~15 words), plain everyday words, and no jargon. If a technical term is unavoidable, define it in parentheses.
- Start with a one-sentence TL;DR in **bold**.
- Prefer bullet lists over paragraphs. Keep each bullet to one idea.
- Keep the whole answer under ~180 words unless the question truly needs more.
- Still keep inline citations like [1] on every factual claim.`;

  const styleRules = simplify
    ? simplifyRules
    : `
- Prefer short paragraphs, bullet lists for enumerations, and a brief opening summary.`;

  const system = `You are Searchly, an AI answer engine. Write a clear, well-structured markdown answer to the user's question using ONLY the provided sources.

${baseRules}${styleRules}

Sources:
${sourceBlock}`;

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

