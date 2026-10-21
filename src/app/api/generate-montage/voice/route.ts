import { VoiceRequestSchema, type ApiError } from "@/montage/types";
import { synthesizeSpeech } from "@/lib/tts-server";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

// One call per scene, up to 8 scenes per montage.
const RATE_LIMIT = { name: "montage-voice", limit: 60, windowMs: 10 * 60 * 1000 };

const fail = (status: number, error: string, code: ApiError["code"]) =>
  Response.json({ error, code } satisfies ApiError, { status });

/**
 * Text → speech for one scene (free Microsoft neural voices, no API key). Returns raw MP3 bytes so the
 * browser can measure the exact duration and stretch the scene to fit the voiceover.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  let input;
  try {
    input = VoiceRequestSchema.parse(await req.json());
  } catch {
    return fail(400, "Ovoz uchun matn 1–600 belgi bo'lishi kerak.", "bad_request");
  }

  try {
    const audio = await synthesizeSpeech({ text: input.text, voice: input.voice, prosody: { rate: 6 } });
    return new Response(new Blob([audio as BlobPart]), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return fail(502, err instanceof Error ? err.message : "Ovoz yaratib bo'lmadi.", "tts_error");
  }
}
