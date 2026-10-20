import { createClient } from "@supabase/supabase-js";
import { GEN_BASE, loadCatalog, pollinationsKey, providerError } from "@/gen/server/pollinations";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { getUserFromRequest, supabaseEnabled } from "@/lib/supabase";

/**
 * Real AI video (text → video, image → video) through Pollinations. This spends the server's
 * Pollinations credits, so it is limited hard: per IP, signed-in users only when accounts are on,
 * only the curated models, durations inside each model's range, and GEN_ALLOW_VIDEO=0 switches it off.
 *
 * A start frame must be a public URL for the provider: a data URL from the browser is parked in the
 * public "gen-temp" Supabase bucket (service role) for the duration of the request and deleted after.
 */
export const maxDuration = 300;

const RATE_LIMIT = { name: "gen-video", limit: 4, windowMs: 10 * 60 * 1000 };
const MAX_PROMPT = 900;
const MAX_IMAGE_BYTES = 6_000_000;
const BUCKET = "gen-temp";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null;

const fail = (status: number, error: string, code: string) => Response.json({ error, code }, { status });

/** Uploads a data-URL image to the temp bucket; returns its public URL and a cleanup function. */
const parkImage = async (dataUrl: string) => {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("Rasm formati noto'g'ri (JPEG, PNG yoki WebP kerak)");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Rasm juda katta (6 MB gacha)");
  if (!admin) throw new Error("Rasmdan AI video uchun serverda Supabase (SUPABASE_SERVICE_ROLE_KEY) sozlangan bo'lishi kerak");
  const ext = m[1].split("/")[1];
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: m[1], cacheControl: "300" });
  if (error) throw new Error("Rasmni vaqtinchalik omborga yuklab bo'lmadi");
  const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  // Awaited by the caller: a serverless function may be frozen right after it responds.
  return { url, cleanup: () => admin.storage.from(BUCKET).remove([path]).then(() => undefined, () => undefined) };
};

export async function POST(req: Request) {
  const key = pollinationsKey();
  if (!key || process.env.GEN_ALLOW_VIDEO === "0") {
    return fail(503, "AI video hozir o'chirilgan (serverda POLLINATIONS_API_KEY va kredit kerak).", "no_api_key");
  }
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);
  if (supabaseEnabled && !(await getUserFromRequest(req))) return fail(401, "AI video uchun tizimga kiring.", "auth_required");

  let body: { prompt?: unknown; model?: unknown; duration?: unknown; aspectRatio?: unknown; resolution?: unknown; audio?: unknown; imageData?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "Noto'g'ri JSON", "bad_request");
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3) return fail(400, "Prompt yozing", "bad_request");
  if (prompt.length > MAX_PROMPT) return fail(413, `Prompt juda uzun (ko'pi bilan ${MAX_PROMPT} belgi)`, "too_large");

  const catalog = await loadCatalog();
  const model = catalog.video.find((m) => m.id === body.model);
  if (!model) return fail(400, "Bu video modeli mavjud emas", "bad_request");
  const duration = Math.min(model.maxDuration, Math.max(model.minDuration, Math.round(typeof body.duration === "number" ? body.duration : model.defaultDuration)));
  const aspect = typeof body.aspectRatio === "string" && /^(16:9|9:16|1:1|4:3|3:4|21:9)$/.test(body.aspectRatio) ? body.aspectRatio : "9:16";

  const params = new URLSearchParams({ model: model.id, duration: String(duration), aspectRatio: aspect });
  if (typeof body.resolution === "string" && model.resolutions.includes(body.resolution)) params.set("resolution", body.resolution);
  if (model.audio && body.audio === true) params.set("audio", "true");

  let parked: Awaited<ReturnType<typeof parkImage>> | null = null;
  try {
    if (typeof body.imageData === "string" && body.imageData) {
      if (!model.imageInput) return fail(400, "Bu model rasmdan video yarata olmaydi", "bad_request");
      parked = await parkImage(body.imageData);
      params.set("image", parked.url);
    }
    const res = await fetch(`${GEN_BASE}/image/${encodeURIComponent(prompt)}?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(280_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const e = providerError(res.status, await res.text().catch(() => ""));
      return fail(e.status, e.error, e.code);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("video/")) {
      // Some providers answer with JSON pointing at the file.
      const text = await res.text().catch(() => "");
      let url = "";
      try {
        const j = JSON.parse(text) as { url?: string; video?: string; data?: { url?: string }[] };
        url = j.url ?? j.video ?? j.data?.[0]?.url ?? "";
      } catch {
        /* not JSON */
      }
      if (!/^https:\/\//.test(url)) return fail(502, "Video javobi tushunarsiz formatda keldi.", "upstream");
      const file = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!file.ok) return fail(502, "Tayyor videoni yuklab bo'lmadi.", "upstream");
      return new Response(file.body, { headers: { "Content-Type": file.headers.get("content-type") ?? "video/mp4", "Cache-Control": "no-store", "X-Gen-Model": model.id } });
    }
    return new Response(res.body, { headers: { "Content-Type": type, "Cache-Control": "no-store", "X-Gen-Model": model.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    console.error("Video generation failed:", message);
    // Messages thrown by parkImage are safe to show; everything else is generic.
    return /^(Rasm|Rasmdan)/.test(message) ? fail(400, message, "bad_request") : fail(504, "Video yaratish vaqti tugadi — qayta urinib ko'ring.", "upstream");
  } finally {
    await parked?.cleanup();
  }
}
