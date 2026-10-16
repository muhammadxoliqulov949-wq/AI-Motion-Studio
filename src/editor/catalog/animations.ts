/**
 * Clip animations (In / Out / Combo, like CapCut's "Animation" tab) and text animations that
 * work per character or per word (typewriter, pop, karaoke…).
 */

export interface AnimState {
  opacity: number;
  x: number; // % of the frame
  y: number;
  scale: number;
  scaleX: number;
  rotate: number;
  rotateY: number;
  blur: number; // px at 1080p
}

export const IDENTITY: AnimState = { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, rotate: 0, rotateY: 0, blur: 0 };

type Fn = (p: number) => Partial<AnimState>;

export type AnimKind = "in" | "out" | "combo";

export interface ClipAnimDef {
  label: string;
  kind: AnimKind;
  fn: Fn;
  defaultDuration: number;
}

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
const bounce = (p: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
};

/** In-animation shapes; Out-animations reuse them mirrored in time. */
const IN: Record<string, [string, Fn]> = {
  fade: ["Paydo bo'lish", (p) => ({ opacity: p })],
  "zoom-in": ["Kattalashib kirish", (p) => ({ opacity: p, scale: 0.5 + 0.5 * easeOut(p) })],
  "zoom-out": ["Kichrayib kirish", (p) => ({ opacity: p, scale: 1.6 - 0.6 * easeOut(p) })],
  "slide-left": ["O'ngdan kirish", (p) => ({ x: (1 - easeOut(p)) * 100 })],
  "slide-right": ["Chapdan kirish", (p) => ({ x: (easeOut(p) - 1) * 100 })],
  "slide-up": ["Pastdan kirish", (p) => ({ y: (1 - easeOut(p)) * 100, opacity: p })],
  "slide-down": ["Tepadan kirish", (p) => ({ y: (easeOut(p) - 1) * 100, opacity: p })],
  "rotate-in": ["Burilib kirish", (p) => ({ opacity: p, rotate: (1 - easeOut(p)) * -90 })],
  "spin-in": ["Aylanib kirish", (p) => ({ opacity: p, rotate: (1 - easeOut(p)) * 360, scale: 0.3 + 0.7 * easeOut(p) })],
  "pop-in": ["Pop", (p) => ({ scale: Math.max(0, easeOutBack(p)), opacity: Math.min(1, p * 3) })],
  "bounce-in": ["Sakrab kirish", (p) => ({ y: (1 - bounce(p)) * -60, opacity: Math.min(1, p * 4) })],
  "blur-in": ["Blurdan chiqish", (p) => ({ opacity: p, blur: (1 - p) * 40 })],
  "flip-in": ["Ag'darilib kirish", (p) => ({ rotateY: (1 - easeOut(p)) * 90, opacity: p })],
  "stretch-in": ["Cho'zilib kirish", (p) => ({ scaleX: easeOutBack(p), opacity: Math.min(1, p * 3) })],
  "drop-in": ["Tushib kelish", (p) => ({ y: (1 - bounce(p)) * -120 })],
  "swing-in": ["Tebranib kirish", (p) => ({ rotate: Math.sin((1 - p) * Math.PI * 3) * 25 * (1 - p), opacity: Math.min(1, p * 3) })],
  "shake-in": ["Titrab kirish", (p) => ({ x: Math.sin(p * Math.PI * 10) * 4 * (1 - p), opacity: Math.min(1, p * 3) })],
  "rise-in": ["Ko'tarilish", (p) => ({ y: (1 - easeOut(p)) * 25, opacity: p, blur: (1 - p) * 10 })],
};

