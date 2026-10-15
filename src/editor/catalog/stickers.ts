/**
 * Stickers: 400+ animated Noto emoji (Lottie, CC BY 4.0, Google) — catalogue taken from
 * @remotion/animated-emoji (emoji.json) — plus vector shapes/labels drawn in code.
 */
import emojiData from "./emoji.json";

export const NOTO_LICENSE = "Noto Animated Emoji — Google, CC BY 4.0";

export const emojiLottieUrl = (codepoint: string) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint}/lottie.json`;

const CATEGORY_LABELS: Record<string, string> = {
  "Smileys and emotions": "Smayllar",
  People: "Odamlar",
  "Animals and nature": "Tabiat",
  "Food and drink": "Taom",
  "Travel and places": "Sayohat",
  "Activities and events": "Bayram",
  Objects: "Buyumlar",
  Symbols: "Belgilar",
  Flags: "Bayroqlar",
};

export interface EmojiSticker {
  name: string;
  codepoint: string;
  char: string;
  category: string;
  duration: number;
}

const toChar = (codepoint: string) => {
  try {
    return String.fromCodePoint(...codepoint.split("_").map((c) => parseInt(c, 16)));
  } catch {
    return "❓";
  }
};

export const EMOJI_STICKERS: EmojiSticker[] = (emojiData as { n: string; c: string; k: string; d: number }[]).map((e) => ({
  name: e.n,
  codepoint: e.c,
  char: toChar(e.c),
  category: CATEGORY_LABELS[e.k] ?? e.k,
  duration: e.d,
}));

export const EMOJI_CATEGORIES = [...new Set(EMOJI_STICKERS.map((e) => e.category))];

export const emojiByName = (name: string) => EMOJI_STICKERS.find((e) => e.name === name);

export interface ShapeSticker {
  id: string;
  label: string;
  /** SVG markup with `currentColor` (viewBox 0 0 100 100). */
  svg: string;
  defaultColor: string;
}

export const SHAPE_STICKERS: ShapeSticker[] = [
  { id: "arrow-right", label: "Strelka", defaultColor: "#facc15", svg: '<path d="M8 42h58V22l28 28-28 28V58H8z" fill="currentColor" stroke="#000" stroke-width="4" stroke-linejoin="round"/>' },
  { id: "arrow-curved", label: "Egri strelka", defaultColor: "#f43f5e", svg: '<path d="M15 80C20 40 45 25 72 28" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><path d="M62 12l22 16-24 12" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: "circle-ring", label: "Halqa", defaultColor: "#ef4444", svg: '<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="7"/>' },
  { id: "star", label: "Yulduz", defaultColor: "#facc15", svg: '<path d="M50 6l13 28 30 3-23 20 7 30-27-16-27 16 7-30L7 37l30-3z" fill="currentColor"/>' },
  { id: "heart", label: "Yurak", defaultColor: "#f43f5e", svg: '<path d="M50 88S8 62 8 34c0-14 11-24 24-24 8 0 14 4 18 10 4-6 10-10 18-10 13 0 24 10 24 24 0 28-42 54-42 54z" fill="currentColor"/>' },
  { id: "speech", label: "Gap pufagi", defaultColor: "#ffffff", svg: '<path d="M10 14h80v52H42L22 86V66H10z" fill="currentColor" stroke="#000" stroke-width="4" stroke-linejoin="round"/>' },
  { id: "burst", label: "Portlash", defaultColor: "#facc15", svg: '<path d="M50 4l9 20 21-10-5 22 22 6-19 13 13 18-23-1-2 22-16-15-16 15-2-22-23 1 13-18L3 42l22-6-5-22 21 10z" fill="currentColor" stroke="#000" stroke-width="3"/>' },
  { id: "check", label: "Belgi", defaultColor: "#22c55e", svg: '<circle cx="50" cy="50" r="44" fill="currentColor"/><path d="M28 52l15 15 30-32" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: "cross", label: "Xoch", defaultColor: "#ef4444", svg: '<circle cx="50" cy="50" r="44" fill="currentColor"/><path d="M32 32l36 36M68 32L32 68" stroke="#fff" stroke-width="10" stroke-linecap="round"/>' },
  { id: "subscribe", label: "Obuna tugmasi", defaultColor: "#ef4444", svg: '<rect x="4" y="30" width="92" height="40" rx="10" fill="currentColor"/><text x="50" y="57" font-size="17" font-family="Arial, sans-serif" font-weight="700" fill="#fff" text-anchor="middle">OBUNA</text>' },
  { id: "like", label: "Layk", defaultColor: "#3b82f6", svg: '<circle cx="50" cy="50" r="44" fill="currentColor"/><path d="M30 48h10v26H30zM44 74V48l12-20c4 0 7 3 6 8l-3 10h14c4 0 6 4 5 7l-5 17c-1 3-3 4-6 4z" fill="#fff"/>' },
  { id: "bell", label: "Qo'ng'iroqcha", defaultColor: "#facc15", svg: '<path d="M50 10c-16 0-26 12-26 28v18L14 70h72L76 56V38c0-16-10-28-26-28z" fill="currentColor" stroke="#000" stroke-width="3"/><circle cx="50" cy="80" r="8" fill="currentColor" stroke="#000" stroke-width="3"/>' },
  { id: "location", label: "Joylashuv", defaultColor: "#ef4444", svg: '<path d="M50 94S16 58 16 36a34 34 0 0168 0c0 22-34 58-34 58z" fill="currentColor"/><circle cx="50" cy="36" r="13" fill="#fff"/>' },
  { id: "underline", label: "Chizish", defaultColor: "#facc15", svg: '<path d="M6 60c25-8 60-10 88-4" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>' },
  { id: "sparkle", label: "Yaltiroq", defaultColor: "#ffffff", svg: '<path d="M50 4c4 26 20 42 46 46-26 4-42 20-46 46-4-26-20-42-46-46 26-4 42-20 46-46z" fill="currentColor"/>' },
  { id: "rec-dot", label: "REC", defaultColor: "#ef4444", svg: '<circle cx="22" cy="50" r="14" fill="currentColor"/><text x="42" y="60" font-size="28" font-family="Arial, sans-serif" font-weight="700" fill="#fff">REC</text>' },
  { id: "frame-corners", label: "Kadr burchaklari", defaultColor: "#ffffff", svg: '<path d="M6 26V6h20M74 6h20v20M94 74v20H74M26 94H6V74" fill="none" stroke="currentColor" stroke-width="5"/>' },
  { id: "badge-new", label: "YANGI", defaultColor: "#22c55e", svg: '<path d="M50 4l10 9 13-3 3 13 12 6-5 12 5 12-12 6-3 13-13-3-10 9-10-9-13 3-3-13-12-6 5-12-5-12 12-6 3-13 13 3z" fill="currentColor"/><text x="50" y="58" font-size="20" font-family="Arial, sans-serif" font-weight="800" fill="#fff" text-anchor="middle">YANGI</text>' },
];

export const shapeById = (id: string) => SHAPE_STICKERS.find((s) => s.id === id);
