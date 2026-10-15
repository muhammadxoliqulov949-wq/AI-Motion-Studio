import type { AspectRatio, MotionId } from "./types";

export { FILTERS, FILTER_PRESETS, FILTER_GROUPS, filterCss, adjustCss, DEFAULT_ADJUST } from "./catalog/filters";
export { TRANSITIONS, TRANSITION_DEFS, TRANSITION_GROUPS, TRANSITION_IDS } from "./catalog/transitions";
export { TEXT_STYLES, TEXT_TEMPLATES, TEXT_TEMPLATE_GROUPS } from "./catalog/text-templates";

export const ASPECTS: Record<AspectRatio, { width: number; height: number; label: string }> = {
  "16:9": { width: 1920, height: 1080, label: "YouTube" },
  "9:16": { width: 1080, height: 1920, label: "Reels / TikTok / Shorts" },
  "1:1": { width: 1080, height: 1080, label: "Instagram post" },
  "4:5": { width: 1080, height: 1350, label: "Instagram portret" },
  "4:3": { width: 1440, height: 1080, label: "Klassik TV" },
  "21:9": { width: 2560, height: 1080, label: "Kinematografik" },
};

export const MOTIONS: Record<MotionId, { label: string }> = {
  none: { label: "Statik" },
  "ken-burns": { label: "Ken Burns" },
  "punch-in": { label: "Punch-in" },
  shake: { label: "Kamera titrashi" },
  drift: { label: "Drift" },
};

export const SPEED_CURVES = {
  none: { label: "Oddiy", points: [1, 1, 1, 1, 1] },
  montage: { label: "Montaj", points: [1.6, 0.5, 1.6, 0.5, 1.6] },
  hero: { label: "Qahramon", points: [1.5, 1.5, 0.3, 1.5, 1.5] },
  bullet: { label: "O'q", points: [2, 0.25, 0.25, 0.25, 2] },
  "jump-cut": { label: "Jump cut", points: [1, 3, 0.5, 3, 1] },
  "flash-in": { label: "Flash in", points: [3, 2, 1, 0.6, 0.6] },
  "flash-out": { label: "Flash out", points: [0.6, 0.6, 1, 2, 3] },
} as const;

export const BLEND_MODES: Record<string, string> = {
  normal: "Oddiy",
  screen: "Screen",
  multiply: "Multiply",
  overlay: "Overlay",
  lighten: "Lighten",
  darken: "Darken",
  "color-dodge": "Color dodge",
  difference: "Difference",
  "soft-light": "Soft light",
  "hard-light": "Hard light",
};
