/**
 * Video effects (CapCut "Effects"): clips on an effect track that change everything below them
 * (camera shake, glitch, VHS…) and/or draw an overlay above (particles, light leaks, REC frame).
 */
import { seeded as random } from "./rand";

export type EffectGroup = "camera" | "light" | "retro" | "distort" | "particles" | "frame";

export const EFFECT_GROUPS: Record<EffectGroup, string> = {
  camera: "Kamera",
  light: "Yorug'lik",
  retro: "Retro",
  distort: "Buzilish",
  particles: "Zarrachalar",
  frame: "Ramka",
};

export interface EffectFootage {
  transform?: string;
  filter?: string;
  opacity?: number;
}

export interface EffectDef {
  label: string;
  group: EffectGroup;
  /** Icon emoji for the library grid. */
  icon: string;
  /** Style applied to the footage under the effect. t = seconds into the effect, k = intensity 0..1. */
  footage?: (t: number, duration: number, k: number, frame: number) => EffectFootage;
  /** Overlay renderer id (see composition/EffectLayer.tsx). */
  overlay?: string;
}

const flashAt = (t: number, at: number, len: number) => Math.max(0, 1 - Math.abs(t - at) / len);

export const EFFECTS: Record<string, EffectDef> = {
  shake: {
    label: "Kamera titrashi",
    group: "camera",
    icon: "📳",
    footage: (_t, _d, k, f) => ({ transform: `translate(${((random(`sx${f}`) - 0.5) * 3 * k).toFixed(2)}%, ${((random(`sy${f}`) - 0.5) * 3 * k).toFixed(2)}%) scale(${1 + 0.05 * k})` }),
  },
  earthquake: {
    label: "Zilzila",
    group: "camera",
    icon: "🌋",
    footage: (_t, _d, k, f) => ({ transform: `translate(${((random(`ex${f}`) - 0.5) * 8 * k).toFixed(2)}%, ${((random(`ey${f}`) - 0.5) * 6 * k).toFixed(2)}%) rotate(${((random(`er${f}`) - 0.5) * 4 * k).toFixed(2)}deg) scale(${1 + 0.12 * k})` }),
  },
  handheld: {
    label: "Qo'lda suratga olish",
    group: "camera",
    icon: "🎥",
    footage: (t, _d, k) => ({ transform: `translate(${(Math.sin(t * 1.7) * 1.2 * k).toFixed(2)}%, ${(Math.cos(t * 1.3) * 0.9 * k).toFixed(2)}%) rotate(${(Math.sin(t * 0.9) * 0.8 * k).toFixed(2)}deg) scale(${1 + 0.04 * k})` }),
  },
  "zoom-pulse": {
    label: "Ritm zoom",
    group: "camera",
    icon: "💓",
    footage: (t, _d, k) => {
      const beat = (t * 2) % 1;
      return { transform: `scale(${1 + Math.max(0, 1 - beat * 4) * 0.08 * k})` };
    },
  },
  "slow-zoom": {
    label: "Sekin yaqinlashish",
    group: "camera",
    icon: "🔍",
    footage: (t, d, k) => ({ transform: `scale(${1 + (t / Math.max(0.1, d)) * 0.25 * k})` }),
  },
  "spin-blur": {
    label: "Aylanma blur",
    group: "camera",
    icon: "🌀",
    footage: (t, d, k) => {
      const p = Math.sin((t / Math.max(0.1, d)) * Math.PI);
      return { transform: `rotate(${(p * 12 * k).toFixed(2)}deg) scale(${1 + p * 0.2 * k})`, filter: `blur(${(p * 6 * k).toFixed(2)}px)` };
    },
  },
  flash: {
    label: "Chaqnash",
    group: "light",
    icon: "⚡",
    footage: (t, _d, k) => ({ filter: `brightness(${(1 + flashAt(t, 0, 0.35) * 2.5 * k).toFixed(3)})` }),
    overlay: "flash",
  },
  strobe: {
    label: "Strob",
    group: "light",
    icon: "🔦",
    footage: (_t, _d, k, f) => ({ filter: `brightness(${Math.floor(f / 3) % 2 ? 1 : 1 + 1.6 * k})` }),
  },
  "light-leak": { label: "Yorug'lik oqishi", group: "light", icon: "🌅", overlay: "light-leak" },
  "film-burn": { label: "Plyonka kuyishi", group: "light", icon: "🔥", overlay: "film-burn", footage: (t, d, k) => ({ filter: `brightness(${(1 + Math.sin((t / Math.max(0.1, d)) * Math.PI) * 0.5 * k).toFixed(3)}) saturate(${1 + 0.4 * k})` }) },
  glow: { label: "Nur (bloom)", group: "light", icon: "✨", footage: (_t, _d, k) => ({ filter: `brightness(${1 + 0.15 * k}) saturate(${1 + 0.3 * k}) contrast(${1 - 0.08 * k})` }), overlay: "glow" },
  "lens-flare": { label: "Linza nuri", group: "light", icon: "☀️", overlay: "lens-flare" },
  vhs: {
    label: "VHS",
    group: "retro",
    icon: "📼",
    footage: (_t, _d, k, f) => ({ filter: `saturate(${1 + 0.5 * k}) contrast(${1 + 0.15 * k}) hue-rotate(${(Math.sin(f / 7) * 6 * k).toFixed(1)}deg)`, transform: random(`vhs${Math.floor(f / 4)}`) > 0.93 ? `translateX(${(1.5 * k).toFixed(2)}%)` : undefined }),
    overlay: "vhs",
  },
  "old-film": {
    label: "Eski kino",
    group: "retro",
    icon: "🎞️",
    footage: (_t, _d, k, f) => ({ filter: `sepia(${0.8 * k}) contrast(${1 + 0.2 * k}) brightness(${(1 - 0.1 * k + random(`of${f}`) * 0.12 * k).toFixed(3)})` }),
    overlay: "old-film",
  },
  scanlines: { label: "CRT chiziqlari", group: "retro", icon: "📺", overlay: "scanlines" },
  grain: { label: "Plyonka donasi", group: "retro", icon: "🌫️", overlay: "grain" },
  glitch: {
    label: "Glitch",
    group: "distort",
    icon: "👾",
    footage: (_t, _d, k, f) => {
      const on = random(`g${Math.floor(f / 2)}`) > 1 - 0.35 * k;
      return on ? { transform: `translateX(${((random(`gx${f}`) - 0.5) * 6 * k).toFixed(2)}%) skewX(${((random(`gs${f}`) - 0.5) * 8 * k).toFixed(2)}deg)`, filter: `hue-rotate(${(random(`gh${f}`) * 180).toFixed(0)}deg) saturate(2)` } : {};
    },
    overlay: "glitch",
  },
  "rgb-split": {
    label: "RGB ajralish",
    group: "distort",
    icon: "🌈",
    footage: (t, _d, k) => {
      const o = (3 + Math.sin(t * 6) * 3) * k;
      return { filter: `drop-shadow(${o.toFixed(1)}px 0 0 rgba(255,0,60,0.7)) drop-shadow(${(-o).toFixed(1)}px 0 0 rgba(0,220,255,0.7))` };
    },
  },
  defocus: { label: "Fokusdan chiqish", group: "distort", icon: "😵‍💫", footage: (t, d, k) => ({ filter: `blur(${(Math.sin((t / Math.max(0.1, d)) * Math.PI) * 14 * k).toFixed(2)}px)` }) },
  "black-white-flash": { label: "Qora-oq chaqnash", group: "distort", icon: "🖤", footage: (_t, _d, _k, f) => ({ filter: Math.floor(f / 4) % 2 ? "grayscale(1) contrast(1.4)" : "" }) },
  invert: { label: "Negativ urish", group: "distort", icon: "🔄", footage: (t, _d, k) => ({ filter: `invert(${(flashAt(t, 0.15, 0.3) * k).toFixed(3)})` }) },
  snow: { label: "Qor", group: "particles", icon: "❄️", overlay: "snow" },
  rain: { label: "Yomg'ir", group: "particles", icon: "🌧️", overlay: "rain" },
  confetti: { label: "Konfetti", group: "particles", icon: "🎉", overlay: "confetti" },
  sparkles: { label: "Uchqunlar", group: "particles", icon: "💫", overlay: "sparkles" },
  hearts: { label: "Yuraklar", group: "particles", icon: "💖", overlay: "hearts" },
  bubbles: { label: "Pufakchalar", group: "particles", icon: "🫧", overlay: "bubbles" },
  stars: { label: "Yulduzlar", group: "particles", icon: "⭐", overlay: "stars" },
  "letterbox-in": { label: "Kino ramkasi", group: "frame", icon: "🎬", overlay: "letterbox-in" },
  "fade-black": { label: "Qorayish", group: "frame", icon: "⬛", overlay: "fade-black" },
  "fade-white": { label: "Oqarish", group: "frame", icon: "⬜", overlay: "fade-white" },
  "vignette-pulse": { label: "Vinyetka pulsi", group: "frame", icon: "⭕", overlay: "vignette-pulse" },
  rec: { label: "REC kamera", group: "frame", icon: "🔴", overlay: "rec" },
  countdown: { label: "Ortga sanash 3-2-1", group: "frame", icon: "⏱️", overlay: "countdown" },
};

export const EFFECT_IDS = Object.keys(EFFECTS);
