import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_generateSpeech as generateSpeech } from "ai";

/** Text-to-speech for voiceovers (OpenAI gpt-4o-mini-tts). Returns audio/mpeg. */

const RATE_LIMIT = { name: "tts", limit: 20, windowMs: 10 * 60 * 1000 };
const MAX_TEXT = 1500;
const VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]);

export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Serverda "OPENAI_API_KEY" sozlanmagan.', code: "no_api_key" }, { status: 503 });
  }

  let body: { text?: unknown; voice?: unknown; speed?: unknown; style?: unknown };
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
  const voice = typeof body.voice === "string" && VOICES.has(body.voice) ? body.voice : "nova";
  const speed = typeof body.speed === "number" ? Math.min(2, Math.max(0.5, body.speed)) : 1;
  const style = typeof body.style === "string" ? body.style.slice(0, 200) : "";

  try {
    const openai = createOpenAI({ apiKey });
    const result = await generateSpeech({
      model: openai.speech("gpt-4o-mini-tts"),
      text,
      voice,
      speed,
      outputFormat: "mp3",
      instructions: `Speak naturally and clearly in the language of the text (often Uzbek). ${style}`.trim(),
    });
    return new Response(new Blob([result.audio.uint8Array as BlobPart]), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("TTS failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Ovoz yaratilmadi", code: "model_error" }, { status: 502 });
  }
}
