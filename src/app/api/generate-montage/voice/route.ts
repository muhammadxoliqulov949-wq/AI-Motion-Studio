import { VoiceRequestSchema, type ApiError } from "@/montage/types";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_generateSpeech as generateSpeech } from "ai";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const maxDuration = 30;

// One call per scene, up to 8 scenes per montage.
const RATE_LIMIT = { name: "montage-voice", limit: 60, windowMs: 10 * 60 * 1000 };

const fail = (status: number, error: string, code: ApiError["code"]) =>
  Response.json({ error, code } satisfies ApiError, { status });

/**
 * Text → speech for one scene. Returns raw MP3 bytes so the browser can measure the
 * exact duration and stretch the scene to fit the voiceover.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(503, 'Serverda "OPENAI_API_KEY" sozlanmagan.', "no_api_key");

  let input;
  try {
    input = VoiceRequestSchema.parse(await req.json());
  } catch {
    return fail(400, "Ovoz uchun matn 1–600 belgi bo'lishi kerak.", "bad_request");
  }

  try {
    const openai = createOpenAI({ apiKey });
    const { audio } = await generateSpeech({
      model: openai.speech(process.env.MONTAGE_TTS_MODEL ?? "gpt-4o-mini-tts"),
      text: input.text,
      voice: input.voice,
      outputFormat: "mp3",
      instructions: "Energetic, warm social-media narrator. Clear pronunciation, natural pace.",
      maxRetries: 1,
    });
    return new Response(new Blob([audio.uint8Array as Uint8Array<ArrayBuffer>]), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("TTS failed:", err);
    return fail(502, "Ovoz yaratib bo'lmadi.", "tts_error");
  }
}
