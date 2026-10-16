/**
 * Real audio analysis in the browser: speech / silence detection for jump cuts and
 * beat detection for cutting to music. Works on any decodable source (uploads, the
 * same-origin music proxy, SFX, the demo beat).
 */
import { clipsOnTrack, closeGaps } from "./ops";
import type { Clip, MediaAsset, MediaClip, Project } from "./types";
import { round, uid } from "./utils";

const decodeCache = new Map<string, Promise<AudioBuffer>>();

export const decodeAudio = (src: string) => {
  let p = decodeCache.get(src);
  if (!p) {
    p = fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`Audio yuklanmadi (${r.status})`);
        return r.arrayBuffer();
      })
      .then(async (buf) => {
        const ctx = new AudioContext();
        try {
          return await ctx.decodeAudioData(buf);
        } finally {
          void ctx.close();
        }
      });
    p.catch(() => decodeCache.delete(src));
    decodeCache.set(src, p);
  }
  return p;
};

/** Mono RMS envelope with `hop` seconds per value. */
const envelope = (buffer: AudioBuffer, from: number, to: number, hop: number) => {
  const sr = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const start = Math.max(0, Math.floor(from * sr));
  const end = Math.min(buffer.length, Math.floor(to * sr));
  const size = Math.max(1, Math.floor(hop * sr));
  const out: number[] = [];
  for (let i = start; i < end; i += size) {
    let sum = 0;
    let n = 0;
    for (let j = i; j < Math.min(end, i + size); j += 2) {
      let v = 0;
      for (const ch of channels) v += ch[j];
      v /= channels.length;
      sum += v * v;
      n++;
    }
    out.push(Math.sqrt(sum / Math.max(1, n)));
  }
  return out;
};

const toDb = (v: number) => 20 * Math.log10(Math.max(v, 1e-6));

export interface SilenceOptions {
  /** Pauses shorter than this stay in. */
  minSilence?: number;
  /** Breathing room kept around speech. */
  pad?: number;
  /** dB above the noise floor that counts as speech. */
  sensitivity?: number;
}

/** Returns the parts of [from, to) (source seconds) that contain sound worth keeping. */
export const detectSpeech = (buffer: AudioBuffer, from: number, to: number, opts: SilenceOptions = {}) => {
  const { minSilence = 0.45, pad = 0.1, sensitivity = 12 } = opts;
  const hop = 0.02;
  const env = envelope(buffer, from, to, hop).map(toDb);
  if (!env.length) return [{ start: from, end: to }];
  const sorted = [...env].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const peak = sorted[Math.floor(sorted.length * 0.98)];
  // Threshold sits between the noise floor and the loud parts.
  const threshold = Math.max(floor + sensitivity, peak - 35, -55);
  const loud = env.map((v) => v > threshold);
  const segments: { start: number; end: number }[] = [];
  let i = 0;
  while (i < loud.length) {
    if (!loud[i]) {
      i++;
      continue;
    }
    let j = i;
    let quiet = 0;
    while (j < loud.length) {
      if (loud[j]) quiet = 0;
      else if (++quiet * hop >= minSilence) break;
      j++;
    }
    const s = from + i * hop - pad;
    const e = from + (j - quiet) * hop + pad;
    segments.push({ start: Math.max(from, s), end: Math.min(to, e) });
    i = j;
  }
  // Merge overlaps created by padding and drop blips.
  const merged: { start: number; end: number }[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && seg.start <= last.end + 0.05) last.end = Math.max(last.end, seg.end);
    else merged.push({ ...seg });
  }
  return merged.filter((s) => s.end - s.start >= 0.25).map((s) => ({ start: round(s.start, 3), end: round(s.end, 3) }));
};

/** Replaces `clip` with its speech parts and closes the gaps on its track. */
export const applySpeechSegments = (project: Project, clip: MediaClip, segments: { start: number; end: number }[]): Project => {
  if (!segments.length) return project;
  const parts: MediaClip[] = segments.map((seg, i) => ({
    ...clip,
    id: i === 0 ? clip.id : uid("clip"),
    in: seg.start,
    duration: round((seg.end - seg.start) / clip.speed, 3),
    transitionIn: i === 0 ? clip.transitionIn : "none",
    animIn: i === 0 ? clip.animIn : undefined,
    animOut: i === segments.length - 1 ? clip.animOut : undefined,
    keyframes: undefined,
    fadeIn: 0,
    fadeOut: 0,
  }));
  const removed = clip.duration - parts.reduce((s, p) => s + p.duration, 0);
  let cursor = clip.start;
  for (const p of parts) {
    p.start = round(cursor, 3);
    cursor += p.duration;
  }
  const clipEnd = clip.start + clip.duration;
  const clips: Clip[] = project.clips.flatMap((c) => {
    if (c.id === clip.id) return parts;
    // Ripple everything after the clip on the same track.
    if (c.trackId === clip.trackId && c.start >= clipEnd - 0.001) return [{ ...c, start: round(c.start - removed, 3) }];
    return [c];
  });
  return { ...project, clips };
};

