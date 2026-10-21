import { EdgeTtsError, edgeSpeak } from "./edge-tts";

/**
 * Server-side text-to-speech shared by every voiceover route. No OpenAI involved.
 * 1. Microsoft Edge neural voices: free, no key, native Uzbek (src/lib/edge-tts.ts).
 * 2. Azure AI Speech (same voices, official, free tier) when AZURE_SPEECH_KEY + AZURE_SPEECH_REGION are set;
 *    used as the fallback if the unofficial Edge endpoint refuses us.
 */

export const DEFAULT_VOICE = "uz-UZ-MadinaNeural";
/** Azure/Edge voice names look like "uz-UZ-MadinaNeural". */
export const NEURAL_VOICE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/;

export interface Prosody {
  rate: number;
  pitch: number;
  volume: number;
}

export const azureConfig = () => {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  return key && region && /^[a-z0-9-]+$/i.test(region) ? { key, region } : null;
};

/**
 * "edge:uz-UZ-MadinaNeural", "azure:…" or a bare name → a neural voice name. Ids from older versions
 * ("openai:nova") fall back to the default Uzbek voice.
 */
export const resolveVoice = (raw: unknown): string => {
  if (typeof raw !== "string") return DEFAULT_VOICE;
  const name = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  return NEURAL_VOICE.test(name) ? name : DEFAULT_VOICE;
};

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const pct = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n)}%`;
const clampRate = (speed: number, prosody: Prosody) => Math.max(-60, Math.min(100, (speed - 1) * 100 + prosody.rate));

async function azureSpeech(text: string, voice: string, speed: number, prosody: Prosody, cfg: { key: string; region: string }) {
  const lang = voice.split("-").slice(0, 2).join("-");
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${pct(clampRate(speed, prosody))}" pitch="${pct(prosody.pitch)}" volume="${pct(prosody.volume)}">${escapeXml(text)}</prosody></voice></speak>`;
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

export class TtsError extends Error {}

/** Text → MP3 bytes. Throws TtsError with a user-facing (Uzbek) message. */
export async function synthesizeSpeech(opts: { text: string; voice?: unknown; speed?: number; prosody?: Partial<Prosody> }): Promise<Uint8Array> {
  const voice = resolveVoice(opts.voice);
  const speed = Math.min(2, Math.max(0.5, opts.speed ?? 1));
  const prosody: Prosody = { rate: opts.prosody?.rate ?? 0, pitch: opts.prosody?.pitch ?? 0, volume: opts.prosody?.volume ?? 0 };
  let edgeFailure: unknown;
  try {
    return await edgeSpeak({ text: opts.text, voice, rate: clampRate(speed, prosody), pitch: prosody.pitch, volume: prosody.volume });
  } catch (err) {
    edgeFailure = err;
    console.error("Edge TTS failed:", err instanceof Error ? err.message : err);
  }
  const azure = azureConfig();
  if (azure) {
    try {
      return await azureSpeech(opts.text, voice, speed, prosody, azure);
    } catch (err) {
      console.error("Azure TTS failed:", err instanceof Error ? err.message : err);
      throw new TtsError(err instanceof Error ? err.message : "Ovoz yaratilmadi");
    }
  }
  throw new TtsError(
    edgeFailure instanceof EdgeTtsError && edgeFailure.refused
      ? "Bepul ovoz xizmati (Microsoft Edge) hozir javob bermayapti. Birozdan keyin qayta urinib ko'ring."
      : "Ovoz yaratilmadi — qayta urinib ko'ring.",
  );
}
