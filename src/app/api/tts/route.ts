import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { azureConfig, synthesizeSpeech, TtsError } from "@/lib/tts-server";

/**
 * Text-to-speech for voiceovers. Returns audio/mpeg. Free and keyless: Microsoft Edge neural voices
 * (native Uzbek: uz-UZ-MadinaNeural, uz-UZ-SardorNeural), with optional Azure AI Speech as a fallback.
 * Voice ids are "edge:<name>"; ids from older versions fall back to the default Uzbek voice.
 */
export const maxDuration = 60;

// A script video with emotion tags makes one call per tagged segment (~25 per video).
const RATE_LIMIT = { name: "tts", limit: 150, windowMs: 10 * 60 * 1000 };
const MAX_TEXT = 1500;

const clampN = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

export function GET() {
  return Response.json({ edge: true, azure: !!azureConfig() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  let body: { text?: unknown; voice?: unknown; speed?: unknown; prosody?: { rate?: unknown; pitch?: unknown; volume?: unknown } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Noto'g'ri JSON", code: "bad_request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Matn kerak", code: "bad_request" }, { status: 400 });
  if (text.length > MAX_TEXT) {
    return Response.json({ error: `Matn juda uzun (ko'pi bilan ${MAX_TEXT} belgi)`, code: "too_large" }, { status: 413 });
  }

  try {
    const audio = await synthesizeSpeech({
      text,
      voice: body.voice,
      speed: typeof body.speed === "number" ? body.speed : 1,
      prosody: { rate: clampN(body.prosody?.rate, -40, 40), pitch: clampN(body.prosody?.pitch, -20, 20), volume: clampN(body.prosody?.volume, -50, 30) },
    });
    return new Response(new Blob([audio as BlobPart]), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: err instanceof TtsError ? err.message : "Ovoz yaratilmadi", code: "model_error" }, { status: 502 });
  }
}
