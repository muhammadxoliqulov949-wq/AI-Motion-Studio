"use client";

/**
 * Voices narration that contains emotion tags ("[excited] … [pause] [whispers] …").
 * Each spoken part is synthesised with its own style (rate / pitch / volume offsets),
 * decoded, and joined with the requested pauses into one WAV. Plain text (no tags) is a single call
 * and stays an MP3. `cues` tell where each part starts and ends, so captions can follow the voice.
 */
import { speak, type SpeakOptions } from "./catalog/voices";
import { BASE_STYLES, hasEmotionTags, parseEmotionText, stripEmotionTags, type EmotionStyle, type SpeechPart } from "./catalog/emotions";

export interface SpeechCue {
  /** Text without tags. */
  text: string;
  start: number;
  end: number;
}

export interface SpokenAudio {
  blob: Blob;
  seconds: number;
  cues: SpeechCue[];
}

/** Short silence between two spoken parts that have no explicit [pause] between them. */
const GAP_SECONDS = 0.1;

const encodeWav = (samples: Float32Array, sampleRate: number) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
};

const newContext = () => {
  try {
    // 24 kHz keeps the WAV small (TTS output is 24 kHz anyway).
    return new AudioContext({ sampleRate: 24000 });
  } catch {
    return new AudioContext();
  }
};

type Speech = Extract<SpeechPart, { kind: "speech" }>;

export interface SpeakEmotionOptions extends Omit<SpeakOptions, "text" | "prosody"> {
  text: string;
  /** Base delivery preset of the whole voiceover (key of BASE_STYLES). */
  style?: string;
}

const addStyles = (a: EmotionStyle, b: EmotionStyle) => ({ rate: (a.rate ?? 0) + (b.rate ?? 0), pitch: (a.pitch ?? 0) + (b.pitch ?? 0), volume: (a.volume ?? 0) + (b.volume ?? 0) });

/**
 * Narration with optional emotion tags → one audio file plus caption cues.
 * Throws the same errors as `speak` (missing key, rate limit …).
 */
export const speakEmotional = async ({ text, voice, speed = 1, style = "", signal }: SpeakEmotionOptions): Promise<SpokenAudio> => {
  const clean = stripEmotionTags(text);
  const base = BASE_STYLES[style] ?? {};

  // No tags: one call, MP3, a single cue over the whole voice.
  if (!hasEmotionTags(text)) {
    const blob = await speak({ text: clean, voice, speed, prosody: addStyles(base, {}), signal });
    const seconds = await duration(blob);
    return { blob, seconds, cues: [{ text: clean, start: 0, end: seconds }] };
  }

  const parts = parseEmotionText(text);
  const speech = parts.filter((p): p is Speech => p.kind === "speech");
  if (!speech.length) throw new Error("Teglardan boshqa matn yo'q");

  // Synthesise the spoken parts (3 at a time).
  const blobs = new Array<Blob>(speech.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, speech.length) }, async () => {
      while (next < speech.length) {
        const i = next++;
        const part = speech[i];
        blobs[i] = await speak({
          text: part.text,
          voice,
          speed,
          prosody: addStyles(base, part.style),
          signal,
        });
      }
    }),
  );

  // Decode and join.
  const ctx = newContext();
  try {
    const rate = ctx.sampleRate;
    const decoded = await Promise.all(blobs.map(async (b) => (await ctx.decodeAudioData(await b.arrayBuffer())).getChannelData(0)));
    const chunks: Float32Array[] = [];
    const cues: SpeechCue[] = [];
    let cursor = 0; // samples written so far
    let spoken = 0;
    let silenceBefore = 0;
    const silence = (seconds: number) => {
      const n = Math.round(seconds * rate);
      if (n > 0) {
        chunks.push(new Float32Array(n));
        cursor += n;
      }
    };
    for (const part of parts) {
      if (part.kind === "pause") {
        silenceBefore += part.seconds;
        continue;
      }
      // An explicit [pause] replaces the default gap; between two spoken parts there is a short one.
      if (spoken > 0) silence(silenceBefore || GAP_SECONDS);
      else silence(silenceBefore);
      silenceBefore = 0;
      const samples = decoded[spoken];
      const start = cursor / rate;
      chunks.push(samples);
      cursor += samples.length;
      cues.push({ text: stripEmotionTags(part.text), start, end: cursor / rate });
      spoken++;
    }
    // A trailing [pause] is kept as silence at the end.
    silence(silenceBefore);

    const out = new Float32Array(cursor);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return { blob: encodeWav(out, rate), seconds: cursor / rate, cues };
  } finally {
    void ctx.close();
  }
};

const duration = async (blob: Blob) => {
  const ctx = newContext();
  try {
    return (await ctx.decodeAudioData(await blob.arrayBuffer())).duration;
  } finally {
    void ctx.close();
  }
};
