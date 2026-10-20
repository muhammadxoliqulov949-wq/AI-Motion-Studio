/**
 * Voiceover voices: Microsoft neural voices, free and keyless, served by /api/tts (see src/lib/edge-tts.ts).
 * Includes real Uzbek voices (Madina, Sardor). Azure AI Speech can be configured on the server as a fallback;
 * it serves the very same voice names, so nothing changes for the UI.
 */

export type VoiceProvider = "edge";
export type VoiceLang = "uz" | "ru" | "en" | "tr" | "kk" | "de" | "fr" | "es" | "ar" | "zh" | "ja" | "ko" | "hi";

export interface VoiceOption {
  /** "edge:<voice name>" — what the UI and API pass around. */
  id: string;
  provider: VoiceProvider;
  name: string;
  label: string;
  lang: VoiceLang;
  gender: "f" | "m";
}

const v = (name: string, label: string, lang: VoiceLang, gender: "f" | "m"): VoiceOption => ({ id: `edge:${name}`, provider: "edge", name, label, lang, gender });

export const VOICES: VoiceOption[] = [
  v("uz-UZ-MadinaNeural", "Madina — o'zbek, ayol", "uz", "f"),
  v("uz-UZ-SardorNeural", "Sardor — o'zbek, erkak", "uz", "m"),
  v("ru-RU-SvetlanaNeural", "Svetlana — rus, ayol", "ru", "f"),
  v("ru-RU-DmitryNeural", "Dmitriy — rus, erkak", "ru", "m"),
  v("en-US-JennyNeural", "Jenny — ingliz (AQSH), ayol", "en", "f"),
  v("en-US-GuyNeural", "Guy — ingliz (AQSH), erkak", "en", "m"),
  v("en-GB-SoniaNeural", "Sonia — ingliz (Britaniya), ayol", "en", "f"),
  v("en-GB-RyanNeural", "Ryan — ingliz (Britaniya), erkak", "en", "m"),
  v("tr-TR-EmelNeural", "Emel — turk, ayol", "tr", "f"),
  v("tr-TR-AhmetNeural", "Ahmet — turk, erkak", "tr", "m"),
  v("kk-KZ-AigulNeural", "Aigul — qozoq, ayol", "kk", "f"),
  v("kk-KZ-DauletNeural", "Daulet — qozoq, erkak", "kk", "m"),
  v("de-DE-KatjaNeural", "Katja — nemis, ayol", "de", "f"),
  v("de-DE-ConradNeural", "Conrad — nemis, erkak", "de", "m"),
  v("fr-FR-DeniseNeural", "Denise — fransuz, ayol", "fr", "f"),
  v("fr-FR-HenriNeural", "Henri — fransuz, erkak", "fr", "m"),
  v("es-ES-ElviraNeural", "Elvira — ispan, ayol", "es", "f"),
  v("es-ES-AlvaroNeural", "Álvaro — ispan, erkak", "es", "m"),
  v("ar-SA-ZariyahNeural", "Zariyah — arab, ayol", "ar", "f"),
  v("ar-SA-HamedNeural", "Hamed — arab, erkak", "ar", "m"),
  v("zh-CN-XiaoxiaoNeural", "Xiaoxiao — xitoy, ayol", "zh", "f"),
  v("zh-CN-YunxiNeural", "Yunxi — xitoy, erkak", "zh", "m"),
  v("ja-JP-NanamiNeural", "Nanami — yapon, ayol", "ja", "f"),
  v("ja-JP-KeitaNeural", "Keita — yapon, erkak", "ja", "m"),
  v("ko-KR-SunHiNeural", "Sun-Hi — koreys, ayol", "ko", "f"),
  v("ko-KR-InJoonNeural", "InJoon — koreys, erkak", "ko", "m"),
  v("hi-IN-SwaraNeural", "Swara — hind, ayol", "hi", "f"),
  v("hi-IN-MadhurNeural", "Madhur — hind, erkak", "hi", "m"),
];

