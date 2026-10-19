import { GEN_BASE, loadCatalog, pollinationsKey, providerError } from "@/gen/server/pollinations";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Text → image through Pollinations.
 * - With POLLINATIONS_API_KEY (free at enter.pollinations.ai): free image models, no watermark, no
 *   per-IP throttle.
 * - Without a key: the keyless public endpoint, called from this server (browsers are refused there:
 *   it demands a Turnstile token). It allows 1 image per 45 s per IP, so on a deployment that is 1 image
 *   per 45 s for ALL users, and the picture carries a small logo. Fine to try the studio, not to run it.
 */
export const maxDuration = 60;

const RATE_LIMIT = { name: "gen-image", limit: 40, windowMs: 10 * 60 * 1000 };
const MAX_PROMPT = 900;

const snap = (v: unknown, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(1536, Math.max(256, Math.round(n / 16) * 16));
};

export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  const key = pollinationsKey();

  let body: { prompt?: unknown; model?: unknown; width?: unknown; height?: unknown; seed?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Noto'g'ri JSON", code: "bad_request" }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 2) return Response.json({ error: "Prompt yozing", code: "bad_request" }, { status: 400 });
  if (prompt.length > MAX_PROMPT) return Response.json({ error: `Prompt juda uzun (ko'pi bilan ${MAX_PROMPT} belgi)`, code: "too_large" }, { status: 413 });

  if (!key) return keyless(prompt, snap(body.width, 1024), snap(body.height, 1024), typeof body.seed === "number" ? body.seed : 0);

  // Only the curated free image models: a client cannot pick an expensive one.
  const catalog = await loadCatalog();
  const model = catalog.image.find((m) => m.id === body.model) ?? catalog.image[0];
  const seed = typeof body.seed === "number" && Number.isInteger(body.seed) ? Math.min(2147483647, Math.max(-1, body.seed)) : -1;

  const params = new URLSearchParams({ model: model.id, width: String(snap(body.width, 1024)), height: String(snap(body.height, 1024)), seed: String(seed) });
  try {
    const res = await fetch(`${GEN_BASE}/image/${encodeURIComponent(prompt)}?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const e = providerError(res.status, await res.text().catch(() => ""));
      return Response.json({ error: e.error, code: e.code }, { status: e.status });
    }
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return Response.json({ error: "Kutilmagan javob turi", code: "upstream" }, { status: 502 });
    return new Response(res.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Gen-Model": model.id } });
  } catch (err) {
    console.error("Image generation failed:", (err as Error).message);
    return Response.json({ error: "Rasm yaratish vaqti tugadi — qayta urinib ko'ring.", code: "upstream" }, { status: 504 });
  }
}

/** The public keyless endpoint (watermarked, one image per 45 s per IP). */
async function keyless(prompt: string, width: number, height: number, seed: number) {
  const params = new URLSearchParams({ width: String(width), height: String(height), seed: String(Math.max(0, Math.round(seed))), nologo: "true" });
  try {
    const res = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`, { signal: AbortSignal.timeout(55_000), cache: "no-store" });
    if (res.ok && res.headers.get("content-type")?.startsWith("image/")) {
      return new Response(res.body, { headers: { "Content-Type": res.headers.get("content-type")!, "Cache-Control": "private, max-age=3600", "X-Gen-Model": "pollinations", "X-Gen-Watermark": "1" } });
    }
    const text = await res.text().catch(() => "");
    if (/FREE_LIMIT/.test(text)) {
      const wait = Number(/Retry after (\d+)s/.exec(text)?.[1]) || 45;
      return Response.json(
        { error: `Kalitsiz bepul rejimda server hamma foydalanuvchilar uchun 45 soniyada 1 ta rasm yaratadi. ${wait} soniyadan keyin urinib ko'ring yoki serverga bepul Pollinations kaliti qo'shing.`, code: "free_limit", retryAfter: wait },
        { status: 429 },
      );
    }
    const e = providerError(res.status, text);
    return Response.json({ error: e.error, code: e.code }, { status: e.status });
  } catch {
    return Response.json({ error: "Rasm yaratish vaqti tugadi — qayta urinib ko'ring.", code: "upstream" }, { status: 504 });
  }
}
