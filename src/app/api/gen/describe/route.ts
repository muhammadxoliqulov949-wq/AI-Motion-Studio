import { extractText, getDocumentProxy } from "unpdf";
import { GEN_BASE, pollinationsKey, providerError } from "@/gen/server/pollinations";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Materials → one English image prompt. The user attaches pictures, video frames and documents with the
 * "+" button of AI Studio; a free Pollinations text model reads them and writes the prompt.
 * - Documents and the user's own words work without any key (keyless public endpoint: 1 reply per 30 s per IP).
 * - Reading pictures needs a vision model, which Pollinations only serves with a (free) key; without it
 *   the browser sends `imageHints` (colours, light) it measured itself instead.
 */
export const maxDuration = 60;

const RATE_LIMIT = { name: "gen-describe", limit: 30, windowMs: 10 * 60 * 1000 };
const MODEL = process.env.POLLINATIONS_TEXT_MODEL || "openai/gpt-5.4-nano";
/** The keyless public text endpoint (the keyed API refuses anything but tiny requests without a key). */
const KEYLESS_URL = "https://text.pollinations.ai/openai";
const MAX_IMAGES = 4;
const MAX_DOC_CHARS = 6000;

const SYSTEM = `You write prompts for a text-to-image model.
Combine the user's idea (it may be written in Uzbek or Russian) with the attached reference material:
- pictures: keep their subject, composition, colours, lighting and style unless the idea says otherwise;
- documents: find the one concrete visual that best represents them (a product, a place, an event poster…);
- colour/light hints: use them as the palette.
Answer with ONE English prompt of 25–70 words: subject, setting, style, lighting, colours, camera. No quotes, no lists, no explanations, no text to render in the picture unless the user asks for it.`;

interface Body {
  idea?: unknown;
  images?: unknown;
  imageHints?: unknown;
  documents?: unknown;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

async function pdfText(base64: string) {
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Noto'g'ri so'rov", code: "bad_request" }, { status: 400 });
  }
  const key = pollinationsKey();
  const idea = str(body.idea, 700).trim();
  const images = (Array.isArray(body.images) ? body.images : []).filter((u): u is string => typeof u === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(u) && u.length < 1_500_000).slice(0, MAX_IMAGES);
  const hints = (Array.isArray(body.imageHints) ? body.imageHints : []).map((h) => str(h, 300)).filter(Boolean).slice(0, MAX_IMAGES);

  // Documents: plain text from the browser, PDFs as base64 (text extracted here).
  const docs: string[] = [];
  for (const d of (Array.isArray(body.documents) ? body.documents : []).slice(0, 4) as { name?: unknown; text?: unknown; pdf?: unknown }[]) {
    const name = str(d?.name, 120) || "hujjat";
    let text = str(d?.text, MAX_DOC_CHARS * 2);
    if (!text && typeof d?.pdf === "string" && d.pdf.length < 6_000_000) {
      try {
        text = await pdfText(d.pdf);
      } catch {
        return Response.json({ error: `«${name}» PDF faylini o'qib bo'lmadi.`, code: "bad_document" }, { status: 400 });
      }
    }
    text = text.replace(/\s+/g, " ").trim();
    if (text) docs.push(`Document "${name}":\n${text.slice(0, MAX_DOC_CHARS)}`);
  }

  const useVision = !!key && images.length > 0;
  if (!idea && !docs.length && !hints.length && !useVision) {
    return Response.json(
      { error: images.length ? "Rasmni AI o'qishi uchun serverda bepul POLLINATIONS_API_KEY kerak. Hozircha rasmni «Videoga» tugmasi bilan videoga aylantirishingiz mumkin." : "Materiallarda o'qiladigan narsa topilmadi.", code: images.length ? "no_vision" : "empty" },
      { status: 400 },
    );
  }

  const text = [idea && `User's idea: ${idea}`, ...docs, ...hints.map((h, i) => `Reference picture ${i + 1} (measured): ${h}`), useVision && `${images.length} reference picture(s) attached.`].filter(Boolean).join("\n\n");
  const content = useVision ? [{ type: "text", text }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] : text;

  try {
    const messages = [{ role: "system", content: SYSTEM }, { role: "user", content }];
    const res = await fetch(key ? `${GEN_BASE}/v1/chat/completions` : KEYLESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(key ? { model: MODEL, messages, max_tokens: 220 } : { model: "openai", messages }),
      signal: AbortSignal.timeout(50_000),
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) {
      if (/FREE_LIMIT/.test(raw)) {
        const wait = Number(/Retry after (\d+)s/.exec(raw)?.[1]) || 30;
        return Response.json({ error: `Bepul rejimda AI 30 soniyada 1 marta javob beradi. ${wait} soniyadan keyin urinib ko'ring.`, code: "free_limit", retryAfter: wait }, { status: 429 });
      }
      const e = providerError(res.status, raw);
      return Response.json({ error: e.error, code: e.code }, { status: e.status });
    }
    const prompt = ((JSON.parse(raw) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .replace(/^prompt:\s*/i, "")
      .trim();
    if (!prompt) return Response.json({ error: "AI bo'sh javob qaytardi — qayta urinib ko'ring.", code: "upstream" }, { status: 502 });
    return Response.json({ prompt, usedVision: useVision }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Describe failed:", (err as Error).message);
    return Response.json({ error: "AI javob bermadi — qayta urinib ko'ring.", code: "upstream" }, { status: 504 });
  }
}