export const DEFAULT_VOICE_ID = "edge:uz-UZ-MadinaNeural";

export const voiceById = (id: string | undefined) => VOICES.find((x) => x.id === id);

/** Ids from older versions ("openai:nova", "azure:uz-UZ-…", bare "nova") map to a voice of the catalog. */
export const normalizeVoiceId = (id: string | undefined) => {
  if (!id) return DEFAULT_VOICE_ID;
  const name = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return voiceById(`edge:${name}`) ? `edge:${name}` : DEFAULT_VOICE_ID;
};

export const LANG_LABELS: Record<VoiceLang, string> = {
  uz: "O'zbek",
  ru: "Rus",
  en: "Ingliz",
  tr: "Turk",
  kk: "Qozoq",
  de: "Nemis",
  fr: "Fransuz",
  es: "Ispan",
  ar: "Arab",
  zh: "Xitoy",
  ja: "Yapon",
  ko: "Koreys",
  hi: "Hind",
};

/** Short line spoken by the "tinglab ko'rish" button, in the voice's own language. */
export const PREVIEW_TEXT: Record<VoiceLang, string> = {
  uz: "Assalomu alaykum! Bu mening ovozim. Videongiz uchun shu ovozni tanlaysizmi?",
  ru: "Здравствуйте! Это мой голос. Хотите озвучить ваше видео этим голосом?",
  en: "Hello! This is my voice. Would you like me to narrate your video?",
  tr: "Merhaba! Bu benim sesim. Videonuzu bu sesle seslendirelim mi?",
  kk: "Сәлеметсіз бе! Бұл менің дауысым. Бейнеңізді осы дауыспен дыбыстайық па?",
  de: "Hallo! Das ist meine Stimme. Soll ich Ihr Video vertonen?",
  fr: "Bonjour ! Voici ma voix. Voulez-vous que je raconte votre vidéo ?",
  es: "¡Hola! Esta es mi voz. ¿Quieres que narre tu vídeo?",
  ar: "مرحباً! هذا صوتي. هل تريد أن أروي الفيديو الخاص بك؟",
  zh: "你好！这是我的声音。要不要用它来给你的视频配音？",
  ja: "こんにちは！これが私の声です。この声で動画のナレーションをしましょうか？",
  ko: "안녕하세요! 제 목소리입니다. 이 목소리로 영상을 내레이션할까요?",
  hi: "नमस्ते! यह मेरी आवाज़ है। क्या आप चाहेंगे कि मैं आपके वीडियो का नैरेशन करूँ?",
};

export interface TtsCapabilities {
  edge: boolean;
  /** Optional official fallback configured on the server. */
  azure: boolean;
}

export interface SpeakOptions {
  text: string;
  voice: string;
  speed?: number;
  /** Offsets in percent (rate, pitch, volume) relative to the voice's default delivery. */
  prosody?: { rate?: number; pitch?: number; volume?: number };
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
export const speak = async ({ text, voice, speed = 1, prosody, signal }: SpeakOptions): Promise<Blob> => {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: normalizeVoiceId(voice), speed, ...(prosody ? { prosody } : {}) }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new TtsError(data.code === "rate_limited" ? "Juda ko'p so'rov — birozdan keyin urinib ko'ring." : (data.error ?? `HTTP ${res.status}`), data.code);
  }
  return res.blob();
};

let capabilities: Promise<TtsCapabilities> | null = null;
/** What the server offers (cached for the session). */
export const ttsCapabilities = () => {
  capabilities ??= fetch("/api/tts")
    .then((r) => r.json() as Promise<TtsCapabilities>)
    .catch(() => ({ edge: true, azure: false }));
  return capabilities;
};

/** Every voice works without a key; Uzbek first. */
export const usableVoices = () => VOICES;

/** Default voice: the native Uzbek voice Madina. */
export const defaultVoice = () => DEFAULT_VOICE_ID;

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
