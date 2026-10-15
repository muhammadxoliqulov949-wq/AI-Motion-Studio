import { TEXT_TEMPLATES } from "./catalog/text-templates";
import { shiftKeyframes } from "./keyframes";
import type {
  Clip,
  EffectClip,
  MediaAsset,
  MediaClip,
  Project,
  StickerClip,
  TextClip,
  Track,
  TrackKind,
} from "./types";
import { clipEnd, round, uid } from "./utils";

export const DEFAULT_TRACKS: Track[] = [
  { id: "FX1", kind: "effect", name: "Effektlar", muted: false, hidden: false, locked: false },
  { id: "S1", kind: "sticker", name: "Stikerlar", muted: false, hidden: false, locked: false },
  { id: "T1", kind: "text", name: "Matn", muted: false, hidden: false, locked: false },
  { id: "T2", kind: "text", name: "Subtitr", muted: false, hidden: false, locked: false },
  { id: "V2", kind: "overlay", name: "Overlay", muted: false, hidden: false, locked: false },
  { id: "V1", kind: "video", name: "Asosiy video", muted: false, hidden: false, locked: false },
  { id: "A1", kind: "audio", name: "Musiqa", muted: false, hidden: false, locked: false },
  { id: "A2", kind: "audio", name: "Tovush effektlari", muted: false, hidden: false, locked: false },
];

export const TRACK_LABELS: Record<TrackKind, string> = {
  video: "Video",
  overlay: "Overlay",
  text: "Matn",
  sticker: "Stiker",
  effect: "Effekt",
  audio: "Audio",
};

/** Order of track kinds from top to bottom of the timeline. */
const KIND_ORDER: TrackKind[] = ["effect", "sticker", "text", "overlay", "video", "audio"];

/** Ensures projects saved by older versions have every default track. */
export const migrateProject = (project: Project): Project => {
  const missing = DEFAULT_TRACKS.filter((d) => !project.tracks.some((t) => t.id === d.id));
  if (!missing.length) return project;
  const tracks = [...project.tracks, ...missing].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return { ...project, tracks };
};

export const trackForAsset = (asset: MediaAsset): TrackKind => (asset.kind === "audio" ? "audio" : "video");

export const sortClips = (clips: Clip[]) => [...clips].sort((a, b) => a.start - b.start);

export const clipsOnTrack = (project: Project, trackId: string) =>
  sortClips(project.clips.filter((c) => c.trackId === trackId));

export const trackEnd = (project: Project, trackId: string) =>
  project.clips.filter((c) => c.trackId === trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0);

const overlaps = (project: Project, trackId: string, start: number, duration: number, ignoreId?: string) =>
  project.clips.some((c) => c.trackId === trackId && c.id !== ignoreId && c.start < start + duration - 0.001 && clipEnd(c) > start + 0.001);

/** Adds a new track of `kind` right above the topmost track of that kind (or at its slot). */
export const addTrack = (project: Project, kind: TrackKind, name?: string): { project: Project; track: Track } => {
  const prefix = { video: "V", overlay: "V", text: "T", sticker: "S", effect: "FX", audio: "A" }[kind];
  let n = 1;
  while (project.tracks.some((t) => t.id === `${prefix}${n}`)) n++;
  const sameKind = project.tracks.filter((t) => t.kind === kind).length;
  const track: Track = {
    id: `${prefix}${n}`,
    kind,
    name: name ?? `${TRACK_LABELS[kind]} ${sameKind + 1}`,
    muted: false,
    hidden: false,
    locked: false,
  };
  const firstIdx = project.tracks.findIndex((t) => t.kind === kind);
  const tracks = [...project.tracks];
  if (firstIdx >= 0) tracks.splice(kind === "audio" ? project.tracks.map((t) => t.kind).lastIndexOf("audio") + 1 : firstIdx, 0, track);
  else {
    const order = KIND_ORDER.indexOf(kind);
    const idx = tracks.findIndex((t) => KIND_ORDER.indexOf(t.kind) > order);
    tracks.splice(idx < 0 ? tracks.length : idx, 0, track);
  }
  return { project: { ...project, tracks }, track };
};

export const removeTrack = (project: Project, trackId: string): Project => ({
  ...project,
  tracks: project.tracks.filter((t) => t.id !== trackId),
  clips: project.clips.filter((c) => c.trackId !== trackId),
});

/**
 * Finds a track of the given kind (or one of `kinds`) where [start, start+duration) is free,
 * preferring `preferred`; creates a new track when every one is busy (CapCut behaviour).
 */