const COMBO: Record<string, [string, Fn]> = {
  pulse: ["Puls", (p) => ({ scale: 1 + Math.sin(p * Math.PI * 8) * 0.05 })],
  wobble: ["Chayqalish", (p) => ({ rotate: Math.sin(p * Math.PI * 6) * 6 })],
  swing: ["Mayatnik", (p) => ({ rotate: Math.sin(p * Math.PI * 4) * 12 })],
  shake: ["Titrash", (p) => ({ x: Math.sin(p * 220) * 1.2, y: Math.cos(p * 170) * 1.2 })],
  float: ["Suzish", (p) => ({ y: Math.sin(p * Math.PI * 4) * 3 })],
  "rotate-slow": ["Sekin aylanish", (p) => ({ rotate: p * 360 })],
  breathe: ["Nafas", (p) => ({ scale: 1 + Math.sin(p * Math.PI * 2) * 0.08 })],
  heartbeat: ["Yurak urishi", (p) => {
    const t = (p * 6) % 1;
    return { scale: 1 + (t < 0.15 ? Math.sin((t / 0.15) * Math.PI) * 0.12 : t < 0.3 ? Math.sin(((t - 0.15) / 0.15) * Math.PI) * 0.08 : 0) };
  }],
  jelly: ["Jele", (p) => ({ scaleX: 1 + Math.sin(p * Math.PI * 10) * 0.06, scale: 1 - Math.sin(p * Math.PI * 10) * 0.03 })],
  flicker: ["Lipillash", (p) => ({ opacity: Math.sin(p * 90) > -0.6 ? 1 : 0.35 })],
  "zoom-slow": ["Sekin zoom", (p) => ({ scale: 1 + p * 0.2 })],
  "spin-3d": ["3D aylanish", (p) => ({ rotateY: p * 360 })],
};

export const CLIP_ANIMATIONS: Record<string, ClipAnimDef> = {
  ...Object.fromEntries(Object.entries(IN).map(([id, [label, fn]]) => [`in:${id}`, { label, kind: "in" as const, fn, defaultDuration: 0.6 }])),
  ...Object.fromEntries(
    Object.entries(IN).map(([id, [label, fn]]) => [
      `out:${id}`,
      { label: label.replace("kirish", "chiqish").replace("Paydo bo'lish", "Yo'qolish").replace("Pop", "Pop chiqish"), kind: "out" as const, fn: (p: number) => fn(1 - p), defaultDuration: 0.6 },
    ]),
  ),
  ...Object.fromEntries(Object.entries(COMBO).map(([id, [label, fn]]) => [`combo:${id}`, { label, kind: "combo" as const, fn, defaultDuration: 0 }])),
};

export const animationsOfKind = (kind: AnimKind) =>
  Object.entries(CLIP_ANIMATIONS)
    .filter(([, a]) => a.kind === kind)
    .map(([id, a]) => ({ id, ...a }));

/** Combines clip In/Out/Combo animations at `t` seconds into a clip of `duration` seconds. */
export const clipAnimState = (
  t: number,
  duration: number,
  anims: { animIn?: { id: string; duration: number }; animOut?: { id: string; duration: number }; animCombo?: { id: string; duration: number } },
): AnimState => {
  const s: AnimState = { ...IDENTITY };
  const apply = (part: Partial<AnimState>) => {
    if (part.opacity !== undefined) s.opacity *= part.opacity;
    if (part.x !== undefined) s.x += part.x;
    if (part.y !== undefined) s.y += part.y;
    if (part.scale !== undefined) s.scale *= part.scale;
    if (part.scaleX !== undefined) s.scaleX *= part.scaleX;
    if (part.rotate !== undefined) s.rotate += part.rotate;
    if (part.rotateY !== undefined) s.rotateY += part.rotateY;
    if (part.blur !== undefined) s.blur += part.blur;
  };
  const { animIn, animOut, animCombo } = anims;
  if (animCombo && CLIP_ANIMATIONS[animCombo.id]) {
    const period = animCombo.duration > 0 ? animCombo.duration : duration;
    apply(CLIP_ANIMATIONS[animCombo.id].fn(((t % period) + period) % period / period));
  }
  if (animIn && CLIP_ANIMATIONS[animIn.id] && t < animIn.duration) apply(CLIP_ANIMATIONS[animIn.id].fn(Math.max(0, t / animIn.duration)));
  if (animOut && CLIP_ANIMATIONS[animOut.id]) {
    const from = duration - animOut.duration;
    if (t > from) apply(CLIP_ANIMATIONS[animOut.id].fn(Math.min(1, (t - from) / animOut.duration)));
  }
  return s;
};

