import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_generateSpeech as generateSpeech } from "ai";

/**
 * Text-to-speech for voiceovers. Returns audio/mpeg.
 * - provider "azure": Azure AI Speech neural voices incl. native Uzbek (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION)
 * - provider "openai": gpt-4o-mini-tts (OPENAI_API_KEY)
 * GET reports which providers are configured so the UI only offers voices that will work.
 */

// A script video with emotion tags makes one call per tagged segment (~25 per video).
const RATE_LIMIT = { name: "tts", limit: 150, windowMs: 10 * 60 * 1000 };
const MAX_TEXT = 1500;
const OPENAI_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]);
/** Azure voice names look like "uz-UZ-MadinaNeural". */
const AZURE_VOICE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/;

const azureConfig = () => {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  return key && region && /^[a-z0-9-]+$/i.test(region) ? { key, region } : null;
};

export function GET() {
  return Response.json({ azure: !!azureConfig(), openai: !!process.env.OPENAI_API_KEY }, { headers: { "Cache-Control": "no-store" } });
}

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Relative SSML value: 12 → "+12%", -8 → "-8%". */
const pct = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n)}%`;
const clampN = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

/** Emotion → prosody offsets in percent (rate, pitch, volume), validated before they reach the SSML. */
interface Prosody {
  rate: number;
  pitch: number;
  volume: number;
}

async function azureSpeech(text: string, voice: string, speed: number, prosody: Prosody, cfg: { key: string; region: string }) {
  const lang = voice.split("-").slice(0, 2).join("-");
  // Speed (0.5–2) and the emotion's rate offset combine into one relative rate.
  const rate = (speed - 1) * 100 + prosody.rate;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${pct(Math.max(-60, Math.min(100, rate)))}" pitch="${pct(prosody.pitch)}" volume="${pct(prosody.volume)}">${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": cfg.key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "ai-motion-studio",
    },
    body: ssml,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Azure Speech kaliti yoki hududi noto'g'ri" : res.status === 429 ? "Azure Speech limiti tugadi" : `Azure Speech xatosi (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  let body: { text?: unknown; voice?: unknown; speed?: unknown; style?: unknown; prosody?: { rate?: unknown; pitch?: unknown; volume?: unknown } };
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
  const speed = typeof body.speed === "number" ? Math.min(2, Math.max(0.5, body.speed)) : 1;
  const style = typeof body.style === "string" ? body.style.slice(0, 300) : "";
  const prosody: Prosody = {
    rate: clampN(body.prosody?.rate, -40, 40),
    pitch: clampN(body.prosody?.pitch, -20, 20),
    volume: clampN(body.prosody?.volume, -50, 30),
  };
  // "provider:name"; a bare name is an OpenAI voice (older clients).
  const raw = typeof body.voice === "string" ? body.voice : "openai:nova";
  const [provider, name] = raw.includes(":") ? [raw.slice(0, raw.indexOf(":")), raw.slice(raw.indexOf(":") + 1)] : ["openai", raw];

  const audioResponse = (bytes: Uint8Array) =>
    new Response(new Blob([bytes as BlobPart]), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });

  if (provider === "azure") {
    const cfg = azureConfig();
    if (!cfg) {
      return Response.json({ error: 'Serverda "AZURE_SPEECH_KEY" va "AZURE_SPEECH_REGION" sozlanmagan.', code: "no_api_key" }, { status: 503 });
    }
    if (!AZURE_VOICE.test(name)) return Response.json({ error: "Noma'lum ovoz", code: "bad_request" }, { status: 400 });
    try {
      return audioResponse(await azureSpeech(text, name, speed, prosody, cfg));
    } catch (err) {
      console.error("Azure TTS failed:", err);
      return Response.json({ error: err instanceof Error ? err.message : "Ovoz yaratilmadi", code: "model_error" }, { status: 502 });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Serverda "OPENAI_API_KEY" sozlanmagan.', code: "no_api_key" }, { status: 503 });
  }
  const voice = OPENAI_VOICES.has(name) ? name : "nova";
  try {
    const openai = createOpenAI({ apiKey });
    const result = await generateSpeech({
      model: openai.speech(process.env.MONTAGE_TTS_MODEL ?? "gpt-4o-mini-tts"),
      text,
      voice,
      speed,
      outputFormat: "mp3",
      instructions:
        `Speak naturally and clearly in the language of the text. If it is Uzbek (Latin script), pronounce it as a native Uzbek speaker: oʻ and gʻ are single sounds, read numbers and dates in Uzbek. ${style}`.trim(),
    });
    return audioResponse(result.audio.uint8Array);
  } catch (err) {
    console.error("TTS failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Ovoz yaratilmadi", code: "model_error" }, { status: 502 });
  }
}
