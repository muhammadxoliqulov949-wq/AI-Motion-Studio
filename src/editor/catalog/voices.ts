/**
 * Voiceover voices. Two providers behind /api/tts:
 * - "azure": Microsoft neural voices through Azure AI Speech (AZURE_SPEECH_KEY + AZURE_SPEECH_REGION).
 *   Includes real Uzbek voices (Madina, Sardor); free tier of 500k characters per month.
 * - "openai": gpt-4o-mini-tts (OPENAI_API_KEY); multilingual, Uzbek is understandable but not native.
 */

export type VoiceProvider = "azure" | "openai";

export interface VoiceOption {
  /** "<provider>:<voice name>" — what the UI and API pass around. */
  id: string;
  provider: VoiceProvider;
  name: string;
  label: string;
  lang: "uz" | "ru" | "en" | "tr" | "multi";
  gender: "f" | "m";
}

const azure = (name: string, label: string, lang: VoiceOption["lang"], gender: "f" | "m"): VoiceOption => ({ id: `azure:${name}`, provider: "azure", name, label, lang, gender });
const openai = (name: string, label: string, gender: "f" | "m"): VoiceOption => ({ id: `openai:${name}`, provider: "openai", name, label, lang: "multi", gender });

export const VOICES: VoiceOption[] = [
  azure("uz-UZ-MadinaNeural", "Madina — o'zbek, ayol", "uz", "f"),
  azure("uz-UZ-SardorNeural", "Sardor — o'zbek, erkak", "uz", "m"),
  azure("ru-RU-SvetlanaNeural", "Svetlana — rus, ayol", "ru", "f"),
  azure("ru-RU-DmitryNeural", "Dmitriy — rus, erkak", "ru", "m"),
  azure("en-US-JennyNeural", "Jenny — ingliz, ayol", "en", "f"),
  azure("en-US-GuyNeural", "Guy — ingliz, erkak", "en", "m"),
  azure("tr-TR-EmelNeural", "Emel — turk, ayol", "tr", "f"),
  openai("nova", "Nova — ayol", "f"),
  openai("shimmer", "Shimmer — ayol", "f"),
  openai("coral", "Coral — ayol", "f"),
  openai("sage", "Sage — ayol", "f"),
  openai("onyx", "Onyx — erkak", "m"),
  openai("echo", "Echo — erkak", "m"),
  openai("ash", "Ash — erkak", "m"),
  openai("verse", "Verse — erkak", "m"),
];

export const voiceById = (id: string | undefined) => VOICES.find((v) => v.id === id);

/** Legacy ids from before the catalog ("nova") map to OpenAI voices. */
export const normalizeVoiceId = (id: string | undefined) => (id && id.includes(":") ? id : `openai:${id || "nova"}`);

export const LANG_LABELS: Record<VoiceOption["lang"], string> = { uz: "O'zbek", ru: "Rus", en: "Ingliz", tr: "Turk", multi: "AI (ko'p tilli)" };

/** Short line spoken by the "tinglab ko'rish" button, in the voice's own language. */
export const PREVIEW_TEXT: Record<VoiceOption["lang"], string> = {
  uz: "Assalomu alaykum! Bu mening ovozim. Videongiz uchun shu ovozni tanlaysizmi?",
  ru: "Здравствуйте! Это мой голос. Хотите озвучить ваше видео этим голосом?",
  en: "Hello! This is my voice. Would you like me to narrate your video?",
  tr: "Merhaba! Bu benim sesim. Videonuzu bu sesle seslendirelim mi?",
  multi: "Assalomu alaykum! Bu mening ovozim. Videongiz uchun shu ovozni tanlaysizmi?",
};

export interface TtsCapabilities {
  azure: boolean;
  openai: boolean;
}

export interface SpeakOptions {
  text: string;
  voice: string;
  speed?: number;
  style?: string;
  signal?: AbortSignal;
}

export class TtsError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Calls /api/tts and returns the MP3. */
export const speak = async ({ text, voice, speed = 1, style = "", signal }: SpeakOptions): Promise<Blob> => {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: normalizeVoiceId(voice), speed, style }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new TtsError(
      data.code === "no_api_key"
        ? "Bu ovoz uchun serverda kalit sozlanmagan (Azure: AZURE_SPEECH_KEY va AZURE_SPEECH_REGION, AI ovozlar: OPENAI_API_KEY)."
        : data.code === "rate_limited"
          ? "Juda ko'p so'rov — birozdan keyin urinib ko'ring."
          : (data.error ?? `HTTP ${res.status}`),
      data.code,
    );
  }
  return res.blob();
};

let capabilities: Promise<TtsCapabilities> | null = null;
/** Which providers the server has keys for (cached for the session). */
export const ttsCapabilities = () => {
  capabilities ??= fetch("/api/tts")
    .then((r) => r.json() as Promise<TtsCapabilities>)
    .catch(() => ({ azure: false, openai: true }));
  return capabilities;
};

/** Voices the user can actually use, Uzbek first. */
export const usableVoices = (caps: TtsCapabilities | null) => {
  const list = caps ? VOICES.filter((v) => caps[v.provider]) : VOICES;
  // Nothing configured at all: still show the catalog so the user sees what is coming.
  return list.length ? list : VOICES;
};

/** Default voice: a native Uzbek voice when Azure is configured, otherwise the first OpenAI voice. */
export const defaultVoice = (caps: TtsCapabilities | null) => (caps?.azure ? "azure:uz-UZ-MadinaNeural" : "openai:nova");

// ---------- Preview playback (one shared <audio>) ----------

const previewCache = new Map<string, string>();
let previewEl: HTMLAudioElement | null = null;

/** Plays a short sample of a voice (cached per voice); returns when playback has started. */
export const previewVoice = async (voice: VoiceOption, onEnd?: () => void) => {
  let url = previewCache.get(voice.id);
  if (!url) {
    url = URL.createObjectURL(await speak({ text: PREVIEW_TEXT[voice.lang], voice: voice.id }));
    previewCache.set(voice.id, url);
  }
  previewEl?.pause();
  previewEl = new Audio(url);
  previewEl.onended = () => onEnd?.();
  await previewEl.play();
};

export const stopPreview = () => previewEl?.pause();