export const removeSilencesFromClip = async (project: Project, clip: MediaClip, asset: MediaAsset, opts?: SilenceOptions) => {
  if (!asset.src) throw new Error("Bu klipda audio yo'q");
  const buffer = await decodeAudio(asset.src);
  const span = clip.duration * clip.speed;
  const segments = detectSpeech(buffer, clip.in, Math.min(buffer.duration, clip.in + span), opts);
  const before = clip.duration;
  const next = applySpeechSegments(project, clip, segments);
  const after = segments.reduce((s, x) => s + (x.end - x.start) / clip.speed, 0);
  return { project: next, removed: round(before - after, 2), pieces: segments.length };
};

// ---------- Beats ----------

export interface BeatInfo {
  bpm: number;
  /** Beat times in source seconds. */
  beats: number[];
}

/** Onset-strength envelope + autocorrelation tempo estimate + phase-aligned beat grid. */
export const detectBeats = (buffer: AudioBuffer, from = 0, to = buffer.duration): BeatInfo => {
  const hop = 0.01;
  const env = envelope(buffer, from, to, hop);
  const log = env.map((v) => Math.log1p(v * 100));
  const flux = log.map((v, i) => Math.max(0, v - (log[i - 1] ?? v)));
  // Normalise with a moving average so quiet intros still produce onsets.
  const win = 50;
  const onset = flux.map((v, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - win); j < Math.min(flux.length, i + win); j++) {
      s += flux[j];
      n++;
    }
    return Math.max(0, v - (s / n) * 1.2);
  });
  // Tempo: best autocorrelation lag between 70 and 180 BPM.
  let bestLag = 50;
  let bestScore = -1;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = Math.round(60 / bpm / hop);
    let score = 0;
    for (let i = lag; i < onset.length; i++) score += onset[i] * onset[i - lag];
    // Slight preference for 90–130 BPM, where most music sits.
    score *= 1 - Math.abs(bpm - 110) / 400;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  const period = bestLag * hop;
  // Phase: offset whose comb sums the most onset energy.
  let bestPhase = 0;
  let phaseScore = -1;
  for (let ph = 0; ph < bestLag; ph++) {
    let s = 0;
    for (let i = ph; i < onset.length; i += bestLag) s += onset[i];
    if (s > phaseScore) {
      phaseScore = s;
      bestPhase = ph;
    }
  }
  const beats: number[] = [];
  for (let t = from + bestPhase * hop; t < to; t += period) beats.push(round(t, 3));
  return { bpm: Math.round((60 / period) * 10) / 10, beats };
};

/** Beat times on the timeline for a music clip. */
export const beatsOnTimeline = (clip: MediaClip, info: BeatInfo) =>
  info.beats
    .filter((b) => b >= clip.in && b <= clip.in + clip.duration * clip.speed)
    .map((b) => round(clip.start + (b - clip.in) / clip.speed, 3));

/**
 * Rebuilds the main track so every cut lands on a beat: shots of `every` beats are taken
 * round-robin from the existing V1 clips (their middle parts) until the music ends.
 */
export const cutToBeats = (project: Project, beats: number[], every = 2, maxLength?: number): Project => {
  const source = clipsOnTrack(project, "V1").filter((c): c is MediaClip => c.type === "media");
  if (!source.length || beats.length < every + 1) return project;
  const end = Math.min(beats[beats.length - 1], maxLength ?? Infinity);
  const cuts = beats.filter((_, i) => i % every === 0).filter((b) => b <= end);
  if (cuts[0] > 0.05) cuts.unshift(0);
  const used = source.map(() => 0);
  const shots: MediaClip[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const len = cuts[i + 1] - cuts[i];
    const k = i % source.length;
    const src = source[k];
    const span = src.duration;
    // Walk through each clip so repeated visits show new material.
    const offset = Math.min(Math.max(0, span - len), used[k]);
    used[k] = offset + len >= span - 0.05 ? 0 : offset + len;
    shots.push({
      ...src,
      id: uid("clip"),
      start: round(cuts[i], 3),
      in: round(src.in + offset * src.speed, 3),
      duration: round(Math.min(len, span), 3),
      transitionIn: "none",
      motion: i % 2 ? "punch-in" : src.motion === "none" ? "drift" : src.motion,
      keyframes: undefined,
      animIn: undefined,
      animOut: undefined,
    });
  }
  const p = { ...project, clips: [...project.clips.filter((c) => c.trackId !== "V1"), ...shots] };
  return closeGaps(p, "V1");
};

export const analyzeMusicBeats = async (asset: MediaAsset) => {
  if (!asset.src) throw new Error("Musiqa manbasi yo'q");
  const buffer = await decodeAudio(asset.src);
  return detectBeats(buffer);
};
