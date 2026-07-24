import type { RankedSource, ScrapedDoc } from "./types";

const AUTHORITATIVE = /\.(gov|edu)$|(?:^|\.)(?:nytimes|bbc|reuters|apnews|nature|arxiv|wikipedia|github|stackoverflow|mdn|developer\.mozilla|who|nasa)\.(?:com|org|net|io|dev|int)$/i;

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function overlapScore(query: string, text: string): number {
  const q = tokenize(query);
  const t = tokenize(text.slice(0, 2000));
  if (q.size === 0) return 0;
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return hit / q.size;
}

/** Agent 4: score, dedupe, pick top sources. */
export function rankSources(query: string, docs: ScrapedDoc[]): RankedSource[] {
  const seenDomains = new Map<string, number>();
  const scored = docs.map((d) => {
    const rel = overlapScore(query, `${d.title} ${d.clean_text}`);
    const domainBoost = AUTHORITATIVE.test(d.source_domain) ? 0.15 : 0;
    const lenBoost = Math.min(d.word_count / 800, 1) * 0.1;
    const statusPenalty = d.fetch_status === "failed" ? -0.3 : d.fetch_status === "fallback" ? -0.05 : 0;
    return { doc: d, score: rel + domainBoost + lenBoost + statusPenalty };
  });
  scored.sort((a, b) => b.score - a.score);
  const out: RankedSource[] = [];
  for (const { doc, score } of scored) {
    const seen = seenDomains.get(doc.source_domain) ?? 0;
    if (seen >= 2) continue; // limit near-duplicates from same domain
    seenDomains.set(doc.source_domain, seen + 1);
    out.push({ ...doc, relevance_score: score, citation_id: out.length + 1 });
    if (out.length >= 6) break;
  }
  return out;
}

export function sourceQualityLow(ranked: RankedSource[]): boolean {
  if (ranked.length < 2) return true;
  const avg = ranked.reduce((s, r) => s + r.relevance_score, 0) / ranked.length;
  return avg < 0.1;
}
