"use client";

/**
 * "Mavzudan video": topic → script cards (editable) → a real editor timeline with stock footage,
 * a voiceover per scene, captions synced to the voice, music, whooshes and the brand kit.
 * The result is a normal project, so everything stays editable in the editor.
 */
import type { MontagePlan } from "@/montage/types";
import { applyBrandKit, type BrandKit, logoAsset } from "./brand-kit";
import { speak, TtsError } from "./catalog/voices";
import { applyOps, type EditOp } from "./edit-ops";
import { saveMedia } from "./media-store";
import { addTrack, insertClip, makeMediaClip, makeTextClip, templatePatch } from "./ops";
import { computePeaks } from "./sample-media";
import { searchStock, stockToAsset, type StockItem } from "./stock";
import { emptyProject } from "./templates";
import type { MediaAsset, Project, TransitionId } from "./types";
import { round, uid } from "./utils";

export type ScriptAspect = "9:16" | "16:9";

/** One stock clip chosen for a scene (from the AI plan or from the stock search). */
export interface ScriptFootage {
  id: string;
  src: string;
  width: number;
  height: number;
  duration: number;
  author: string;
  pageUrl: string;
  provider: "pixabay" | "pexels";
}

export interface ScriptScene {
  id: string;
  /** On-screen headline (kept short). */
  text: string;
  /** What the voiceover says; also the source of the captions. */
  narration: string;
  /** English stock-search words. */
  query: string;
  seconds: number;
  footage: ScriptFootage | null;
  /** Stock-search page already used by "Boshqa kadr". */
  page?: number;
}

export interface ScriptDraft {
  title: string;
  scenes: ScriptScene[];
  source: "ai" | "template";
}

export class ScriptError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const providerOf = (pageUrl: string): ScriptFootage["provider"] => (/pexels\.com/.test(pageUrl) ? "pexels" : "pixabay");

// ---------- Script ----------

/** Asks the AI director for scenes (script, on-screen text, stock query, footage). */
export const requestScript = async (topic: string, aspect: ScriptAspect, targetSeconds: number): Promise<ScriptDraft> => {
  let res: Response;
  try {
    res = await fetch("/api/generate-montage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, aspect, targetSeconds }),
    });
  } catch {
    throw new ScriptError("Serverga ulanib bo'lmadi.", "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ScriptError(data.error ?? `HTTP ${res.status}`, data.code ?? "model_error");
  const plan = data as MontagePlan;
  return {
    title: plan.title,
    source: "ai",
    scenes: plan.scenes.map((s) => ({
      id: uid("scn"),
      text: s.text,
      narration: s.narration,
      query: s.visual_search_query,
      seconds: round(s.durationInFrames / plan.fps, 1),
      footage: s.footage
        ? {
            id: hash(s.footage.url),
            src: s.footage.url,
            width: s.footage.width,
            height: s.footage.height,
            duration: s.footage.duration,
            author: s.footage.author,
            pageUrl: s.footage.pexelsUrl,
            provider: providerOf(s.footage.pexelsUrl),
          }
        : null,
    })),
  };
};

/** Starting point when the AI is unavailable: five editable scenes built around the topic. */
export const templateScript = (topic: string, targetSeconds: number): ScriptDraft => {
  const each = Math.max(3, round(targetSeconds / 5, 1));
  const t = topic.trim().replace(/[.!?]+$/, "");
  const scenes: [string, string, string][] = [
    [t, `${t}. Keling, bu haqda qisqacha gaplashamiz.`, "city skyline"],
    ["Nega bu muhim?", "Ko'pchilik buni e'tiborsiz qoldiradi, lekin aynan shu narsa katta farq yaratadi.", "people thinking"],
    ["Asosiy g'oya", "Eng muhimi — oddiy va aniq bo'lish. Keraksiz narsalarni olib tashlang.", "working desk"],
    ["Natija", "Shunda natija tezroq va yaxshiroq bo'ladi.", "success celebration"],
    ["Siz nima deysiz?", "Fikringizni yozing va do'stlaringizga ulashing!", "friends smiling"],
  ];
  return {
    title: t.slice(0, 60),
    source: "template",
    scenes: scenes.map(([text, narration, query]) => ({ id: uid("scn"), text, narration, query, seconds: each, footage: null })),
  };
};

export const newScene = (): ScriptScene => ({ id: uid("scn"), text: "", narration: "", query: "nature", seconds: 5, footage: null });

// ---------- Stock footage ----------

const toFootage = (item: StockItem): ScriptFootage => ({
  id: item.id,
  src: item.src,
  width: item.width,
  height: item.height,
  duration: item.duration,
  author: item.author,
  pageUrl: item.pageUrl,
  provider: item.provider ?? "pixabay",
});

/** Finds a clip for the query that is not in `exclude` (ids already used by other scenes). */
export const findSceneFootage = async (query: string, aspect: ScriptAspect, exclude: Set<string>, page = 1): Promise<{ footage: ScriptFootage | null; page: number }> => {
  const q = query.trim() || "nature";
  for (const p of page === 1 ? [1] : [page, 1]) {
    const r = await searchStock("videos", q, aspect, p);
    const items = r.items.filter((i) => i.duration >= 2);
    const pick = items.find((i) => !exclude.has(i.id)) ?? null;
    if (pick) return { footage: toFootage(pick), page: p };
  }
  return { footage: null, page };
};

export const footageAsset = (f: ScriptFootage): MediaAsset =>
  stockToAsset({
    id: `stock_${f.provider}_${f.id}`,
    kind: "video",
    provider: f.provider,
    width: f.width,
    height: f.height,
    duration: f.duration,
    thumb: "",
    src: f.src,
    author: f.author,
    authorUrl: f.pageUrl,
    pageUrl: f.pageUrl,
  });

// ---------- Captions ----------

/** Splits narration into short caption phrases (≤ maxWords), preferring sentence / comma breaks. */
export const splitPhrases = (text: string, maxWords = 4): string[] => {
  const out: string[] = [];
  for (const part of text.split(/(?<=[.!?…,;:])\s+/)) {
    const words = part.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    // Balanced chunks: 7 words with max 4 → 4 + 3, not 4 + 3 + ... uneven.
    const chunks = Math.ceil(words.length / maxWords);
    const size = Math.ceil(words.length / chunks);
    for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(" "));
  }
  return out;
};

