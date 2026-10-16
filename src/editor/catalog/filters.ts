/**
 * Colour presets ("filters" in CapCut). Each preset is a set of CSS filter amounts so it can be
 * blended with the original by an intensity (0..1) and stacked with manual adjustments.
 */
import type { Adjustments } from "../types";

export interface FilterParams {
  brightness?: number; // multiplier, 1 = none
  contrast?: number;
  saturate?: number;
  sepia?: number; // 0..1
  grayscale?: number;
  hue?: number; // deg
  invert?: number;
}

export type FilterGroup = "basic" | "cinematic" | "vintage" | "mood" | "bw" | "creative";

export interface FilterPreset {
  label: string;
  group: FilterGroup;
  params: FilterParams;
  swatch: string;
}

export const FILTER_GROUPS: Record<FilterGroup, string> = {
  basic: "Asosiy",
  cinematic: "Kino",
  vintage: "Retro",
  mood: "Kayfiyat",
  bw: "Qora-oq",
  creative: "Ijodiy",
};

const g = (a: string, b: string) => `linear-gradient(135deg,${a},${b})`;

export const FILTER_PRESETS: Record<string, FilterPreset> = {
  none: { label: "Asl", group: "basic", params: {}, swatch: g("#555", "#999") },
  vivid: { label: "Yorqin", group: "basic", params: { saturate: 1.6, contrast: 1.08, brightness: 1.04 }, swatch: g("#db2777", "#facc15") },
  fresh: { label: "Fresh", group: "basic", params: { saturate: 1.25, brightness: 1.08, hue: -6 }, swatch: g("#22c55e", "#a7f3d0") },
  clear: { label: "Tiniq", group: "basic", params: { contrast: 1.15, saturate: 1.1 }, swatch: g("#0ea5e9", "#e0f2fe") },
  soft: { label: "Yumshoq", group: "basic", params: { contrast: 0.9, brightness: 1.06, saturate: 0.95 }, swatch: g("#fbcfe8", "#fef3c7") },
  bright: { label: "Nurli", group: "basic", params: { brightness: 1.15, contrast: 0.95 }, swatch: g("#fde68a", "#fff") },
  warm: { label: "Iliq", group: "basic", params: { sepia: 0.25, saturate: 1.25, brightness: 1.03 }, swatch: g("#b45309", "#fde68a") },
  cool: { label: "Sovuq", group: "basic", params: { saturate: 0.9, hue: 15, brightness: 1.02 }, swatch: g("#1e3a8a", "#67e8f9") },
  cinematic: { label: "Sinematik", group: "cinematic", params: { contrast: 1.12, saturate: 1.1, brightness: 0.95, sepia: 0.12 }, swatch: g("#1d2b3a", "#c98b4b") },
  "teal-orange": { label: "Teal & Orange", group: "cinematic", params: { contrast: 1.15, saturate: 1.3, hue: -8 }, swatch: g("#0f766e", "#f97316") },
  blockbuster: { label: "Blokbaster", group: "cinematic", params: { contrast: 1.25, saturate: 1.15, brightness: 0.92, hue: -10 }, swatch: g("#083344", "#fb923c") },
  noir: { label: "Noir", group: "cinematic", params: { grayscale: 1, contrast: 1.45, brightness: 0.9 }, swatch: g("#000", "#777") },
  moody: { label: "Moody", group: "cinematic", params: { contrast: 1.1, saturate: 0.75, brightness: 0.88 }, swatch: g("#1f2937", "#64748b") },
  "matrix-green": { label: "Matrix", group: "cinematic", params: { hue: 75, saturate: 0.9, contrast: 1.15, brightness: 0.9 }, swatch: g("#052e16", "#4ade80") },
  "desert-heat": { label: "Sahro", group: "cinematic", params: { sepia: 0.45, saturate: 1.4, contrast: 1.1 }, swatch: g("#92400e", "#fcd34d") },
  "night-blue": { label: "Tungi ko'k", group: "cinematic", params: { hue: 20, saturate: 0.8, brightness: 0.85, contrast: 1.1 }, swatch: g("#0c1445", "#3b82f6") },
  vintage: { label: "Vintaj", group: "vintage", params: { sepia: 0.45, contrast: 0.95, saturate: 0.85, brightness: 1.05 }, swatch: g("#7c5c3b", "#e8c99b") },
  retro70: { label: "70-lar", group: "vintage", params: { sepia: 0.35, saturate: 1.35, hue: -12, contrast: 0.9 }, swatch: g("#c2410c", "#facc15") },
  polaroid: { label: "Polaroid", group: "vintage", params: { sepia: 0.2, contrast: 0.88, brightness: 1.1, saturate: 0.9 }, swatch: g("#d6d3d1", "#fde68a") },
  kodak: { label: "Plyonka", group: "vintage", params: { sepia: 0.18, contrast: 1.08, saturate: 1.2, hue: -4 }, swatch: g("#a16207", "#fef08a") },
  fade: { label: "Matte", group: "vintage", params: { contrast: 0.85, brightness: 1.1, saturate: 0.8 }, swatch: g("#6b7280", "#e5e7eb") },
  vhs: { label: "VHS", group: "vintage", params: { saturate: 1.4, contrast: 1.2, hue: 8, brightness: 1.05 }, swatch: g("#7e22ce", "#22d3ee") },
  sepia: { label: "Sepiya", group: "vintage", params: { sepia: 0.9, contrast: 1.05 }, swatch: g("#78350f", "#fde68a") },
  golden: { label: "Oltin soat", group: "mood", params: { sepia: 0.35, saturate: 1.3, brightness: 1.06, hue: -8 }, swatch: g("#b45309", "#fbbf24") },
  dreamy: { label: "Orzu", group: "mood", params: { brightness: 1.12, contrast: 0.85, saturate: 1.1, hue: -15 }, swatch: g("#f0abfc", "#c4b5fd") },
  pastel: { label: "Pastel", group: "mood", params: { saturate: 0.7, brightness: 1.15, contrast: 0.85 }, swatch: g("#bae6fd", "#fbcfe8") },
  sunset: { label: "Quyosh botishi", group: "mood", params: { sepia: 0.3, saturate: 1.5, hue: -20, contrast: 1.05 }, swatch: g("#be123c", "#fb923c") },
  forest: { label: "O'rmon", group: "mood", params: { hue: 25, saturate: 1.2, brightness: 0.95 }, swatch: g("#14532d", "#86efac") },
  autumn: { label: "Kuz", group: "mood", params: { sepia: 0.4, saturate: 1.4, hue: -15 }, swatch: g("#9a3412", "#fdba74") },
  winter: { label: "Qish", group: "mood", params: { saturate: 0.6, brightness: 1.12, hue: 20 }, swatch: g("#e0f2fe", "#94a3b8") },
  food: { label: "Taom", group: "mood", params: { saturate: 1.35, brightness: 1.06, contrast: 1.05, sepia: 0.1 }, swatch: g("#dc2626", "#fbbf24") },
  mono: { label: "Qora-oq", group: "bw", params: { grayscale: 1, contrast: 1.2 }, swatch: g("#111", "#ddd") },
  "bw-soft": { label: "Yumshoq BW", group: "bw", params: { grayscale: 1, contrast: 0.9, brightness: 1.08 }, swatch: g("#444", "#eee") },
  "bw-high": { label: "Kontrast BW", group: "bw", params: { grayscale: 1, contrast: 1.7 }, swatch: g("#000", "#fff") },
  silver: { label: "Kumush", group: "bw", params: { grayscale: 0.85, contrast: 1.1, brightness: 1.05, hue: 10 }, swatch: g("#475569", "#e2e8f0") },
  cyberpunk: { label: "Kiberpank", group: "creative", params: { hue: -40, saturate: 1.8, contrast: 1.2 }, swatch: g("#db2777", "#06b6d4") },
  neon: { label: "Neon", group: "creative", params: { saturate: 2, contrast: 1.25, brightness: 1.05 }, swatch: g("#a21caf", "#22d3ee") },
  invert: { label: "Negativ", group: "creative", params: { invert: 1 }, swatch: g("#22d3ee", "#f43f5e") },
  thermal: { label: "Termal", group: "creative", params: { hue: 180, saturate: 2.2, contrast: 1.3 }, swatch: g("#1d4ed8", "#f97316") },
  "pop-art": { label: "Pop-art", group: "creative", params: { saturate: 2.6, contrast: 1.5 }, swatch: g("#facc15", "#ec4899") },
  lomo: { label: "Lomo", group: "creative", params: { contrast: 1.35, saturate: 1.4, brightness: 0.95 }, swatch: g("#0f172a", "#f59e0b") },
};

