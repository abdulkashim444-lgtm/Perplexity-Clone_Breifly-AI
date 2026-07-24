import type { ScrapedDoc } from "./types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB cap
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];

export const SUPPORTED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export function isImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    return IMAGE_EXTS.some((ext) => p.endsWith(ext));
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

function mimeFromExt(url: string): string {
  const p = url.toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
}

const DESCRIBE_PROMPT =
  "Describe this image in detail for use as a research source. Include: (1) subject and setting, (2) any visible text transcribed verbatim, (3) charts/diagrams/data values, (4) notable objects, people, or branding. Be factual — do not speculate. Return prose, no preamble.";

/** Call Lovable AI Gateway (Gemini multimodal) to caption/OCR an image. */
async function describeImage(
  apiKey: string,
  imageUrl: string,
  filename?: string,
): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: filename ? `${DESCRIBE_PROMPT}\n(Filename: ${filename})` : DESCRIBE_PROMPT },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`image describe ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Fetch a remote image URL and turn it into a ScrapedDoc via multimodal captioning. */
export async function fetchAndExtractImage(
  apiKey: string,
  url: string,
  title?: string,
): Promise<ScrapedDoc | null> {
  try {
    // Pass the URL through directly — the gateway/provider fetches it.
    const text = await describeImage(apiKey, url);
    if (text.length < 20) return null;
    const domain = domainOf(url);
    return {
      url,
      title: title || url.split("/").pop() || domain,
      snippet: text.slice(0, 240),
      source_domain: domain,
      clean_text: text.slice(0, 6000),
      word_count: text.split(/\s+/).length,
      fetch_status: "ok",
    };
  } catch (err) {
    console.error("image extract failed", url, err);
    return null;
  }
}

/** Extract a user-uploaded image (base64) into a synthetic ScrapedDoc. */
export async function extractUploadedImage(
  apiKey: string,
  filename: string,
  base64: string,
  mimeType: string,
  index: number,
): Promise<ScrapedDoc | null> {
  try {
    // Rough size check via base64 length (n * 3/4).
    if ((base64.length * 3) / 4 > MAX_IMAGE_BYTES) return null;
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const text = await describeImage(apiKey, dataUrl, filename);
    if (text.length < 20) return null;
    return {
      url: `attachment://${encodeURIComponent(filename)}#img-${index}`,
      title: filename,
      snippet: text.slice(0, 240),
      source_domain: "uploaded image",
      clean_text: text.slice(0, 6000),
      word_count: text.split(/\s+/).length,
      fetch_status: "ok",
    };
  } catch (err) {
    console.error("uploaded image extract failed", filename, err);
    return null;
  }
}