export const animTransform = (s: AnimState) =>
  [
    s.x || s.y ? `translate(${s.x.toFixed(3)}%, ${s.y.toFixed(3)}%)` : "",
    s.rotateY ? `perspective(1600px) rotateY(${s.rotateY.toFixed(2)}deg)` : "",
    s.rotate ? `rotate(${s.rotate.toFixed(2)}deg)` : "",
    s.scale !== 1 ? `scale(${s.scale.toFixed(4)})` : "",
    s.scaleX !== 1 ? `scaleX(${s.scaleX.toFixed(4)})` : "",
  ]
    .filter(Boolean)
    .join(" ");

// ---------- Text animations ----------

export type TextAnimKind = "in" | "out" | "loop";

export interface TextAnimDef {
  label: string;
  kind: TextAnimKind;
  /** Split unit. */
  unit: "char" | "word" | "line";
}

export const TEXT_ANIMATIONS: Record<string, TextAnimDef> = {
  typewriter: { label: "Yozuv mashinkasi", kind: "in", unit: "char" },
  "fade-chars": { label: "Harfma-harf paydo", kind: "in", unit: "char" },
  "pop-words": { label: "So'zlar pop", kind: "in", unit: "word" },
  "bounce-chars": { label: "Sakrovchi harflar", kind: "in", unit: "char" },
  "slide-words": { label: "So'zlar ko'tariladi", kind: "in", unit: "word" },
  "blur-chars": { label: "Blurdan harflar", kind: "in", unit: "char" },
  "zoom-chars": { label: "Zoom harflar", kind: "in", unit: "char" },
  "drop-chars": { label: "Tushuvchi harflar", kind: "in", unit: "char" },
  "flip-chars": { label: "Ag'dariluvchi harflar", kind: "in", unit: "char" },
  "glitch-in": { label: "Glitch kirish", kind: "in", unit: "char" },
  spread: { label: "Yoyilish", kind: "in", unit: "line" },
  "wipe-text": { label: "Parda bilan ochilish", kind: "in", unit: "line" },
  "rise-lines": { label: "Qatorlar ko'tariladi", kind: "in", unit: "word" },
  "fade-out-chars": { label: "Harfma-harf yo'qolish", kind: "out", unit: "char" },
  "slide-out-words": { label: "So'zlar tushib ketadi", kind: "out", unit: "word" },
  "blur-out": { label: "Blurga ketish", kind: "out", unit: "line" },
  "zoom-out-chars": { label: "Harflar kichrayadi", kind: "out", unit: "char" },
  erase: { label: "O'chirib yozish", kind: "out", unit: "char" },
  karaoke: { label: "Karaoke (so'z rangi)", kind: "loop", unit: "word" },
  "highlight-word": { label: "Faol so'z kattalashadi", kind: "loop", unit: "word" },
  wave: { label: "To'lqin", kind: "loop", unit: "char" },
  flicker: { label: "Lipillash", kind: "loop", unit: "line" },
  "shake-text": { label: "Titroq", kind: "loop", unit: "char" },
  rainbow: { label: "Kamalak", kind: "loop", unit: "char" },
  "glow-pulse": { label: "Nur pulsi", kind: "loop", unit: "line" },
  jitter: { label: "Jitter", kind: "loop", unit: "char" },
};

export const textAnimsOfKind = (kind: TextAnimKind) =>
  Object.entries(TEXT_ANIMATIONS)
    .filter(([, a]) => a.kind === kind)
    .map(([id, a]) => ({ id, ...a }));