/** Backwards compatible map used across the app (label/swatch + full-intensity CSS). */
export const FILTERS: Record<string, { label: string; css: string; swatch: string }> = Object.fromEntries(
  Object.entries(FILTER_PRESETS).map(([id, f]) => [id, { label: f.label, swatch: f.swatch, css: filterCss(id, 1) }]),
);

export function filterCss(id: string | undefined, intensity = 1): string {
  const p = FILTER_PRESETS[id ?? "none"]?.params;
  if (!p || id === "none") return "";
  const k = Math.max(0, Math.min(1, intensity));
  const mixv = (v: number | undefined, neutral: number) => neutral + ((v ?? neutral) - neutral) * k;
  const parts: string[] = [];
  if (p.brightness !== undefined) parts.push(`brightness(${mixv(p.brightness, 1).toFixed(3)})`);
  if (p.contrast !== undefined) parts.push(`contrast(${mixv(p.contrast, 1).toFixed(3)})`);
  if (p.saturate !== undefined) parts.push(`saturate(${mixv(p.saturate, 1).toFixed(3)})`);
  if (p.sepia !== undefined) parts.push(`sepia(${mixv(p.sepia, 0).toFixed(3)})`);
  if (p.grayscale !== undefined) parts.push(`grayscale(${mixv(p.grayscale, 0).toFixed(3)})`);
  if (p.hue !== undefined) parts.push(`hue-rotate(${mixv(p.hue, 0).toFixed(1)}deg)`);
  if (p.invert !== undefined) parts.push(`invert(${mixv(p.invert, 0).toFixed(3)})`);
  return parts.join(" ");
}

