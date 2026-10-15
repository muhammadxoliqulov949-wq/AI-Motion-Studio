import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_transcribe as transcribe } from "ai";

/**
 * Speech-to-text for auto captions. The browser sends a short 16 kHz mono WAV chunk
 * (≤ ~2 minutes, well under Vercel's 4.5 MB body limit) and gets timed segments back.
 */

/** ~30 chunks per 10 minutes per IP. */
const RATE_LIMIT = { name: "transcribe", limit: 30, windowMs: 10 * 60 * 1000 };
const MAX_BYTES = 4_200_000;

export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Serverda "OPENAI_API_KEY" sozlanmagan.', code: "no_api_key" }, { status: 503 });
  }

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return Response.json({ error: "Audio bo'lagi juda katta", code: "too_large" }, { status: 413 });
  }
  let audio: Uint8Array;
  let language: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("audio");
    language = typeof form.get("language") === "string" ? String(form.get("language")) : null;
    if (!(file instanceof Blob)) throw new Error("audio kerak");
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Audio bo'lagi juda katta", code: "too_large" }, { status: 413 });
    }
    audio = new Uint8Array(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "Noto'g'ri so'rov", code: "bad_request" }, { status: 400 });
  }

  try {
    const openai = createOpenAI({ apiKey });
    const result = await transcribe({
      model: openai.transcription("whisper-1"),
      audio,
      providerOptions: {
        openai: {
          timestampGranularities: ["segment"],
          ...(language && /^[a-z]{2}$/.test(language) ? { language } : {}),
        },
      },
    });
    return Response.json({
      text: result.text,
      language: result.language ?? null,
      segments: result.segments.map((s) => ({ text: s.text.trim(), start: s.startSecond, end: s.endSecond })),
    });
  } catch (err) {
    console.error("Transcription failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Transkripsiya bajarilmadi", code: "model_error" }, { status: 502 });
  }
}
