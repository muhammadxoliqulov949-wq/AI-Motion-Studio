/**
 * The edit operation language shared by the LLM and the local fallback planner.
 * The model reads the project JSON and answers with a list of these ops; `applyOps`
 * runs them against the timeline using the same helpers as the manual UI.
 */
import { z } from "zod";
import { CLIP_ANIMATIONS, TEXT_ANIMATIONS } from "./catalog/animations";
import { MUSIC, musicToAsset, pickMusic, pickSfx, sfxToAsset } from "./catalog/audio-library";
import { EFFECT_IDS, EFFECTS } from "./catalog/effects";
import { FILTERS, FILTER_PRESETS } from "./catalog/filters";
import { FONTS } from "./catalog/fonts";
import { EMOJI_STICKERS, SHAPE_STICKERS } from "./catalog/stickers";
import { TEXT_TEMPLATES } from "./catalog/text-templates";
import { TRANSITION_IDS } from "./catalog/transitions";
import { applySpeechSegments, cutToBeats } from "./audio-analysis";
import { setKeyframe } from "./keyframes";
import { clipsOnTrack, closeGaps, insertClip, makeEffectClip, makeMediaClip, makeStickerClip, makeTextClip, migrateProject, splitClip, templatePatch } from "./ops";
import type { Clip, Easing, KeyframeProp, MediaAsset, MediaClip, Project, TextClip } from "./types";
import { clamp, clipEnd, projectDuration, round, uid } from "./utils";

// ---------- Schema ----------

const ids = (list: string[]) => list as [string, ...string[]];
const ASPECT = z.enum(["16:9", "9:16", "1:1", "4:5", "4:3", "21:9"]);
const FILTER = z.enum(ids(Object.keys(FILTER_PRESETS)));
const TRANSITION = z.enum(ids(TRANSITION_IDS));
const MOTION = z.enum(["none", "ken-burns", "punch-in", "shake", "drift"]);
const TEXT_STYLE = z.enum(ids(Object.keys(TEXT_TEMPLATES)));
const POSITION = z.enum(["top", "center", "bottom"]);
const CLIP_ANIM_IN = z.enum(ids(Object.keys(CLIP_ANIMATIONS).filter((k) => k.startsWith("in:"))));
const CLIP_ANIM_OUT = z.enum(ids(Object.keys(CLIP_ANIMATIONS).filter((k) => k.startsWith("out:"))));
const CLIP_ANIM_COMBO = z.enum(ids(Object.keys(CLIP_ANIMATIONS).filter((k) => k.startsWith("combo:"))));
const TEXT_ANIM_IN = z.enum(ids(Object.keys(TEXT_ANIMATIONS).filter((k) => TEXT_ANIMATIONS[k].kind === "in")));
const TEXT_ANIM_OUT = z.enum(ids(Object.keys(TEXT_ANIMATIONS).filter((k) => TEXT_ANIMATIONS[k].kind === "out")));
const TEXT_ANIM_LOOP = z.enum(ids(Object.keys(TEXT_ANIMATIONS).filter((k) => TEXT_ANIMATIONS[k].kind === "loop")));
const EFFECT = z.enum(ids(EFFECT_IDS));
const SPEED_CURVE = z.enum(["none", "montage", "hero", "bullet", "jump-cut", "flash-in", "flash-out"]);
const FONT_CATEGORY = z.enum(["sans", "display", "serif", "handwriting", "mono"]);
const KF_PROP = z.enum(["x", "y", "scale", "rotation", "opacity", "volume"]);
const EASING = z.enum(["linear", "ease", "ease-in", "ease-out", "hold", "bounce"]);