export const DEFAULT_ADJUST: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  blur: 0,
  vignette: 0,
  sharpen: 0,
};

/** Manual adjustments → CSS filter string (temperature/tint approximated with sepia + hue). */
export function adjustCss(a: Partial<Adjustments> | undefined, unit = 1): string {
  if (!a) return "";
  const v = { ...DEFAULT_ADJUST, ...a };
  const parts: string[] = [];
  if (v.brightness) parts.push(`brightness(${(1 + v.brightness * 0.6).toFixed(3)})`);
  if (v.contrast || v.sharpen) parts.push(`contrast(${(1 + v.contrast * 0.6 + v.sharpen * 0.15).toFixed(3)})`);
  if (v.saturation) parts.push(`saturate(${Math.max(0, 1 + v.saturation).toFixed(3)})`);
  if (v.temperature > 0) parts.push(`sepia(${(v.temperature * 0.45).toFixed(3)})`, `saturate(${(1 + v.temperature * 0.3).toFixed(3)})`);
  if (v.temperature < 0) parts.push(`hue-rotate(${(v.temperature * -18).toFixed(1)}deg)`, `saturate(${(1 + v.temperature * 0.15).toFixed(3)})`);
  if (v.tint) parts.push(`hue-rotate(${(v.tint * 25).toFixed(1)}deg)`);
  if (v.hue) parts.push(`hue-rotate(${v.hue.toFixed(1)}deg)`);
  if (v.blur) parts.push(`blur(${(v.blur * unit).toFixed(2)}px)`);
  return parts.join(" ");
}
