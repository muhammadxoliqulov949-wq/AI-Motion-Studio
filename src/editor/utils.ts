import type { Clip, Project } from "./types";

let counter = 0;
export const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export const clipEnd = (clip: Clip) => clip.start + clip.duration;

export const projectDuration = (project: Project) =>
  project.clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0);

export const formatTime = (seconds: number, fps = 30) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const f = Math.floor((s % 1) * fps);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};

export const formatShort = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;