// Every field is required (nullable instead of optional) and the union is a plain z.union
// (anyOf, not oneOf) so OpenAI strict structured outputs accept the schema.
export const EditOpSchema = z.union([
  z.object({ op: z.literal("set_aspect"), aspect: ASPECT }),
  z.object({
    op: z.literal("remove_silences"),
    clipIds: z.array(z.string()).nullable().describe("Speech clips to tighten; null = all detected speech clips"),
  }),
  z.object({
    op: z.literal("beat_sync"),
    every: z.number().describe("Cut every N music beats: 1 = very fast, 2 = energetic (default), 4 = calm"),
    maxSeconds: z.number().nullable().describe("Stop the montage after this many seconds; null = until the music ends"),
  }),
  z.object({
    op: z.literal("beat_cut"),
    targetSeconds: z.number().describe("Approximate length of the resulting fast-paced montage on track V1"),
  }),
  z.object({ op: z.literal("fit_duration"), seconds: z.number().describe("Shorten V1 to this length, keeping each clip's middle") }),
  z.object({
    op: z.literal("reorder"),
    clipIds: z.array(z.string()).nullable().describe("New V1 order by clip id; null with reverse=true reverses"),
    reverse: z.boolean(),
  }),
  z.object({ op: z.literal("add_transitions"), type: TRANSITION, duration: z.number().describe("Seconds, 0.2–1.5") }),
  z.object({
    op: z.literal("set_grade"),
    filter: FILTER,
    letterbox: z.boolean().nullable(),
    vignette: z.boolean().nullable(),
    grain: z.boolean().nullable(),
  }),
  z.object({ op: z.literal("set_motion"), motion: MOTION, clipIds: z.array(z.string()).nullable().describe("null = all V1 clips") }),
  z.object({ op: z.literal("set_speed"), clipId: z.string(), speed: z.number().describe("0.25–4; <1 is slow motion") }),
  z.object({
    op: z.literal("add_captions"),
    lines: z.array(z.string()).describe("Caption lines in the user's language, ~2.4s each, spread over speech clips"),
  }),
  z.object({
    op: z.literal("add_text"),
    text: z.string(),
    style: TEXT_STYLE,
    start: z.number(),
    duration: z.number(),
    position: POSITION,
  }),
  z.object({
    op: z.literal("add_music"),
    assetId: z.string().nullable().describe("Audio asset id; null = first audio asset"),
    volume: z.number().nullable().describe("0–1, default 0.6"),
  }),
  z.object({
    op: z.literal("update_clip"),
    clipId: z.string(),
    filter: FILTER.nullable(),
    motion: MOTION.nullable(),
    transitionIn: TRANSITION.nullable(),
    transitionDuration: z.number().nullable(),
    volume: z.number().nullable(),
    opacity: z.number().nullable(),
    scale: z.number().nullable(),
    text: z.string().nullable(),
    textStyle: TEXT_STYLE.nullable(),
    position: POSITION.nullable(),
    color: z.string().nullable(),
    speedCurve: SPEED_CURVE.nullable(),
    reverse: z.boolean().nullable(),
    fadeIn: z.number().nullable().describe("Audio fade-in seconds"),
    fadeOut: z.number().nullable().describe("Audio fade-out seconds"),
    fit: z.enum(["cover", "contain", "fill"]).nullable(),
    brightness: z.number().nullable().describe("-1..1"),
    contrast: z.number().nullable().describe("-1..1"),
    saturation: z.number().nullable().describe("-1..1"),
    temperature: z.number().nullable().describe("-1 cool .. 1 warm"),
    filterIntensity: z.number().nullable().describe("0..1"),
    x: z.number().nullable().describe("Horizontal offset in % of the frame, -100..100"),
    y: z.number().nullable().describe("Vertical offset in % of the frame, -100..100"),
    rotation: z.number().nullable().describe("Degrees"),
  }),
  z.object({ op: z.literal("split_clip"), clipId: z.string(), at: z.number().describe("Timeline time in seconds") }),
  z.object({ op: z.literal("delete_clip"), clipId: z.string(), ripple: z.boolean() }),
  z.object({ op: z.literal("move_clip"), clipId: z.string(), start: z.number() }),
  z.object({
    op: z.literal("trim_clip"),
    clipId: z.string(),
    start: z.number().nullable().describe("New timeline start (trims the head)"),
    end: z.number().nullable().describe("New timeline end (trims the tail)"),
  }),
  z.object({
    op: z.literal("add_clip"),
    assetId: z.string(),
    trackId: z.string().nullable(),
    start: z.number().nullable().describe("null = append at end of track"),
    sourceIn: z.number().nullable(),
    duration: z.number().nullable(),
  }),
  z.object({ op: z.literal("close_gaps"), trackId: z.string() }),
  z.object({ op: z.literal("rename_project"), name: z.string() }),
  z.object({
    op: z.literal("add_library_music"),
    tags: z.array(z.string()).describe("Genre / mood words from the music library vocabulary, e.g. [\"electronic\",\"uplifting\"]"),
    trackId: z.string().nullable().describe("Audio track, null = A1 (replaces existing music there)"),
    volume: z.number().nullable().describe("0–1, default 0.6"),
  }),
  z.object({
    op: z.literal("add_sfx"),
    tags: z.array(z.string()).describe("Sound words, e.g. [\"whoosh\"], [\"pop\"], [\"applause\"], [\"impact\",\"cinematic\"]"),
    at: z.array(z.number()).nullable().describe("Timeline times in seconds; null with atCuts=true puts one on every V1 cut"),
    atCuts: z.boolean(),
    volume: z.number().nullable(),
  }),
  z.object({
    op: z.literal("add_sticker"),
    sticker: z.string().describe("Animated emoji name (e.g. fire, red-heart, party-popper, thumbs-up, joy) or shape:<id> (arrow-right, subscribe, like, star, burst, speech, check, cross, location, bell, sparkle)"),
    start: z.number(),
    duration: z.number(),
    x: z.number().nullable().describe("% offset from centre, -45..45"),
    y: z.number().nullable(),
    scale: z.number().nullable(),
  }),
  z.object({
    op: z.literal("add_effect"),
    effect: EFFECT,
    start: z.number(),
    duration: z.number(),
    intensity: z.number().nullable().describe("0–1, default 0.7"),
  }),
  z.object({
    op: z.literal("style_text"),
    clipIds: z.array(z.string()).nullable().describe("Text clips to restyle; null = every text clip"),
    template: TEXT_STYLE.nullable(),
    font: z.string().nullable().describe("Exact Google font family from the font list"),
    fontCategory: FONT_CATEGORY.nullable().describe("Used when font is null: picks a fitting font of this category"),
    fontSize: z.number().nullable().describe("px at 1080p, 40–220"),
    color: z.string().nullable(),
    strokeColor: z.string().nullable(),
    strokeWidth: z.number().nullable(),
    bgColor: z.string().nullable(),
    highlightColor: z.string().nullable(),
    textIn: TEXT_ANIM_IN.nullable(),
    textOut: TEXT_ANIM_OUT.nullable(),
    textLoop: TEXT_ANIM_LOOP.nullable(),
  }),
  z.object({
    op: z.literal("set_animation"),
    clipIds: z.array(z.string()).nullable().describe("null = every V1 clip"),
    animIn: CLIP_ANIM_IN.nullable(),
    animOut: CLIP_ANIM_OUT.nullable(),
    animCombo: CLIP_ANIM_COMBO.nullable(),
    duration: z.number().nullable().describe("In/out animation length in seconds, default 0.5"),
  }),
  z.object({
    op: z.literal("set_keyframes"),
    clipId: z.string(),
    prop: KF_PROP,
    keyframes: z.array(z.object({ t: z.number().describe("Seconds from the clip start"), value: z.number(), easing: EASING })),
  }),
  z.object({
    op: z.literal("set_background"),
    type: z.enum(["color", "blur", "gradient"]),
    color: z.string().nullable(),
    blur: z.number().nullable(),
  }),
]);

