/**
 * Text templates ("Matn shablonlari"): a base style id understood by TextLayer plus overrides.
 * The six legacy ids (title, caption, lower-third, pop, typewriter, neon) keep working.
 */
import type { TextClip } from "../types";

export type TextTemplateGroup = "basic" | "social" | "title" | "caption" | "creative";

export const TEXT_TEMPLATE_GROUPS: Record<TextTemplateGroup, string> = {
  basic: "Asosiy",
  title: "Sarlavha",
  social: "Ijtimoiy",
  caption: "Subtitr",
  creative: "Ijodiy",
};

export interface TextTemplate {
  label: string;
  group: TextTemplateGroup;
  sample: string;
  position: TextClip["position"];
  patch: Partial<TextClip>;
}

export const TEXT_TEMPLATES: Record<string, TextTemplate> = {
  plain: { label: "Oddiy matn", group: "basic", sample: "Matn", position: "center", patch: { font: "Inter", fontSize: 90, fontWeight: 700, color: "#ffffff" } },
  title: { label: "Sarlavha", group: "title", sample: "Katta sarlavha", position: "center", patch: {} },
  caption: { label: "Subtitr", group: "caption", sample: "Bu subtitr matni", position: "bottom", patch: { textLoop: "karaoke" } },
  "lower-third": { label: "Lower third", group: "basic", sample: "Ism Familiya", position: "bottom", patch: {} },
  pop: { label: "Pop", group: "social", sample: "WOW!", position: "center", patch: {} },
  typewriter: { label: "Yozuv mashinkasi", group: "creative", sample: "Harfma-harf...", position: "center", patch: {} },
  neon: { label: "Neon", group: "creative", sample: "NEON", position: "center", patch: {} },
  outline: {
    label: "Kontur",
    group: "basic",
    sample: "KONTUR",
    position: "center",
    patch: { font: "Anton", fontSize: 150, color: "transparent", strokeColor: "#ffffff", strokeWidth: 4, uppercase: true },
  },
  "boxed-white": {
    label: "Oq quti",
    group: "social",
    sample: "Bugungi maslahat",
    position: "center",
    patch: { font: "Poppins", fontSize: 72, fontWeight: 800, color: "#111111", bgColor: "#ffffff", bgOpacity: 1 },
  },
  "boxed-yellow": {
    label: "Sariq marker",
    group: "social",
    sample: "MUHIM!",
    position: "center",
    patch: { font: "Montserrat", fontSize: 84, fontWeight: 900, color: "#111111", bgColor: "#facc15", bgOpacity: 1, uppercase: true, textIn: "pop-words" },
  },
  "tiktok-caption": {
    label: "TikTok subtitr",
    group: "caption",
    sample: "shunaqa bo'ldi",
    position: "center",
    patch: { font: "Montserrat", fontSize: 76, fontWeight: 900, color: "#ffffff", strokeColor: "#000000", strokeWidth: 8, uppercase: true, textLoop: "highlight-word", highlightColor: "#22d3ee", textIn: "pop-words" },
  },
  "hormozi-caption": {
    label: "Podkast subtitr",
    group: "caption",
    sample: "BU JUDA MUHIM",
    position: "bottom",
    patch: { font: "Anton", fontSize: 96, color: "#ffffff", strokeColor: "#000000", strokeWidth: 10, uppercase: true, textLoop: "karaoke", highlightColor: "#a3e635", shadowColor: "#000000", shadowBlur: 0 },
  },
  "soft-caption": {
    label: "Yumshoq subtitr",
    group: "caption",
    sample: "Bu yerda gap boradi",
    position: "bottom",
    patch: { font: "Inter", fontSize: 54, fontWeight: 600, color: "#ffffff", bgColor: "#000000", bgOpacity: 0.55, textIn: "fade-chars" },
  },
  "movie-subtitle": {
    label: "Kino subtitri",
    group: "caption",
    sample: "Men seni kutgandim.",
    position: "bottom",
    patch: { font: "Noto Sans", fontSize: 50, fontWeight: 500, color: "#fde68a", shadowColor: "#000000", shadowBlur: 6 },
  },
  "subscribe": {
    label: "Obuna bo'ling",
    group: "social",
    sample: "OBUNA BO'LING 🔔",
    position: "bottom",
    patch: { font: "Rubik", fontSize: 70, fontWeight: 800, color: "#ffffff", bgColor: "#ef4444", bgOpacity: 1, uppercase: true, textIn: "pop-words", animCombo: { id: "combo:pulse", duration: 0 } },
  },
  "breaking-news": {
    label: "Tezkor xabar",
    group: "social",
    sample: "TEZKOR XABAR",
    position: "bottom",
    patch: { font: "Oswald", fontSize: 80, fontWeight: 700, color: "#ffffff", bgColor: "#b91c1c", bgOpacity: 1, uppercase: true, textIn: "wipe-text" },
  },
  "cinema-title": {
    label: "Kino titri",
    group: "title",
    sample: "TOSHKENT TUNLARI",
    position: "center",
    patch: { font: "Cinzel", fontSize: 120, fontWeight: 700, color: "#f5f5f4", letterSpacing: 18, uppercase: true, textIn: "spread", shadowColor: "#000000", shadowBlur: 30 },
  },
  "elegant-serif": {
    label: "Nafis serif",
    group: "title",
    sample: "Bir kunlik sayohat",
    position: "center",
    patch: { font: "Playfair Display", fontSize: 120, fontWeight: 700, italic: true, color: "#ffffff", textIn: "rise-lines", shadowColor: "#000000", shadowBlur: 24 },
  },
  "bold-impact": {
    label: "Kuchli",
    group: "title",
    sample: "ENG ZO'R LAHZA",
    position: "center",
    patch: { font: "Bebas Neue", fontSize: 200, color: "#ffffff", uppercase: true, textIn: "zoom-chars", shadowColor: "#000000", shadowBlur: 40 },
  },
  "handwritten": {
    label: "Qo'lyozma",
    group: "creative",
    sample: "Sevimli shahrim",
    position: "center",
    patch: { font: "Caveat", fontSize: 130, fontWeight: 700, color: "#ffffff", textIn: "typewriter", shadowColor: "#000000", shadowBlur: 12 },
  },
  "script-gold": {
    label: "Oltin yozuv",
    group: "creative",
    sample: "Tabriklaymiz",
    position: "center",
    patch: { font: "Great Vibes", fontSize: 150, color: "#fbbf24", shadowColor: "#78350f", shadowBlur: 20, textIn: "fade-chars", textLoop: "glow-pulse" },
  },
  "retro-arcade": {
    label: "Retro o'yin",
    group: "creative",
    sample: "LEVEL UP",
    position: "center",
    patch: { font: "Press Start 2P", fontSize: 70, color: "#facc15", strokeColor: "#7c2d12", strokeWidth: 6, textIn: "typewriter", textLoop: "flicker" },
  },
  "glitch-title": {
    label: "Glitch sarlavha",
    group: "creative",
    sample: "SIGNAL YO'Q",
    position: "center",
    patch: { font: "Rubik Glitch", fontSize: 140, color: "#ffffff", textIn: "glitch-in", textLoop: "jitter" },
  },
  "wave-fun": {
    label: "Quvnoq to'lqin",
    group: "social",
    sample: "Dam olish kuni!",
    position: "center",
    patch: { font: "Fredoka", fontSize: 110, fontWeight: 700, color: "#fde047", strokeColor: "#7c3aed", strokeWidth: 8, textIn: "bounce-chars", textLoop: "wave" },
  },
  rainbow: {
    label: "Kamalak",
    group: "creative",
    sample: "Rang-barang",
    position: "center",
    patch: { font: "Lilita One", fontSize: 130, color: "#ffffff", strokeColor: "#000000", strokeWidth: 6, textLoop: "rainbow", textIn: "pop-words" },
  },
  quote: {
    label: "Iqtibos",
    group: "basic",
    sample: "“Harakatda barakat”",
    position: "center",
    patch: { font: "Lora", fontSize: 80, italic: true, color: "#ffffff", bgColor: "#0f172a", bgOpacity: 0.6, textIn: "fade-chars" },
  },
  "minimal-label": {
    label: "Minimal yorliq",
    group: "basic",
    sample: "Toshkent · 2026",
    position: "top",
    patch: { font: "Space Grotesk", fontSize: 44, fontWeight: 500, color: "#ffffff", letterSpacing: 6, uppercase: true, textIn: "slide-words" },
  },
  "price-tag": {
    label: "Narx",
    group: "social",
    sample: "-50% CHEGIRMA",
    position: "center",
    patch: { font: "Archivo Black", fontSize: 110, color: "#ffffff", bgColor: "#16a34a", bgOpacity: 1, uppercase: true, textIn: "pop-words", animCombo: { id: "combo:heartbeat", duration: 0 } },
  },
};

/** Legacy map kept for the agent + older UI code. */
export const TEXT_STYLES: Record<string, { label: string; sample: string }> = Object.fromEntries(
  Object.entries(TEXT_TEMPLATES).map(([id, t]) => [id, { label: t.label, sample: t.sample }]),
);
