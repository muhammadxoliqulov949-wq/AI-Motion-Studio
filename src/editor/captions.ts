/**
 * Auto captions: extracts the audio under each speech clip, sends 16 kHz mono WAV chunks to
 * /api/transcribe and turns the timed segments into caption clips on the captions track.
 */
import { makeTextClip, migrateProject, templatePatch } from "./ops";
import type { Clip, MediaAsset, MediaClip, Project, TextClip } from "./types";
import { round } from "./utils";

const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 110;

const encodeWav = (samples: Float32Array) => {
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
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
};

const decodeCache = new Map<string, Promise<AudioBuffer>>();

const decode = (src: string) => {
  let p = decodeCache.get(src);
  if (!p) {
    p = fetch(src)
      .then((r) => r.arrayBuffer())
      .then(async (buf) => {
        const ctx = new AudioContext();
        try {
          return await ctx.decodeAudioData(buf);
        } finally {
          void ctx.close();
        }
      });
    decodeCache.set(src, p);
  }
  return p;
};

/** Resamples [from, to) seconds of a decoded buffer to 16 kHz mono. */
const extract = async (buffer: AudioBuffer, from: number, to: number) => {
  const length = Math.max(1, Math.ceil((to - from) * SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start(0, from, to - from);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
};

export interface CaptionSegment {
  text: string;
  start: number;
  end: number;
}

export class CaptionError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Clips whose audio can be transcribed (uploaded video or audio with a real source). */
export const speechSourceClips = (project: Project, assets: MediaAsset[]) =>
  project.clips.filter((c): c is MediaClip => {
    if (c.type !== "media") return false;
    const a = assets.find((x) => x.id === c.assetId);
    const track = project.tracks.find((t) => t.id === c.trackId);
    return !!a?.src && a.origin !== "music" && a.origin !== "sfx" && a.id !== "asset_music" && (a.kind === "video" || a.kind === "audio") && !track?.muted && c.volume > 0;
  });

export const transcribeClips = async (
  project: Project,
  assets: MediaAsset[],
  onProgress: (done: number, total: number) => void,
  language?: string,
): Promise<CaptionSegment[]> => {
  const clips = speechSourceClips(project, assets);
  const jobs: { clip: MediaClip; from: number; to: number }[] = [];
  for (const clip of clips) {
    const span = clip.duration * clip.speed;
    for (let off = 0; off < span - 0.2; off += CHUNK_SECONDS) jobs.push({ clip, from: clip.in + off, to: clip.in + Math.min(span, off + CHUNK_SECONDS) });
  }
  const out: CaptionSegment[] = [];
  let done = 0;
  onProgress(0, jobs.length);
  for (const job of jobs) {
    const asset = assets.find((a) => a.id === job.clip.assetId)!;
    const buffer = await decode(asset.src!);
    const samples = await extract(buffer, job.from, Math.min(job.to, buffer.duration));
    const form = new FormData();
    form.append("audio", encodeWav(samples), "chunk.wav");
    if (language) form.append("language", language);
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new CaptionError(data.error ?? `HTTP ${res.status}`, data.code);
    for (const seg of data.segments as CaptionSegment[]) {
      if (job.clip.reverse) continue;
      // Source time → timeline time.
      const s = job.clip.start + (job.from - job.clip.in + seg.start) / job.clip.speed;
      const e = job.clip.start + (job.from - job.clip.in + seg.end) / job.clip.speed;
      const clipEnd = job.clip.start + job.clip.duration;
      if (s >= clipEnd) continue;
      out.push({ text: seg.text, start: round(s, 3), end: round(Math.min(e, clipEnd), 3) });
    }
    onProgress(++done, jobs.length);
  }
  return out.sort((a, b) => a.start - b.start);
};

/** Splits long segments into short caption cards (≤ maxWords) with proportional timing. */
export const captionClipsFromSegments = (segments: CaptionSegment[], template = "caption", trackId = "T2", maxWords = 5): TextClip[] => {
  const clips: TextClip[] = [];
  for (const seg of segments) {
    const words = seg.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const parts = Math.ceil(words.length / maxWords);
    const len = (seg.end - seg.start) / parts;
    for (let i = 0; i < parts; i++) {
      const text = words.slice(i * maxWords, (i + 1) * maxWords).join(" ");
      clips.push(
        makeTextClip(round(seg.start + i * len, 3), {
          ...templatePatch(template),
          trackId,
          text,
          duration: round(Math.max(0.3, len - 0.02), 3),
        }),
      );
    }
  }
  return clips;
};

/** Replaces the captions track with the new caption clips. */
export const applyCaptions = (project: Project, captions: Clip[], trackId = "T2"): Project => {
  const p = migrateProject(project);
  return { ...p, clips: [...p.clips.filter((c) => c.trackId !== trackId), ...captions] };
};
