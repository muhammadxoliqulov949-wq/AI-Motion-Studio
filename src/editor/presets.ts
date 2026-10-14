import type {
  AspectRatio,
  FilterId,
  MotionId,
  TextStyleId,
  TransitionId,
} from "./types";

export const ASPECTS: Record<AspectRatio, { width: number; height: number; label: string }> = {
  "16:9": { width: 1920, height: 1080, label: "YouTube" },
  "9:16": { width: 1080, height: 1920, label: "Reels / TikTok" },
  "1:1": { width: 1080, height: 1080, label: "Instagram" },
};

export const FILTERS: Record<FilterId, { label: string; css: string; swatch: string }> = {
  none: { label: "Asl", css: "none", swatch: "linear-gradient(135deg,#555,#999)" },
  cinematic: {
    label: "Sinematik",
    css: "contrast(1.12) saturate(1.1) brightness(0.95) sepia(0.12)",
    swatch: "linear-gradient(135deg,#1d2b3a,#c98b4b)",
  },
  "teal-orange": {
    label: "Teal & Orange",
    css: "contrast(1.15) saturate(1.3) hue-rotate(-8deg)",
    swatch: "linear-gradient(135deg,#0f766e,#f97316)",
  },
  vintage: {
    label: "Vintaj",
    css: "sepia(0.45) contrast(0.95) saturate(0.85) brightness(1.05)",
    swatch: "linear-gradient(135deg,#7c5c3b,#e8c99b)",
  },
  mono: { label: "Qora-oq", css: "grayscale(1) contrast(1.2)", swatch: "linear-gradient(135deg,#111,#ddd)" },
  vivid: {
    label: "Yorqin",
    css: "saturate(1.6) contrast(1.08) brightness(1.04)",
    swatch: "linear-gradient(135deg,#db2777,#facc15)",
  },
  cool: {
    label: "Sovuq",
    css: "saturate(0.9) hue-rotate(15deg) brightness(1.02)",
    swatch: "linear-gradient(135deg,#1e3a8a,#67e8f9)",
  },
  warm: {
    label: "Iliq",
    css: "sepia(0.25) saturate(1.25) brightness(1.03)",
    swatch: "linear-gradient(135deg,#b45309,#fde68a)",
  },
  fade: {
    label: "Matte",
    css: "contrast(0.85) brightness(1.1) saturate(0.8)",
    swatch: "linear-gradient(135deg,#6b7280,#e5e7eb)",
  },
};

export const TRANSITIONS: Record<TransitionId, { label: string }> = {
  none: { label: "Yo'q" },
  fade: { label: "Eriydi" },
  slide: { label: "Siljish" },
  zoom: { label: "Zoom" },
  blur: { label: "Blur" },
  wipe: { label: "Pardasi" },
};

export const MOTIONS: Record<MotionId, { label: string }> = {
  none: { label: "Statik" },
  "ken-burns": { label: "Ken Burns" },
  "punch-in": { label: "Punch-in" },
  shake: { label: "Kamera titrashi" },
  drift: { label: "Drift" },
};

export const TEXT_STYLES: Record<TextStyleId, { label: string; sample: string }> = {
  title: { label: "Sarlavha", sample: "Katta sarlavha" },
  caption: { label: "Subtitr", sample: "Bu subtitr matni" },
  "lower-third": { label: "Lower third", sample: "Ism Familiya" },
  pop: { label: "Pop", sample: "WOW!" },
  typewriter: { label: "Yozuv mashinkasi", sample: "Harfma-harf..." },
  neon: { label: "Neon", sample: "NEON" },
};