// ---------- Build ----------

export type MusicMood = "none" | "calm" | "upbeat" | "cinematic";

const MUSIC_TAGS: Record<Exclude<MusicMood, "none">, string[]> = {
  calm: ["calm", "relaxed", "chill"],
  upbeat: ["uplifting", "bright", "electronic"],
  cinematic: ["cinematic", "epic"],
};

export interface BuildInput {
  title: string;
  scenes: ScriptScene[];
  aspect: ScriptAspect;
  /** Voice id ("azure:…" / "openai:…") or "none" for captions only. */
  voice: string;
  voiceSpeed: number;
  captionStyle: string;
  music: MusicMood;
  sfx: boolean;
  transition: TransitionId;
  kit: BrandKit | null;
  /** Demo scenes: stand-ins for scenes without footage. */
  demoAssets: MediaAsset[];
  onProgress: (label: string, fraction: number) => void;
}

export interface BuildResult {
  project: Project;
  assets: MediaAsset[];
  warnings: string[];
}

const decode = async (blob: Blob) => {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
};

interface Voiced {
  asset: MediaAsset;
  seconds: number;
}

/** Runs `fn` over `items` with at most `limit` in flight; keeps result order. */
const pool = async <T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> => {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
};

export const buildScriptVideo = async (input: BuildInput): Promise<BuildResult> => {
  const { scenes, aspect, onProgress } = input;
  const warnings: string[] = [];
  const total = scenes.length;
  let progressed = 0;
  const tick = (label: string) => onProgress(label, Math.min(0.95, ++progressed / (total * 2 + 2)));

  // 1. Voiceovers (best effort: a failed voice leaves that scene with captions only).
  const voiced: (Voiced | null)[] = new Array(total).fill(null);
  if (input.voice !== "none") {
    let voiceDown = false;
    await pool(scenes, 3, async (scene, i) => {
      if (!scene.narration.trim() || voiceDown) return tick("Ovozlar yaratilmoqda…");
      try {
        const blob = await speak({ text: scene.narration, voice: input.voice, speed: input.voiceSpeed });
        const buf = await decode(blob);
        const asset: MediaAsset = {
          id: uid("voice"),
          name: `Ovoz ${i + 1}: ${scene.text.slice(0, 22)}`,
          kind: "audio",
          duration: buf.duration,
          src: URL.createObjectURL(blob),
          gradient: "linear-gradient(135deg,#7c2d12,#fb923c)",
          peaks: computePeaks(buf.getChannelData(0), 300),
          origin: "voice",
        };
        void saveMedia(asset, blob);
        voiced[i] = { asset, seconds: buf.duration };
      } catch (err) {
        if (err instanceof TtsError && (err.code === "no_api_key" || err.code === "rate_limited")) voiceDown = true;
        if (!warnings.some((w) => w.startsWith("Ovoz"))) warnings.push(`Ovoz yaratilmadi (${(err as Error).message}) — shu kadrlar faqat subtitr bilan.`);
      }
      tick("Ovozlar yaratilmoqda…");
    });
  } else {
    scenes.forEach(() => tick("Ovozlar yaratilmoqda…"));
  }

  // 2. Footage for scenes the AI could not match (one more attempt), then stand-ins.
  const used = new Set(scenes.flatMap((s) => (s.footage ? [s.footage.id] : [])));
  const footage: (ScriptFootage | null)[] = [];
  for (const [i, scene] of scenes.entries()) {
    let f = scene.footage;
    if (!f) {
      try {
        f = (await findSceneFootage(scene.query, aspect, used)).footage;
      } catch {
        f = null;
      }
      if (f) used.add(f.id);
    }
    footage.push(f);
    tick(`Kadrlar tayyorlanmoqda (${i + 1}/${total})…`);
  }

  // 3. Timeline
  onProgress("Timeline yig'ilmoqda…", 0.96);
  const base = emptyProject();
  let project: Project = { ...base, name: input.title.trim().slice(0, 60) || "Mavzudan video", aspect, background: { type: "blur", color: "#000000", blur: 40 } };
  const newAssets: MediaAsset[] = [];
  const addAsset = (a: MediaAsset) => {
    if (!newAssets.some((x) => x.id === a.id)) newAssets.push(a);
    return a;
  };
  const demo = input.demoAssets.filter((a) => a.scene && a.kind === "video");
  const voiceTrack = voiced.some(Boolean) ? addTrack(project, "audio", "Ovoz") : null;
  if (voiceTrack) project = voiceTrack.project;

  let at = 0;
  const starts: number[] = [];
  let standIns = 0;
  scenes.forEach((scene, i) => {
    const v = voiced[i];
    const sceneLen = round(Math.max(2, scene.seconds, v ? v.seconds + 0.55 : 0), 3);
    starts.push(round(at, 3));

    // Footage fills the scene (shorter clips repeat back to back).
    const f = footage[i];
    let asset: MediaAsset;
    if (f) asset = addAsset(footageAsset(f));
    else {
      asset = demo[standIns++ % Math.max(1, demo.length)] ?? input.demoAssets[0];
    }
    const maxSeg = f ? Math.max(1, f.duration) : sceneLen;
    let cursor = 0;
    let first = true;
    while (cursor < sceneLen - 0.05 && asset) {
      const len = round(Math.min(maxSeg, sceneLen - cursor), 3);
      project = {
        ...project,
        clips: [
          ...project.clips,
          makeMediaClip(asset, "V1", round(at + cursor, 3), {
            duration: len,
            in: f ? 0 : round(Math.max(0, asset.duration / 2 - len / 2), 3),
            volume: 0,
            transitionIn: first && i > 0 ? input.transition : "none",
            transitionDuration: 0.35,
            motion: f ? "none" : "ken-burns",
          }),
        ],
      };
      cursor += len;
      first = false;
    }

    // Voice + captions follow the actual spoken length.
    const voiceStart = round(at + 0.15, 3);
    const speakLen = v ? v.seconds : Math.max(1.5, sceneLen - 0.4);
    if (v && voiceTrack) {
      project = insertClip(project, makeMediaClip(addAsset(v.asset), voiceTrack.track.id, voiceStart, { volume: 1, fadeIn: 0, fadeOut: 0.05 }), ["audio"], voiceTrack.track.id);
    }
    const phrases = splitPhrases(scene.narration || scene.text);
    const weight = phrases.map((p) => Math.max(8, p.length));
    const sum = weight.reduce((s, w) => s + w, 0);
    let t = voiceStart;
    phrases.forEach((text, k) => {
      const len = (weight[k] / sum) * speakLen;
      project = {
        ...project,
        clips: [
          ...project.clips,
          makeTextClip(round(t, 3), { ...templatePatch(input.captionStyle), trackId: "T2", text, duration: round(Math.max(0.4, len - 0.02), 3) }),
        ],
      };
      t += len;
    });
    at += sceneLen;
  });

  // Title over the first scene.
  const titleText = input.title.trim();
  if (titleText) {
    project = {
      ...project,
      clips: [...project.clips, makeTextClip(0.1, { ...templatePatch(aspect === "9:16" ? "bold-impact" : "title"), trackId: "T1", text: titleText.slice(0, 60), duration: round(Math.min(2.8, (starts[1] ?? at) - 0.2), 3), position: "top" })],
    };
  }
  if (standIns) warnings.push(`${standIns} ta kadr uchun video topilmadi — demo kadr qo'yildi, uni «Mediani almashtirish» bilan o'zgartiring.`);

  // 4. Music + whooshes through the editor's own ops (also fills the credits list).
  onProgress("Musiqa va tovushlar…", 0.98);
  const ops: EditOp[] = [];
  if (input.music !== "none") ops.push({ op: "add_library_music", tags: MUSIC_TAGS[input.music], trackId: null, volume: voiced.some(Boolean) ? 0.12 : 0.5 });
  if (input.sfx && starts.length > 1) ops.push({ op: "add_sfx", tags: ["whoosh"], at: starts.slice(1).map((s) => Math.max(0, s - 0.15)), atCuts: false, volume: 0.4 });
  let assets = [...input.demoAssets, ...newAssets];
  if (ops.length) {
    const r = applyOps(project, assets, ops);
    project = r.project;
    newAssets.push(...r.newAssets);
    assets = [...assets, ...r.newAssets];
    r.steps.filter((s) => s.warning).forEach((s) => warnings.push(s.detail));
  }

  // 5. Brand kit
  if (input.kit) {
    const r = applyBrandKit(project, assets, input.kit);
    project = r.project;
    newAssets.push(...r.newAssets);
    const logo = logoAsset(input.kit);
    if (logo?.src && r.newAssets.length) void fetch(logo.src).then((res) => res.blob()).then((b) => saveMedia(logo, b));
  }

  onProgress("Tayyor", 1);
  return { project, assets: newAssets, warnings };
};