export type EditOp = z.infer<typeof EditOpSchema>;

export const AgentResponseSchema = z.object({
  reply: z.string().describe("Short friendly answer in the user's language explaining what you changed and why"),
  ops: z.array(EditOpSchema),
  suggestions: z.array(z.string()).describe("2–4 short follow-up requests the user might send next, in their language"),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// ---------- Executor ----------

export interface AgentStep {
  label: string;
  detail: string;
  warning?: boolean;
}

/** Results of real audio analysis done before the ops run (see agent-runner.ts). */
export interface OpAnalysis {
  /** Speech parts (source seconds) per clip id. */
  speech?: Map<string, { start: number; end: number }[]>;
  /** Music beat times on the timeline. */
  beats?: number[];
  bpm?: number;
}

interface Ctx {
  analysis?: OpAnalysis;
  project: Project;
  assets: MediaAsset[];
  /** Library assets (music / SFX) the ops pulled in; the caller adds them to the project. */
  newAssets: MediaAsset[];
  steps: AgentStep[];
  code: string[];
}

const useAsset = (ctx: Ctx, asset: MediaAsset) => {
  if (!ctx.assets.some((a) => a.id === asset.id)) {
    ctx.assets = [...ctx.assets, asset];
    ctx.newAssets.push(asset);
  }
  return asset;
};

const pickFont = (name: string | null, category: string | null) => {
  if (name) {
    const hit = FONTS.find((f) => f.family.toLowerCase() === name.toLowerCase());
    if (hit) return hit.family;
  }
  if (category) {
    const preferCyr = FONTS.filter((f) => f.category === category);
    return (preferCyr.find((f) => f.cyrillic) ?? preferCyr[0])?.family ?? null;
  }
  return null;
};

const step = (ctx: Ctx, label: string, detail: string, ...code: string[]) => {
  ctx.steps.push({ label, detail });
  ctx.code.push(...code);
};

const warn = (ctx: Ctx, detail: string) => ctx.steps.push({ label: "O'tkazib yuborildi", detail, warning: true });

const mainClips = (p: Project) => clipsOnTrack(p, "V1").filter((c): c is MediaClip => c.type === "media");

const assetName = (ctx: Ctx, clip: Clip) =>
  clip.type === "media" ? ctx.assets.find((a) => a.id === clip.assetId)?.name ?? clip.assetId : clip.type === "text" ? clip.text : clip.type === "sticker" ? clip.sticker : clip.effect;

const findClip = (ctx: Ctx, id: string) => ctx.project.clips.find((c) => c.id === id);

const replaceTrack = (p: Project, trackId: string, clips: Clip[]): Project => ({
  ...p,
  clips: [...p.clips.filter((c) => c.trackId !== trackId), ...clips],
});

const packTrack = (p: Project, trackId: string, ordered: Clip[]): Project => {
  let cursor = 0;
  return replaceTrack(
    p,
    trackId,
    ordered.map((c) => {
      const placed = { ...c, start: round(cursor, 3) };
      cursor += c.duration;
      return placed;
    }),
  );
};

const patchClip = (ctx: Ctx, id: string, patch: Partial<Clip>) => {
  ctx.project = { ...ctx.project, clips: ctx.project.clips.map((c) => (c.id === id ? ({ ...c, ...patch } as Clip) : c)) };
};

/** Speech lives in the interview demo clip or in any real uploaded footage. */
export const isSpeechAsset = (asset?: MediaAsset) => !!asset && (asset.id === "asset_portrait" || (!asset.scene && asset.kind === "video"));

/** Vocabulary shared with the system prompt. */
export const LIBRARY_SUMMARY = {
  musicCount: MUSIC.length,
  fonts: FONTS.length,
};

const speechClips = (ctx: Ctx) => mainClips(ctx.project).filter((c) => isSpeechAsset(ctx.assets.find((a) => a.id === c.assetId)));

const OPS: { [K in EditOp["op"]]: (ctx: Ctx, op: Extract<EditOp, { op: K }>) => void } = {
  set_aspect: (ctx, { aspect }) => {
    if (ctx.project.aspect === aspect) return;
    ctx.project = { ...ctx.project, aspect };
    step(ctx, `Format ${aspect}`, "Kadrlar avtomatik qayta kadrlashtirildi (smart reframe)", `project.setAspect("${aspect}")`);
  },

  remove_silences: (ctx, { clipIds }) => {
    const talk = clipIds
      ? mainClips(ctx.project).filter((c) => clipIds.includes(c.id))
      : speechClips(ctx).filter((c) => c.duration > 6);
    if (!talk.length) return warn(ctx, "Jimlik olib tashlash uchun nutqli klip topilmadi");
    const speech = ctx.analysis?.speech;
    if (speech?.size) {
      // Real analysis: cut exactly where the audio goes quiet.
      let p = ctx.project;
      let removed = 0;
      let done = 0;
      for (const clip of talk) {
        const segs = speech.get(clip.id);
        const current = p.clips.find((c) => c.id === clip.id) as MediaClip | undefined;
        if (!segs?.length || !current) continue;
        removed += current.duration - segs.reduce((acc, x) => acc + (x.end - x.start) / current.speed, 0);
        p = applySpeechSegments(p, current, segs);
        done++;
        ctx.code.push(`timeline.removeSilences("${assetName(ctx, clip)}", { detect: "rms", minPause: 0.45 })`);
      }
      if (done) {
        ctx.project = p;
        ctx.steps.push({ label: "Jimliklar olib tashlandi", detail: `Audio tahlili: ${done} ta klipdan ${round(removed, 1)} s pauza kesildi` });
        return;
      }
    }
    let removed = 0;
    let p = ctx.project;
    for (const clip of talk) {
      const pieces = clip.duration > 12 ? 4 : 3;
      const gap = 0.9;
      const len = (clip.duration - gap * (pieces - 1)) / pieces;
      if (len < 0.8) continue;
      const parts: MediaClip[] = Array.from({ length: pieces }, (_, i) => ({
        ...clip,
        id: uid("clip"),
        in: round(clip.in + i * (len + gap) * clip.speed, 3),
        duration: round(len, 3),
        motion: i % 2 ? "punch-in" : clip.motion,
        transitionIn: i === 0 ? clip.transitionIn : "none",
      }));
      removed += gap * (pieces - 1);
      p = { ...p, clips: p.clips.flatMap((c) => (c.id === clip.id ? parts : [c])) };
      ctx.code.push(`timeline.removeSilences("${assetName(ctx, clip)}", { minPause: 0.6 })`);
    }
    ctx.project = closeGaps(p, "V1");
    ctx.steps.push({
      label: "Jimliklar olib tashlandi",
      detail: `${talk.length} ta nutqli klipdan ${round(removed, 1)} s pauza kesildi, jump-cut + punch-in`,
    });
  },

  beat_cut: (ctx, { targetSeconds }) => {
    const clips = mainClips(ctx.project);
    if (!clips.length) return warn(ctx, "V1 trekida klip yo'q");
    const target = clamp(targetSeconds, 4, 180);
    const perClip = Math.max(1, Math.round(target / 2 / clips.length));
    const queues = clips.map((clip, ci) =>
      Array.from({ length: perClip }, (_, k) => {
        const len = 1.4 + ((ci * 3 + k * 5) % 7) * 0.15;
        const room = Math.max(0, clip.duration - len);
        return { clip, in: round(clip.in + room * ((k + 0.5) / perClip) * clip.speed, 3), len: round(Math.min(len, clip.duration), 3) };
      }),
    );
    const order: MediaClip[] = [];
    for (let k = 0; k < perClip; k++) {
      queues.forEach((q) => {
        const seg = q[k];
        if (!seg) return;
        const i = order.length;
        order.push({
          ...seg.clip,
          id: uid("clip"),
          in: seg.in,
          duration: seg.len,
          motion: i % 2 ? "punch-in" : "drift",
          transitionIn: i === 0 ? "none" : i % 3 === 0 ? "zoom" : i % 4 === 0 ? "blur" : "none",
          transitionDuration: 0.25,
        });
      });
    }
    ctx.project = packTrack(ctx.project, "V1", order);
    step(
      ctx,
      "Ritmga mos kesish",
      `${clips.length} ta klipdan ${order.length} ta qisqa kadr, jami ${round(order.reduce((s, c) => s + c.duration, 0), 1)} s`,
      `timeline.beatCut("V1", { target: ${target}, segment: [1.4, 2.4] })`,
    );
  },

  fit_duration: (ctx, { seconds }) => {
    const clips = mainClips(ctx.project);
    const total = clips.reduce((s, c) => s + c.duration, 0);
    if (!total || total <= seconds) return warn(ctx, `Video allaqachon ${round(total, 1)} s — qisqartirish shart emas`);
    const factor = seconds / total;
    const trimmed = clips.map((c) => {
      const d = round(c.duration * factor, 3);
      return { ...c, in: round(c.in + ((c.duration - d) / 2) * c.speed, 3), duration: d };
    });
    ctx.project = packTrack(ctx.project, "V1", trimmed);
    step(ctx, `${seconds} soniyaga qisqartirildi`, `Har klipning o'rta qismi saqlandi (${round(total, 1)}s → ${seconds}s)`, `timeline.fitDuration(${seconds}, { keep: "center" })`);
  },

  reorder: (ctx, { clipIds, reverse }) => {
    const clips = mainClips(ctx.project);
    let ordered: MediaClip[];
    if (clipIds?.length) {
      const byId = new Map(clips.map((c) => [c.id, c]));
      ordered = clipIds.map((id) => byId.get(id)).filter((c): c is MediaClip => !!c);
      ordered.push(...clips.filter((c) => !clipIds.includes(c.id)));
    } else if (reverse) {
      ordered = [...clips].reverse();
    } else return;
    ctx.project = packTrack(ctx.project, "V1", ordered);
    step(ctx, "Tartib o'zgartirildi", `${ordered.length} ta kadr yangi tartibda`, `timeline.reorder("V1", ${clipIds ? JSON.stringify(clipIds) : '"reverse"'})`);
  },

  add_transitions: (ctx, { type, duration }) => {
    const ids = new Set(mainClips(ctx.project).slice(1).map((c) => c.id));
    if (!ids.size) return;
    const d = clamp(duration, 0.1, 2);
    ctx.project = {
      ...ctx.project,
      clips: ctx.project.clips.map((c) => (ids.has(c.id) ? { ...c, transitionIn: type, transitionDuration: d } : c)),
    };
    step(ctx, "O'tishlar", `${ids.size} ta kesishga "${type}" (${d}s)`, `timeline.addTransitions("V1", "${type}", ${d})`);
  },

  set_grade: (ctx, { filter, letterbox, vignette, grain }) => {
    const extras = Object.fromEntries(
      Object.entries({ letterbox, vignette, grain }).filter(([, v]) => v !== null),
    ) as Partial<Project["grade"]>;
    ctx.project = { ...ctx.project, grade: { ...ctx.project.grade, filter, ...extras } };
    const names = { letterbox: "letterbox", vignette: "vinyetka", grain: "plyonka donasi" } as const;
    const on = (Object.keys(extras) as (keyof typeof names)[]).filter((k) => extras[k]).map((k) => names[k]);
    step(ctx, `Rang: ${FILTERS[filter].label}`, on.length ? `+ ${on.join(", ")}` : "Butun loyihaga qo'llandi", `grade.apply("${filter}", ${JSON.stringify(extras)})`);
  },

  set_motion: (ctx, { motion, clipIds }) => {
    const ids = new Set(clipIds ?? mainClips(ctx.project).map((c) => c.id));
    ctx.project = {
      ...ctx.project,
      clips: ctx.project.clips.map((c) => (c.type === "media" && ids.has(c.id) ? { ...c, motion } : c)),
    };
    step(ctx, "Kamera harakati", `${ids.size} ta klipga "${motion}"`, `timeline.applyMotion(${clipIds ? JSON.stringify(clipIds) : '"V1"'}, "${motion}")`);
  },

  set_speed: (ctx, { clipId, speed }) => {
    const clip = findClip(ctx, clipId);
    if (!clip || clip.type !== "media") return warn(ctx, `Klip topilmadi: ${clipId}`);
    const s = clamp(speed, 0.25, 4);
    patchClip(ctx, clip.id, { speed: s, duration: round((clip.duration * clip.speed) / s, 3) });
    ctx.project = closeGaps(ctx.project, clip.trackId);
    step(ctx, s < 1 ? "Slow-motion" : "Tezlik", `"${assetName(ctx, clip)}" → ${s}x`, `clip("${clip.id}").setSpeed(${s})`);
  },

  add_captions: (ctx, { lines }) => {
    if (!lines.length) return;
    const talk = speechClips(ctx);
    const ranges = (talk.length ? talk : mainClips(ctx.project).slice(0, 1)).map((c) => [c.start, clipEnd(c)]);
    const captions: Clip[] = [];
    let line = 0;
    for (const [from, to] of ranges) {
      for (let t = from; t + 0.8 < to && line < lines.length; t += 2.4) {
        captions.push(
          makeTextClip(round(t, 3), {
            trackId: "T2",
            duration: round(Math.min(2.3, to - t), 3),
            ...templatePatch("caption"),
            text: lines[line++],
            style: "caption",
            position: "bottom",
          }),
        );
      }
    }
    ctx.project = {
      ...ctx.project,
      clips: [...ctx.project.clips.filter((c) => c.trackId !== "T2"), ...captions],
    };
    step(ctx, "Subtitrlar", `${captions.length} ta subtitr, so'zma-so'z ajratish bilan`, `captions.add(${JSON.stringify(lines.slice(0, captions.length))})`);
  },

  add_text: (ctx, { text, style, start, duration, position }) => {
    const trackId = style === "caption" ? "T2" : "T1";
    const s = Math.max(0, start);
    // A new text replaces whatever overlaps it on the same track.
    const kept = ctx.project.clips.filter((c) => !(c.trackId === trackId && c.start < s + duration && clipEnd(c) > s));
    const clip = makeTextClip(round(s, 3), { ...templatePatch(style), trackId, text, style, duration: clamp(duration, 0.5, 60), position });
    ctx.project = { ...ctx.project, clips: [...kept, clip] };
    step(ctx, style === "title" || style === "pop" ? "Sarlavha" : "Matn qo'shildi", `"${text}" — ${style}, ${round(s, 1)}s dan`, `text.add(${JSON.stringify(text)}, { style: "${style}", at: ${round(s, 2)} })`);
  },

  add_music: (ctx, { assetId, volume }) => {
    const music = ctx.assets.find((a) => (assetId ? a.id === assetId : a.kind === "audio"));
    if (!music || music.kind !== "audio") return warn(ctx, "Audio fayl topilmadi");
    const total = projectDuration({ ...ctx.project, clips: ctx.project.clips.filter((c) => c.trackId !== "A1") });
    const clips: Clip[] = [];
    for (let t = 0; t < total - 0.1; t += music.duration) {
      clips.push(makeMediaClip(music, "A1", round(t, 3), { duration: round(Math.min(music.duration, total - t), 3), volume: clamp(volume ?? 0.6, 0, 1.5), fadeIn: 0.5, fadeOut: 1 }));
    }
    ctx.project = replaceTrack(ctx.project, "A1", clips);
    step(ctx, "Musiqa", `"${music.name}" ${round(total, 1)}s ga moslandi, fade-in/out`, `audio.add("${music.name}", { fit: "timeline", fade: 0.5 })`);
  },

  update_clip: (ctx, { clipId, ...fields }) => {
    const clip = findClip(ctx, clipId);
    if (!clip) return warn(ctx, `Klip topilmadi: ${clipId}`);
    const patch: Record<string, unknown> = {};
    const { textStyle, ...rest } = fields;
    for (const [k, v] of Object.entries(rest)) if (v !== null && k !== "op") patch[k] = v;
    if (textStyle) patch.style = textStyle;
    const adjust: Record<string, number> = {};
    for (const k of ["brightness", "contrast", "saturation", "temperature"]) {
      if (typeof patch[k] === "number") adjust[k] = clamp(patch[k] as number, -1, 1);
      delete patch[k];
    }
    if (Object.keys(adjust).length && clip.type === "media") patch.adjust = { ...clip.adjust, ...adjust };
    if (clip.type === "media") ["text", "style", "position", "color"].forEach((k) => delete patch[k]);
    else ["filter", "motion", "volume", "speedCurve", "reverse", "fadeIn", "fadeOut", "fit", "filterIntensity"].forEach((k) => delete patch[k]);
    if (clip.type === "effect") ["opacity", "scale", "x", "y", "rotation"].forEach((k) => delete patch[k]);
    if (!Object.keys(patch).length) return;
    patchClip(ctx, clip.id, patch as Partial<Clip>);
    const label = `"${assetName(ctx, clip)}"`;
    step(ctx, "Klip yangilandi", `${label}: ${Object.keys(patch).join(", ")}`, `clip("${clip.id}").set(${JSON.stringify(patch)})`);
  },

  split_clip: (ctx, { clipId, at }) => {
    const before = ctx.project;
    ctx.project = splitClip(ctx.project, clipId, at);
    if (ctx.project === before) return warn(ctx, `Kesib bo'lmadi: ${clipId} @ ${at}s`);
    step(ctx, "Kesildi", `${round(at, 2)}s nuqtada`, `clip("${clipId}").split(${round(at, 2)})`);
  },

  delete_clip: (ctx, { clipId, ripple }) => {
    const clip = findClip(ctx, clipId);
    if (!clip) return warn(ctx, `Klip topilmadi: ${clipId}`);
    let clips = ctx.project.clips.filter((c) => c.id !== clipId);
    if (ripple) {
      clips = clips.map((c) =>
        c.trackId === clip.trackId && c.start >= clipEnd(clip) ? { ...c, start: round(c.start - clip.duration, 3) } : c,
      );
    }
    ctx.project = { ...ctx.project, clips };
    step(ctx, "O'chirildi", `${assetName(ctx, clip)}${ripple ? " (ripple)" : ""}`, `clip("${clipId}").delete({ ripple: ${ripple} })`);
  },

  move_clip: (ctx, { clipId, start }) => {
    const clip = findClip(ctx, clipId);
    if (!clip) return warn(ctx, `Klip topilmadi: ${clipId}`);
    patchClip(ctx, clipId, { start: round(Math.max(0, start), 3) });
    step(ctx, "Ko'chirildi", `${round(start, 2)}s ga`, `clip("${clipId}").moveTo(${round(start, 2)})`);
  },

  trim_clip: (ctx, { clipId, start, end }) => {
    const clip = findClip(ctx, clipId);
    if (!clip) return warn(ctx, `Klip topilmadi: ${clipId}`);
    const newStart = start === null ? clip.start : clamp(start, clip.start - (clip.type === "media" ? clip.in / clip.speed : 0), clipEnd(clip) - 0.2);
    const newEnd = end === null ? clipEnd(clip) : Math.max(newStart + 0.2, end);
    const headDelta = newStart - clip.start;
    patchClip(ctx, clipId, {
      start: round(newStart, 3),
      duration: round(newEnd - newStart, 3),
      ...(clip.type === "media" ? { in: round(Math.max(0, clip.in + headDelta * clip.speed), 3) } : {}),
    });
    step(ctx, "Trim", `${round(newStart, 2)}s → ${round(newEnd, 2)}s`, `clip("${clipId}").trim(${round(newStart, 2)}, ${round(newEnd, 2)})`);
  },

  add_clip: (ctx, { assetId, trackId, start, sourceIn, duration }) => {
    const asset = ctx.assets.find((a) => a.id === assetId);
    if (!asset) return warn(ctx, `Media topilmadi: ${assetId}`);
    const track = trackId ?? (asset.kind === "audio" ? "A1" : "V1");
    const at = start ?? ctx.project.clips.filter((c) => c.trackId === track).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
    const srcIn = clamp(sourceIn ?? 0, 0, Math.max(0, asset.duration - 0.2));
    const clip = makeMediaClip(asset, track, round(at, 3), {
      in: srcIn,
      duration: round(clamp(duration ?? asset.duration - srcIn, 0.2, asset.duration - srcIn), 3),
    });
    ctx.project = { ...ctx.project, clips: [...ctx.project.clips, clip] };
    step(ctx, "Klip qo'shildi", `"${asset.name}" → ${track}, ${round(at, 1)}s`, `timeline.add("${asset.name}", { track: "${track}", at: ${round(at, 2)} })`);
  },

  close_gaps: (ctx, { trackId }) => {
    ctx.project = closeGaps(ctx.project, trackId);
    step(ctx, "Bo'shliqlar yopildi", `${trackId} treki`, `timeline.closeGaps("${trackId}")`);
  },

  rename_project: (ctx, { name }) => {
    ctx.project = { ...ctx.project, name };
    step(ctx, "Loyiha nomi", name, `project.rename(${JSON.stringify(name)})`);
  },

  beat_sync: (ctx, { every, maxSeconds }) => {
    const n = Math.round(clamp(every || 2, 1, 8));
    let beats = ctx.analysis?.beats;
    let detail = "";
    if (beats?.length) {
      detail = `${ctx.analysis?.bpm ?? "?"} BPM, har ${n} bitda kesish`;
    } else {
      // No decodable music: fall back to a 120 BPM grid.
      const total = maxSeconds ?? 16;
      beats = Array.from({ length: Math.ceil(total / 0.5) + 1 }, (_, i) => round(i * 0.5, 3));
      detail = `Musiqa tahlil qilinmadi — 120 BPM to'r, har ${n} bitda`;
    }
    const before = ctx.project;
    ctx.project = cutToBeats(ctx.project, beats, n, maxSeconds ?? undefined);
    if (ctx.project === before) return warn(ctx, "Ritmga moslash uchun klip yoki bit yetarli emas");
    step(ctx, "Ritmga moslab kesish", `${detail}, ${mainClips(ctx.project).length} ta kadr`, `timeline.beatSync("V1", { every: ${n} })`);
  },

  add_library_music: (ctx, { tags, trackId, volume }) => {
    const track = trackId ?? "A1";
    const total = projectDuration({ ...ctx.project, clips: ctx.project.clips.filter((c) => c.trackId !== track) }) || 15;
    const current = ctx.project.clips.filter((c) => c.trackId === track && c.type === "media").map((c) => (c as MediaClip).assetId.replace(/^lib_/, ""));
    const t = pickMusic(tags, total, current);
    if (!t) return warn(ctx, "Mos musiqa topilmadi");
    const music = useAsset(ctx, musicToAsset(t));
    const clips: Clip[] = [];
    for (let s = 0; s < total - 0.1; s += music.duration) {
      clips.push(makeMediaClip(music, track, round(s, 3), { duration: round(Math.min(music.duration, total - s), 3), volume: clamp(volume ?? 0.6, 0, 1.5), fadeIn: 0.5, fadeOut: 1.2 }));
    }
    ctx.project = migrateProject(replaceTrack(ctx.project, track, clips));
    step(ctx, "Musiqa kutubxonadan", `"${t.title}" (Kevin MacLeod, CC BY 4.0) — ${tags.join(", ")}`, `audio.addFromLibrary(${JSON.stringify(tags)}) // ${t.id}`);
  },

  add_sfx: (ctx, { tags, at, atCuts, volume }) => {
    const sfx = pickSfx(tags);
    if (!sfx) return warn(ctx, `Tovush topilmadi: ${tags.join(", ")}`);
    const asset = useAsset(ctx, sfxToAsset(sfx));
    const times = at?.length ? at : atCuts ? mainClips(ctx.project).slice(1).map((c) => Math.max(0, c.start - Math.min(0.25, asset.duration / 2))) : [0];
    let p = migrateProject(ctx.project);
    for (const time of times.slice(0, 40)) {
      const clip = makeMediaClip(asset, "A2", round(Math.max(0, time), 3), { volume: clamp(volume ?? 0.9, 0, 1.5), fadeIn: 0, fadeOut: 0 });
      p = insertClip(p, clip, ["audio"], "A2");
    }
    ctx.project = p;
    step(ctx, "Tovush effekti", `"${sfx.title}" × ${Math.min(40, times.length)}`, `sfx.add("${sfx.id}", ${JSON.stringify(times.map((x) => round(x, 2)))})`);
  },

  add_sticker: (ctx, { sticker, start, duration, x, y, scale }) => {
    const id = sticker.startsWith("shape:")
      ? SHAPE_STICKERS.some((s) => `shape:${s.id}` === sticker) ? sticker : null
      : EMOJI_STICKERS.some((e) => e.name === sticker.replace(/^emoji:/, "")) ? `emoji:${sticker.replace(/^emoji:/, "")}` : null;
    if (!id) return warn(ctx, `Stiker topilmadi: ${sticker}`);
    const clip = makeStickerClip(round(Math.max(0, start), 3), id, { duration: clamp(duration, 0.3, 30), x: x ?? 0, y: y ?? 0, scale: scale ?? 1 });
    ctx.project = insertClip(ctx.project, clip, ["sticker"], "S1");
    step(ctx, "Stiker", `${id} — ${round(start, 1)}s`, `stickers.add("${id}", { at: ${round(start, 2)} })`);
  },

  add_effect: (ctx, { effect, start, duration, intensity }) => {
    const clip = makeEffectClip(round(Math.max(0, start), 3), effect, { duration: clamp(duration, 0.2, 60), intensity: clamp(intensity ?? 0.7, 0, 1) });
    ctx.project = insertClip(ctx.project, clip, ["effect"], "FX1");
    step(ctx, "Video effekt", `${EFFECTS[effect]?.label ?? effect} — ${round(start, 1)}s, ${round(duration, 1)}s`, `effects.add("${effect}", { at: ${round(start, 2)}, duration: ${round(duration, 2)} })`);
  },

  style_text: (ctx, { clipIds, template, font, fontCategory, ...rest }) => {
    const targets = ctx.project.clips.filter((c): c is TextClip => c.type === "text" && (!clipIds || clipIds.includes(c.id)));
    if (!targets.length) return warn(ctx, "Matn klipi topilmadi");
    const family = pickFont(font, fontCategory);
    const extra = Object.fromEntries(Object.entries(rest).filter(([k, v]) => v !== null && k !== "op")) as Partial<TextClip>;
    const ids = new Set(targets.map((c) => c.id));
    ctx.project = {
      ...ctx.project,
      clips: ctx.project.clips.map((c) =>
        ids.has(c.id) && c.type === "text"
          ? ({ ...c, ...(template ? templatePatch(template) : {}), position: c.position, ...(family ? { font: family } : {}), ...extra } as TextClip)
          : c,
      ),
    };
    step(ctx, "Matn uslubi", `${targets.length} ta matn${family ? ` · ${family}` : ""}${template ? ` · ${TEXT_TEMPLATES[template]?.label}` : ""}`, `text.style(${JSON.stringify({ template, font: family, ...extra })})`);
  },

  set_animation: (ctx, { clipIds, animIn, animOut, animCombo, duration }) => {
    const ids = new Set(clipIds ?? mainClips(ctx.project).map((c) => c.id));
    const d = clamp(duration ?? 0.5, 0.1, 3);
    let count = 0;
    ctx.project = {
      ...ctx.project,
      clips: ctx.project.clips.map((c) => {
        if (!ids.has(c.id) || c.type === "effect") return c;
        count++;
        const dd = Math.min(d, c.duration / 2);
        return {
          ...c,
          ...(animIn ? { animIn: { id: animIn, duration: dd } } : {}),
          ...(animOut ? { animOut: { id: animOut, duration: dd } } : {}),
          ...(animCombo ? { animCombo: { id: animCombo, duration: 0 } } : {}),
        } as Clip;
      }),
    };
    step(ctx, "Animatsiya", `${count} ta klip: ${[animIn, animOut, animCombo].filter(Boolean).map((a) => CLIP_ANIMATIONS[a!]?.label).join(", ")}`, `clips.animate(${JSON.stringify({ animIn, animOut, animCombo, duration: d })})`);
  },

  set_keyframes: (ctx, { clipId, prop, keyframes }) => {
    const clip = findClip(ctx, clipId);
    if (!clip || clip.type === "effect") return warn(ctx, `Klip topilmadi: ${clipId}`);
    let next: Clip = { ...clip, keyframes: { ...clip.keyframes, [prop]: [] } } as Clip;
    for (const k of keyframes) next = setKeyframe(next, prop as KeyframeProp, k.t, k.value, k.easing as Easing);
    ctx.project = { ...ctx.project, clips: ctx.project.clips.map((c) => (c.id === clipId ? next : c)) };
    step(ctx, "Keyframe", `${assetName(ctx, clip)}: ${prop} × ${keyframes.length}`, `clip("${clipId}").keyframes("${prop}", ${JSON.stringify(keyframes)})`);
  },

  set_background: (ctx, { type, color, blur }) => {
    const bg = ctx.project.background ?? { type: "color" as const, color: "#000000", blur: 40 };
    ctx.project = { ...ctx.project, background: { ...bg, type, color: color ?? bg.color, blur: blur ?? bg.blur } };
    step(ctx, "Kanvas foni", type === "blur" ? "Blur fon" : type === "color" ? `Rang ${color ?? bg.color}` : "Gradient", `canvas.background("${type}")`);
  },
};

export const applyOps = (project: Project, assets: MediaAsset[], ops: EditOp[], analysis?: OpAnalysis) => {
  const ctx: Ctx = { project: migrateProject(project), assets, newAssets: [], steps: [], code: [], analysis };
  for (const op of ops) {
    try {
      (OPS[op.op] as (ctx: Ctx, op: EditOp) => void)(ctx, op);
    } catch (err) {
      warn(ctx, `${op.op}: ${(err as Error).message}`);
    }
  }
  return { project: ctx.project, steps: ctx.steps, code: ctx.code.join("\n"), newAssets: ctx.newAssets };
};

// ---------- Context for the model ----------

const SCENE_NOTES: Record<string, string> = {
  asset_city: "night city skyline timelapse, no speech",
  asset_mountains: "drone shot over mountains, no speech",
  asset_ocean: "sunset over the ocean, no speech",
  asset_portrait: "talking-head interview, person speaking to camera (has speech with pauses)",
  asset_product: "product close-up rotating on a turntable, no speech",
  asset_neon: "rainy street with neon signs, no speech",
};

/** Compact, model-friendly snapshot of the timeline (ids, timings rounded). */
export const describeProject = (project: Project, assets: MediaAsset[], selectedId: string | null) => ({
  name: project.name,
  aspect: project.aspect,
  fps: project.fps,
  duration: round(projectDuration(project), 2),
  grade: project.grade,
  selectedClipId: selectedId,
  tracks: project.tracks.map((t) => ({ id: t.id, kind: t.kind, name: t.name })),
  clips: [...project.clips]
    .sort((a, b) => a.trackId.localeCompare(b.trackId) || a.start - b.start)
    .map((c) =>
      c.type === "media"
        ? {
            id: c.id,
            track: c.trackId,
            asset: c.assetId,
            start: round(c.start, 2),
            end: round(clipEnd(c), 2),
            sourceIn: round(c.in, 2),
            speed: c.speed,
            filter: c.filter,
            motion: c.motion,
            transitionIn: c.transitionIn,
            volume: c.volume,
            ...(c.animIn || c.animOut ? { anim: [c.animIn?.id, c.animOut?.id].filter(Boolean) } : {}),
            ...(c.speedCurve && c.speedCurve !== "none" ? { speedCurve: c.speedCurve } : {}),
            ...(c.reverse ? { reverse: true } : {}),
          }
        : c.type === "text"
          ? {
              id: c.id,
              track: c.trackId,
              text: c.text,
              style: c.style,
              start: round(c.start, 2),
              end: round(clipEnd(c), 2),
              position: c.position,
              ...(c.font ? { font: c.font } : {}),
              ...(c.textIn || c.textLoop ? { textAnim: [c.textIn, c.textLoop].filter(Boolean) } : {}),
            }
          : c.type === "sticker"
            ? { id: c.id, track: c.trackId, sticker: c.sticker, start: round(c.start, 2), end: round(clipEnd(c), 2) }
            : { id: c.id, track: c.trackId, effect: c.effect, start: round(c.start, 2), end: round(clipEnd(c), 2) },
    ),
  background: project.background?.type ?? "color",
  assets: assets.filter((a) => a.origin !== "sfx").map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    duration: round(a.duration, 2),
    note:
      SCENE_NOTES[a.id] ??
      (a.origin === "music" ? "library music track" : a.id === "asset_music" ? "demo lo-fi beat" : isSpeechAsset(a) ? "user-uploaded footage, may contain speech" : `user-uploaded ${a.kind}`),
  })),
});

export type ProjectDescription = ReturnType<typeof describeProject>;
