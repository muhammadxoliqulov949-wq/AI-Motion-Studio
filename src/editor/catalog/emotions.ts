/**
 * Emotion tags for voiceovers, ElevenLabs style: "[excited] Bugun katta yangilik! [pause] [whispers] Hech kimga aytmang."
 * A tag colours the text that follows it, up to the next tag; [neutral] resets. Tags can be stacked
 * ("[sad][slow]"). [pause] / [pause 1.5s] inserts silence. Unknown tags are passed to the model as a
 * free-form delivery hint (e.g. "[sarcastically]").
 *
 * How a style is voiced depends on the provider:
 * - OpenAI gpt-4o-mini-tts follows the `instruction` text (best for English / Russian, decent in Uzbek);
 * - Azure neural voices (incl. Uzbek) have no emotion styles for uz-UZ, so rate / pitch / volume
 *   (prosody) approximate the mood.
 */

export interface EmotionStyle {
  /** Natural-language delivery hint for OpenAI. */
  instruction?: string;
  /** Azure prosody offsets in percent (relative to the voice default). */
  rate?: number;
  pitch?: number;
  volume?: number;
}

interface EmotionDef {
  /** Canonical tag name (English, what the AI director writes). */
  id: string;
  /** Label for the quick-insert chips (Uzbek). */
  label: string;
  /** Other spellings (Uzbek and English). */
  aliases: string[];
  style: EmotionStyle;
}

export const EMOTIONS: EmotionDef[] = [
  { id: "excited", label: "Hayajonli", aliases: ["hayajonli", "hayajon", "enthusiastic", "energetic", "energik"], style: { instruction: "Excited, energetic and enthusiastic, with a bright smile in the voice.", rate: 10, pitch: 8, volume: 8 } },
  { id: "cheerful", label: "Quvnoq", aliases: ["quvnoq", "xursand", "happy", "cheerful", "smiling"], style: { instruction: "Cheerful, warm and friendly, smiling while speaking.", rate: 5, pitch: 5 } },
  { id: "calm", label: "Sokin", aliases: ["sokin", "tinch", "relaxed", "soft", "gentle"], style: { instruction: "Calm, soft and relaxed, unhurried and soothing.", rate: -12, pitch: -3, volume: -8 } },
  { id: "serious", label: "Jiddiy", aliases: ["jiddiy", "firm", "confident", "authoritative"], style: { instruction: "Serious, firm and confident, with a lower pitch and steady pace.", rate: -5, pitch: -6 } },
  { id: "sad", label: "G'amgin", aliases: ["xafa", "g'amgin", "gamgin", "melancholic", "sorrowful"], style: { instruction: "Sad, quiet and heavy-hearted, slow and low in energy.", rate: -16, pitch: -9, volume: -12 } },
  { id: "angry", label: "G'azabli", aliases: ["jahl", "g'azab", "g'azabli", "furious", "annoyed"], style: { instruction: "Angry, intense and sharp, clipped words, raised intensity.", rate: 6, pitch: 3, volume: 18 } },
  { id: "whisper", label: "Pichirlab", aliases: ["whispers", "whispering", "whispered", "pichirlab", "pichirlash", "pichirla"], style: { instruction: "Whispering softly and intimately, almost breathless.", rate: -10, volume: -35 } },
  { id: "curious", label: "Qiziquvchan", aliases: ["qiziquvchan", "qiziqish", "intrigued", "questioning", "wondering"], style: { instruction: "Curious and inquisitive, with rising, playful intonation.", rate: 2, pitch: 5 } },
  { id: "dramatic", label: "Dramatik", aliases: ["dramatik", "suspenseful", "mysterious", "sirli"], style: { instruction: "Dramatic and suspenseful, slow, with weight on key words.", rate: -14, pitch: -4, volume: 4 } },
  { id: "laugh", label: "Kulib", aliases: ["laughs", "laughing", "kulib", "kulgi", "laughs lightly", "chuckles"], style: { instruction: "Speaking with a light laugh in the voice, amused.", rate: 4, pitch: 6 } },
  { id: "slow", label: "Sekin", aliases: ["sekin", "slowly"], style: { instruction: "Speak slowly and deliberately, with clear pauses between phrases.", rate: -22 } },
  { id: "fast", label: "Tez", aliases: ["tez", "quickly", "rushed"], style: { instruction: "Speak quickly and briskly, with a fast, energetic pace.", rate: 22 } },
];

const NEUTRAL_TAGS = new Set(["neutral", "normal", "tabiiy", "oddiy", "reset"]);
const PAUSE_RE = /^(?:pause|pauza|to'xta|to‘xta|tanaffus|beat)(?:\s+(\d+(?:[.,]\d+)?)\s*(?:s|sec|soniya|sek)?)?$/;

const norm = (t: string) => t.toLowerCase().replace(/[ʻʼ’‘`]/g, "'").replace(/\s+/g, " ").trim();

const byAlias = new Map<string, EmotionDef>();
for (const e of EMOTIONS) for (const k of [e.id, ...e.aliases]) byAlias.set(norm(k), e);

export type SpeechPart = { kind: "speech"; text: string; style: EmotionStyle; tags: string[] } | { kind: "pause"; seconds: number };

const TAG_RE = /\[([^[\]]{1,60})\]/g;

/** True when the text contains at least one [tag]. */
export const hasEmotionTags = (text: string) => /\[[^[\]]{1,60}\]/.test(text);

/** The text without any [tag], tidied (what captions and the on-screen text should show). */
export const stripEmotionTags = (text: string) => text.replace(TAG_RE, " ").replace(/\s+([,.!?;:…])/g, "$1").replace(/\s+/g, " ").trim();

const merge = (a: EmotionStyle, b: EmotionStyle): EmotionStyle => ({
  instruction: [a.instruction, b.instruction].filter(Boolean).join(" ") || undefined,
  rate: b.rate ?? a.rate,
  pitch: b.pitch ?? a.pitch,
  volume: b.volume ?? a.volume,
});

/** Splits a tagged narration into speech parts (each with its merged style) and pauses. */
export const parseEmotionText = (text: string): SpeechPart[] => {
  const parts: SpeechPart[] = [];
  let style: EmotionStyle = {};
  let tags: string[] = [];
  let last = 0;
  // Tags written back to back stack; a tag after spoken text starts a fresh style.
  let spoken = false;
  const emit = (chunk: string) => {
    const t = chunk.replace(/\s+/g, " ").trim();
    if (!t) return;
    parts.push({ kind: "speech", text: t, style, tags: [...tags] });
    spoken = true;
  };
  for (const m of text.matchAll(TAG_RE)) {
    emit(text.slice(last, m.index));
    last = m.index! + m[0].length;
    const tag = norm(m[1]);
    const pause = PAUSE_RE.exec(tag);
    if (pause) {
      const s = pause[1] ? Number(pause[1].replace(",", ".")) : 0.6;
      parts.push({ kind: "pause", seconds: Math.min(5, Math.max(0.1, s)) });
    } else if (NEUTRAL_TAGS.has(tag)) {
      style = {};
      tags = [];
    } else {
      if (spoken) {
        style = {};
        tags = [];
        spoken = false;
      }
      const known = byAlias.get(tag);
      style = merge(style, known ? known.style : { instruction: `Delivery: ${tag.slice(0, 50)}.` });
      tags = [...tags, known?.id ?? tag];
    }
  }
  emit(text.slice(last));
  return parts;
};

/** The vocabulary the AI director may use (kept short so it stays consistent). */
export const DIRECTOR_TAGS = EMOTIONS.map((e) => e.id).join(", ");