export const placeOnTrack = (
  project: Project,
  kinds: TrackKind[],
  start: number,
  duration: number,
  preferred?: string,
): { project: Project; trackId: string } => {
  const candidates = project.tracks.filter((t) => kinds.includes(t.kind) && !t.locked);
  const ordered = preferred ? [...candidates.filter((t) => t.id === preferred), ...candidates.filter((t) => t.id !== preferred)] : candidates;
  // Audio prefers the bottom track; visual layers prefer the lowest free layer.
  const scan = kinds.includes("audio") ? ordered : [...ordered].reverse();
  const pick = preferred && ordered[0]?.id === preferred && !overlaps(project, preferred, start, duration) ? ordered[0] : scan.find((t) => !overlaps(project, t.id, start, duration));
  if (pick) return { project, trackId: pick.id };
  const { project: next, track } = addTrack(project, kinds[0]);
  return { project: next, trackId: track.id };
};

export const makeMediaClip = (
  asset: MediaAsset,
  trackId: string,
  start: number,
  patch: Partial<MediaClip> = {},
): MediaClip => ({
  id: uid("clip"),
  type: "media",
  assetId: asset.id,
  trackId,
  start,
  duration: asset.duration,
  in: 0,
  speed: 1,
  volume: asset.kind === "audio" ? (asset.origin === "sfx" ? 1 : 0.8) : 1,
  ...(asset.kind === "audio" ? { fadeIn: asset.origin === "sfx" ? 0 : 0.3, fadeOut: asset.origin === "sfx" ? 0 : 0.8 } : {}),
  filter: "none",
  motion: "none",
  opacity: 1,
  scale: 1,
  transitionIn: "none",
  transitionDuration: 0.5,
  ...patch,
});

/** Applies a text template (style id) to a clip: base fields + template overrides. */
export const templatePatch = (style: string): Partial<TextClip> => {
  const tpl = TEXT_TEMPLATES[style];
  if (!tpl) return { style };
  const colorDefaults: Record<string, string> = { pop: "#facc15" };
  return { style, position: tpl.position, ...(colorDefaults[style] ? { color: colorDefaults[style] } : {}), ...tpl.patch };
};

export const makeTextClip = (start: number, patch: Partial<TextClip> = {}): TextClip => ({
  id: uid("text"),
  type: "text",
  trackId: "T1",
  start,
  duration: 3,
  text: "Yangi matn",
  style: "title",
  position: "center",
  color: "#ffffff",
  transitionIn: "none",
  transitionDuration: 0.4,
  ...templatePatch(patch.style ?? "title"),
  ...patch,
});

export const makeStickerClip = (start: number, sticker: string, patch: Partial<StickerClip> = {}): StickerClip => ({
  id: uid("stk"),
  type: "sticker",
  trackId: "S1",
  start,
  duration: 3,
  sticker,
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  transitionIn: "none",
  transitionDuration: 0.3,
  animIn: { id: "in:pop-in", duration: 0.4 },
  ...patch,
});

export const makeEffectClip = (start: number, effect: string, patch: Partial<EffectClip> = {}): EffectClip => ({
  id: uid("fx"),
  type: "effect",
  trackId: "FX1",
  start,
  duration: 2,
  effect,
  intensity: 0.7,
  transitionIn: "none",
  transitionDuration: 0,
  ...patch,
});

export const appendAsset = (project: Project, asset: MediaAsset, at?: number): Project => {
  const trackId = asset.kind === "audio" ? (asset.origin === "sfx" ? "A2" : "A1") : "V1";
  const p = migrateProject(project);
  const start = at ?? trackEnd(p, trackId);
  return { ...p, clips: [...p.clips, makeMediaClip(asset, trackId, start)] };
};

/** Inserts a clip at `at`, picking a free track of the right kind (adds a track when needed). */
export const insertClip = (project: Project, clip: Clip, kinds: TrackKind[], preferred?: string): Project => {
  const placed = placeOnTrack(migrateProject(project), kinds, clip.start, clip.duration, preferred);
  return { ...placed.project, clips: [...placed.project.clips, { ...clip, trackId: placed.trackId } as Clip] };
};

export const kindsForClip = (clip: Clip, asset?: MediaAsset): TrackKind[] => {
  if (clip.type === "text") return ["text"];
  if (clip.type === "sticker") return ["sticker", "text"];
  if (clip.type === "effect") return ["effect"];
  return asset?.kind === "audio" ? ["audio"] : ["overlay", "video"];
};

export const updateClip = (project: Project, id: string, patch: Partial<Clip>): Project => ({
  ...project,
  clips: project.clips.map((c) => (c.id === id ? ({ ...c, ...patch } as Clip) : c)),
});

export const removeClip = (project: Project, id: string, ripple = false): Project => {
  const target = project.clips.find((c) => c.id === id);
  if (!target) return project;
  const clips = project.clips
    .filter((c) => c.id !== id)
    .map((c) =>
      ripple && c.trackId === target.trackId && c.start >= clipEnd(target)
        ? { ...c, start: round(c.start - target.duration, 3) }
        : c,
    );
  return { ...project, clips };
};

