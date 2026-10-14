import type {
  Clip,
  MediaAsset,
  MediaClip,
  Project,
  TextClip,
  Track,
  TrackKind,
} from "./types";
import { clipEnd, round, uid } from "./utils";

export const DEFAULT_TRACKS: Track[] = [
  { id: "T1", kind: "text", name: "Matn", muted: false, hidden: false, locked: false },
  { id: "T2", kind: "text", name: "Subtitr", muted: false, hidden: false, locked: false },
  { id: "V2", kind: "overlay", name: "Overlay", muted: false, hidden: false, locked: false },
  { id: "V1", kind: "video", name: "Video", muted: false, hidden: false, locked: false },
  { id: "A1", kind: "audio", name: "Musiqa", muted: false, hidden: false, locked: false },
];

export const trackForAsset = (asset: MediaAsset): TrackKind =>
  asset.kind === "audio" ? "audio" : "video";

export const sortClips = (clips: Clip[]) => [...clips].sort((a, b) => a.start - b.start);

export const clipsOnTrack = (project: Project, trackId: string) =>
  sortClips(project.clips.filter((c) => c.trackId === trackId));

export const trackEnd = (project: Project, trackId: string) =>
  project.clips.filter((c) => c.trackId === trackId).reduce((m, c) => Math.max(m, clipEnd(c)), 0);

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
  volume: asset.kind === "audio" ? 0.8 : 1,
  filter: "none",
  motion: "none",
  opacity: 1,
  scale: 1,
  transitionIn: "none",
  transitionDuration: 0.5,
  ...patch,
});

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
  ...patch,
});

export const appendAsset = (project: Project, asset: MediaAsset, at?: number): Project => {
  const trackId = asset.kind === "audio" ? "A1" : "V1";
  const start = at ?? trackEnd(project, trackId);
  return { ...project, clips: [...project.clips, makeMediaClip(asset, trackId, start)] };
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

export const splitClip = (project: Project, id: string, time: number): Project => {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip || time <= clip.start + 0.05 || time >= clipEnd(clip) - 0.05) return project;
  const leftDuration = round(time - clip.start, 3);
  const left = { ...clip, duration: leftDuration };
  const right: Clip =
    clip.type === "media"
      ? {
          ...clip,
          id: uid("clip"),
          start: time,
          duration: round(clip.duration - leftDuration, 3),
          in: round(clip.in + leftDuration * clip.speed, 3),
          transitionIn: "none",
        }
      : { ...clip, id: uid("text"), start: time, duration: round(clip.duration - leftDuration, 3) };
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

export const createInitialProject = (assets: MediaAsset[]): Project => {
  const order = ["asset_portrait", "asset_city", "asset_mountains", "asset_ocean"];
  let project: Project = {
    name: "Mening birinchi loyiham",
    aspect: "16:9",
    fps: 30,
    tracks: DEFAULT_TRACKS,
    clips: [],
    grade: { filter: "none", letterbox: false, vignette: false, grain: false },
  };
  for (const id of order) {
    const asset = assets.find((a) => a.id === id);
    if (asset) project = appendAsset(project, asset);
  }
  return project;
};
