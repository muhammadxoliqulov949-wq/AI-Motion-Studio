/**
 * The edit operation language shared by the LLM and the local fallback planner.
 * The model reads the project JSON and answers with a list of these ops; `applyOps`
 * runs them against the timeline using the same helpers as the manual UI.
 */
import { z } from "zod";
import { clipsOnTrack, closeGaps, makeMediaClip, makeTextClip, splitClip } from "./ops";
import { FILTERS } from "./presets";
import type { Clip, MediaAsset, MediaClip, Project, TextClip } from "./types";
import { clamp, clipEnd, projectDuration, round, uid } from "./utils";

// ---------- Schema ----------

const ASPECT = z.enum(["16:9", "9:16", "1:1"]);
const FILTER = z.enum(["none", "cinematic", "teal-orange", "vintage", "mono", "vivid", "cool", "warm", "fade"]);
const TRANSITION = z.enum(["none", "fade", "slide", "zoom", "blur", "wipe"]);
const MOTION = z.enum(["none", "ken-burns", "punch-in", "shake", "drift"]);
const TEXT_STYLE = z.enum(["title", "caption", "lower-third", "pop", "typewriter", "neon"]);
const POSITION = z.enum(["top", "center", "bottom"]);

// Every field is required (nullable instead of optional) and the union is a plain z.union
// (anyOf, not oneOf) so OpenAI strict structured outputs accept the schema.
export const EditOpSchema = z.union([
  z.object({ op: z.literal("set_aspect"), aspect: ASPECT }),
  z.object({
    op: z.literal("remove_silences"),
    clipIds: z.array(z.string()).nullable().describe("Speech clips to tighten; null = all detected speech clips"),
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

interface Ctx {
  project: Project;
  assets: MediaAsset[];
  steps: AgentStep[];
  code: string[];
}

const step = (ctx: Ctx, label: string, detail: string, ...code: string[]) => {
  ctx.steps.push({ label, detail });
  ctx.code.push(...code);
};

const warn = (ctx: Ctx, detail: string) => ctx.steps.push({ label: "O'tkazib yuborildi", detail, warning: true });

const mainClips = (p: Project) => clipsOnTrack(p, "V1").filter((c): c is MediaClip => c.type === "media");

const assetName = (ctx: Ctx, clip: MediaClip) => ctx.assets.find((a) => a.id === clip.assetId)?.name ?? clip.assetId;

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
    const clip = makeTextClip(round(s, 3), { trackId, text, style, duration: clamp(duration, 0.5, 60), position });
    ctx.project = { ...ctx.project, clips: [...kept, clip] };
    step(ctx, style === "title" || style === "pop" ? "Sarlavha" : "Matn qo'shildi", `"${text}" — ${style}, ${round(s, 1)}s dan`, `text.add(${JSON.stringify(text)}, { style: "${style}", at: ${round(s, 2)} })`);
  },

  add_music: (ctx, { assetId, volume }) => {
    const music = ctx.assets.find((a) => (assetId ? a.id === assetId : a.kind === "audio"));
    if (!music || music.kind !== "audio") return warn(ctx, "Audio fayl topilmadi");
    const total = projectDuration({ ...ctx.project, clips: ctx.project.clips.filter((c) => c.trackId !== "A1") });
    const clips: Clip[] = [];
    for (let t = 0; t < total - 0.1; t += music.duration) {
      clips.push(makeMediaClip(music, "A1", round(t, 3), { duration: round(Math.min(music.duration, total - t), 3), volume: clamp(volume ?? 0.6, 0, 1.5) }));
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
    if (clip.type === "media") ["text", "style", "position", "color"].forEach((k) => delete patch[k]);
    else ["filter", "motion", "volume", "opacity", "scale"].forEach((k) => delete patch[k]);
    if (!Object.keys(patch).length) return;
    patchClip(ctx, clip.id, patch as Partial<Clip>);
    const label = clip.type === "text" ? `"${(clip as TextClip).text}"` : `"${assetName(ctx, clip)}"`;
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
    step(ctx, "O'chirildi", `${clip.type === "text" ? clip.text : assetName(ctx, clip)}${ripple ? " (ripple)" : ""}`, `clip("${clipId}").delete({ ripple: ${ripple} })`);
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
};

export const applyOps = (project: Project, assets: MediaAsset[], ops: EditOp[]) => {
  const ctx: Ctx = { project, assets, steps: [], code: [] };
  for (const op of ops) {
    try {
      (OPS[op.op] as (ctx: Ctx, op: EditOp) => void)(ctx, op);
    } catch (err) {
      warn(ctx, `${op.op}: ${(err as Error).message}`);
    }
  }
  return { project: ctx.project, steps: ctx.steps, code: ctx.code.join("\n") };
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
          }
        : {
            id: c.id,
            track: c.trackId,
            text: c.text,
            style: c.style,
            start: round(c.start, 2),
            end: round(clipEnd(c), 2),
            position: c.position,
          },
    ),
  assets: assets.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    duration: round(a.duration, 2),
    note: SCENE_NOTES[a.id] ?? (isSpeechAsset(a) ? "user-uploaded footage, may contain speech" : `user-uploaded ${a.kind}`),
  })),
});

export type ProjectDescription = ReturnType<typeof describeProject>;
