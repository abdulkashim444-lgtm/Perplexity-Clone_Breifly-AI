import { extractText, getDocumentProxy } from "unpdf";
import type { ScrapedDoc } from "./types";

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB safety cap

export function isPdfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Extract clean text from a raw PDF buffer using unpdf (worker-compatible). */
export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : text;
  return joined.replace(/\s+/g, " ").trim();
}

/** Fetch a PDF URL and return a ScrapedDoc-ready record. */
export async function fetchAndExtractPdf(
  url: string,
  title?: string,
): Promise<ScrapedDoc | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/pdf,*/*" },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len && len > MAX_PDF_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_PDF_BYTES) return null;
    const text = await extractPdfText(buf);
    if (text.length < 200) return null;
    const clean = text.slice(0, 8000);
    const domain = domainOf(url);
    return {
      url,
      title: title || url.split("/").pop() || domain,
      snippet: clean.slice(0, 240),
      source_domain: domain,
      clean_text: clean,
      word_count: clean.split(/\s+/).length,
      fetch_status: "ok",
    };
  } catch (err) {
    console.error("pdf extract failed", url, err);
    return null;
  }
}

/** Extract a user-uploaded PDF (base64) into a synthetic ScrapedDoc. */
export async function extractUploadedPdf(
  filename: string,
  base64: string,
  index: number,
): Promise<ScrapedDoc | null> {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.byteLength > MAX_PDF_BYTES) return null;
    const text = await extractPdfText(bytes.buffer);
    if (text.length < 50) return null;
    const clean = text.slice(0, 8000);
    return {
      url: `attachment://${encodeURIComponent(filename)}#${index}`,
      title: filename,
      snippet: clean.slice(0, 240),
      source_domain: "uploaded PDF",
      clean_text: clean,
      word_count: clean.split(/\s+/).length,
      fetch_status: "ok",
    };
  } catch (err) {
    console.error("uploaded pdf extract failed", filename, err);
    return null;
  }
}
