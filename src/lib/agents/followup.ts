import { generateText } from "ai";
import type { LanguageModel } from "ai";

export async function generateFollowUps(
  model: LanguageModel,
  query: string,
  answer: string,
): Promise<string[]> {
  const prompt = `Given the user's original question and the answer we produced, propose 3 concise follow-up questions that a curious reader might ask next. They should explore different angles: deeper detail, comparison, practical application, or a related but distinct topic. Keep each question under 90 characters. Return ONLY a JSON array of strings, no prose, no code fences.

Question: ${query}

Answer:
${answer.slice(0, 3000)}`;
  const { text } = await generateText({ model, prompt });
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const arr = JSON.parse(cleaned) as unknown;
    if (Array.isArray(arr)) return arr.map(String).slice(0, 4);
  } catch {
    // fall through
  }
  return [];
}
