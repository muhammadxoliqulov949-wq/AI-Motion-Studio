/**
 * "Popular" sticker pack: call-to-action animations drawn in code (our own artwork, no licence
 * needed) plus the most used animated Noto emoji (Lottie, CC BY 4.0).
 */

export interface MotionPreset {
  id: string;
  label: string;
  /** Preview glyph in the library grid. */
  icon: string;
  defaultColor: string;
  /** Width / height of the drawing. */
  aspect: number;
  duration: number;
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: "subscribe", label: "Obuna bo'ling", icon: "🔔", defaultColor: "#ef4444", aspect: 3.2, duration: 3.5 },
  { id: "like", label: "Like", icon: "👍", defaultColor: "#3b82f6", aspect: 1, duration: 2 },
  { id: "bell", label: "Qo'ng'iroqcha", icon: "🔔", defaultColor: "#facc15", aspect: 1, duration: 2.5 },
  { id: "arrow-down", label: "Strelka ↓", icon: "⬇️", defaultColor: "#facc15", aspect: 0.7, duration: 3 },
  { id: "arrow-right", label: "Strelka →", icon: "➡️", defaultColor: "#22d3ee", aspect: 1.4, duration: 3 },
  { id: "tap", label: "Bosing", icon: "👆", defaultColor: "#ffffff", aspect: 1, duration: 2.5 },
  { id: "swipe-up", label: "Yuqoriga suring", icon: "⏫", defaultColor: "#ffffff", aspect: 0.8, duration: 3 },
  { id: "hearts", label: "Yuraklar", icon: "💕", defaultColor: "#f43f5e", aspect: 0.8, duration: 3 },
];

export const motionPreset = (id: string) => MOTION_PRESETS.find((m) => m.id === id);

/** Animated Noto emoji that people reach for most (names from emoji.json). */
export const POPULAR_EMOJI = [
  "thumbs-up",
  "fire",
  "bell",
  "red-heart",
  "clap",
  "party-popper",
  "100",
  "rocket",
  "check-mark",
  "sparkles",
  "eyes",
  "star-struck",
  "mind-blown",
  "heart-eyes",
  "joy",
  "muscle",
  "raising-hands",
  "light-bulb",
  "money-face",
  "collision",
  "fireworks",
  "glowing-star",
  "alarm-clock",
  "camera-flash",
];