/** Duplicates a clip right after itself (or on a free track if that spot is busy). */
export const duplicateClip = (project: Project, id: string): { project: Project; id: string | null } => {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip) return { project, id: null };
  const copy = { ...clip, id: uid(clip.type === "media" ? "clip" : clip.type), start: round(clipEnd(clip), 3) } as Clip;
  const track = project.tracks.find((t) => t.id === clip.trackId);
  const kinds = track ? [track.kind] : ["video" as TrackKind];
  const placed = placeOnTrack(project, kinds, copy.start, copy.duration, clip.trackId);
  const next = { ...placed.project, clips: [...placed.project.clips, { ...copy, trackId: placed.trackId } as Clip] };
  return { project: next, id: copy.id };
};

export const splitClip = (project: Project, id: string, time: number): Project => {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip || time <= clip.start + 0.05 || time >= clipEnd(clip) - 0.05) return project;
  const leftDuration = round(time - clip.start, 3);
  const left = { ...clip, duration: leftDuration, animOut: undefined } as Clip;
  const rightBase = {
    ...clip,
    start: time,
    duration: round(clip.duration - leftDuration, 3),
    transitionIn: "none",
    keyframes: shiftKeyframes(clip, leftDuration),
    animIn: undefined,
  };
  const right: Clip =
    clip.type === "media"
      ? {
          ...(rightBase as MediaClip),
          id: uid("clip"),
          in: clip.reverse ? clip.in : round(clip.in + leftDuration * clip.speed, 3),
          fadeIn: 0,
        }
      : ({ ...rightBase, id: uid(clip.type) } as Clip);
  if (clip.type === "media") (left as MediaClip).fadeOut = 0;
  if (clip.type === "media" && clip.reverse) (left as MediaClip).in = round(clip.in + (clip.duration - leftDuration) * clip.speed, 3);
  return {
    ...project,
    clips: project.clips.flatMap((c) => (c.id === id ? [left, right] : [c])),
  };
};

/** Splits every clip under the playhead (like the razor tool across tracks). */
export const splitAt = (project: Project, time: number, onlyId?: string): Project =>
  project.clips
    .filter((c) => (onlyId ? c.id === onlyId : true))
    .filter((c) => time > c.start && time < clipEnd(c))
    .reduce((p, c) => splitClip(p, c.id, time), project);

/** Deletes the part of the selected clip before/after the playhead (CapCut "trim left/right"). */
export const trimToPlayhead = (project: Project, id: string, time: number, side: "left" | "right"): Project => {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip || time <= clip.start + 0.05 || time >= clipEnd(clip) - 0.05) return project;
  if (side === "right") return updateClip(project, id, { duration: round(time - clip.start, 3) });
  const delta = time - clip.start;
  return updateClip(project, id, {
    start: round(time, 3),
    duration: round(clip.duration - delta, 3),
    keyframes: shiftKeyframes(clip, delta),
    ...(clip.type === "media" && !clip.reverse ? { in: round(clip.in + delta * clip.speed, 3) } : {}),
  } as Partial<Clip>);
};

/** Packs clips on a track so there are no gaps between them. */
export const closeGaps = (project: Project, trackId: string): Project => {
  let cursor = 0;
  const ordered = clipsOnTrack(project, trackId);
  const moved = new Map<string, number>();
  for (const clip of ordered) {
    moved.set(clip.id, round(cursor, 3));
    cursor += clip.duration;
  }
  return {
    ...project,
    clips: project.clips.map((c) => (moved.has(c.id) ? { ...c, start: moved.get(c.id)! } : c)),
  };
};

/** Changes speed keeping the same source span (duration shrinks/grows). */
export const setClipSpeed = (project: Project, id: string, speed: number): Project => {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip || clip.type !== "media") return project;
  return updateClip(project, id, { speed, duration: round((clip.duration * clip.speed) / speed, 3) });
};

export const createInitialProject = (assets: MediaAsset[]): Project => {
  const order = ["asset_portrait", "asset_city", "asset_mountains", "asset_ocean"];
  let project: Project = {
    name: "Mening birinchi loyiham",
    aspect: "16:9",
    fps: 30,
    tracks: DEFAULT_TRACKS,
    clips: [],
    grade: { filter: "none", letterbox: false, vignette: false, grain: false },
    background: { type: "blur", color: "#000000", blur: 40 },
  };
  for (const id of order) {
    const asset = assets.find((a) => a.id === id);
    if (asset) project = appendAsset(project, asset);
  }
  return project;
};
