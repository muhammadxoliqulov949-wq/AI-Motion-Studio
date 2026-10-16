import type { Clip, Easing, Keyframe, KeyframeProp } from "./types";
import { round } from "./utils";

const ease = (p: number, easing: Easing) => {
  switch (easing) {
    case "linear":
      return p;
    case "ease-in":
      return p * p * p;
    case "ease-out":
      return 1 - Math.pow(1 - p, 3);
    case "hold":
      return 0;
    case "bounce": {
      const n = 7.5625;
      const d = 2.75;
      let x = p;
      if (x < 1 / d) return n * x * x;
      if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
      if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
      return n * (x -= 2.625 / d) * x + 0.984375;
    }
    default:
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }
};

/** Value of a keyframed property at `t` seconds into the clip (or `fallback` without keyframes). */
export const sampleKeyframes = (frames: Keyframe[] | undefined, t: number, fallback: number) => {
  if (!frames?.length) return fallback;
  if (t <= frames[0].t) return frames[0].value;
  const last = frames[frames.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return a.value + (b.value - a.value) * ease(p, a.easing);
    }
  }
  return fallback;
};

export const KEYFRAME_PROPS: { id: KeyframeProp; label: string; min: number; max: number; step: number; unit: string }[] = [
  { id: "x", label: "X pozitsiya", min: -100, max: 100, step: 0.5, unit: "%" },
  { id: "y", label: "Y pozitsiya", min: -100, max: 100, step: 0.5, unit: "%" },
  { id: "scale", label: "Masshtab", min: 0.1, max: 4, step: 0.01, unit: "x" },
  { id: "rotation", label: "Burilish", min: -360, max: 360, step: 1, unit: "°" },
  { id: "opacity", label: "Shaffoflik", min: 0, max: 1, step: 0.01, unit: "" },
  { id: "volume", label: "Ovoz", min: 0, max: 2, step: 0.01, unit: "" },
  { id: "focusX", label: "Kadr markazi (gorizontal)", min: 0, max: 1, step: 0.005, unit: "" },
];

/** Base (non-keyframed) value of a property on a clip. */
export const baseValue = (clip: Clip, prop: KeyframeProp): number => {
  const c = clip as unknown as Record<string, unknown>;
  const v = c[prop];
  if (typeof v === "number") return v;
  if (prop === "focusX") return 0.5;
  return prop === "scale" || prop === "opacity" || prop === "volume" ? 1 : 0;
};

export const valueAt = (clip: Clip, prop: KeyframeProp, t: number) => sampleKeyframes(clip.keyframes?.[prop], t, baseValue(clip, prop));

/** Adds or replaces a keyframe at `t` (seconds from clip start). */
export const setKeyframe = (clip: Clip, prop: KeyframeProp, t: number, value: number, easing: Easing = "ease"): Clip => {
  const time = round(Math.max(0, Math.min(clip.duration, t)), 3);
  const list = (clip.keyframes?.[prop] ?? []).filter((k) => Math.abs(k.t - time) > 0.02);
  const next = [...list, { t: time, value, easing }].sort((a, b) => a.t - b.t);
  return { ...clip, keyframes: { ...clip.keyframes, [prop]: next } } as Clip;
};

export const removeKeyframe = (clip: Clip, prop: KeyframeProp, t: number): Clip => {
  const list = (clip.keyframes?.[prop] ?? []).filter((k) => Math.abs(k.t - t) > 0.02);
  const keyframes = { ...clip.keyframes, [prop]: list };
  if (!list.length) delete keyframes[prop];
  return { ...clip, keyframes } as Clip;
};

export const keyframeAt = (clip: Clip, prop: KeyframeProp, t: number) =>
  clip.keyframes?.[prop]?.find((k) => Math.abs(k.t - t) <= 0.02);

/** All keyframe times on a clip (for timeline diamonds). */
export const keyframeTimes = (clip: Clip) => {
  const times = new Set<number>();
  for (const list of Object.values(clip.keyframes ?? {})) for (const k of list ?? []) times.add(k.t);
  return [...times].sort((a, b) => a - b);
};

/** Scales keyframe times after a speed / trim change so they stay inside the clip. */
export const shiftKeyframes = (clip: Clip, delta: number): Clip["keyframes"] => {
  if (!clip.keyframes) return undefined;
  const out: Clip["keyframes"] = {};
  for (const [prop, list] of Object.entries(clip.keyframes) as [KeyframeProp, Keyframe[]][]) {
    out[prop] = list.map((k) => ({ ...k, t: round(k.t - delta, 3) }));
  }
  return out;
};
