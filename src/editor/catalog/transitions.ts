/**
 * Transitions between two adjacent clips. The incoming clip gets `enter(p)`, the outgoing clip
 * (kept alive underneath for the overlap) gets `exit(p)`; p goes 0 → 1 over the transition.
 */
import type React from "react";

type Style = React.CSSProperties;

export type TransitionGroup = "basic" | "slide" | "wipe" | "zoom" | "creative";

export interface TransitionDef {
  label: string;
  group: TransitionGroup;
  enter: (p: number) => Style;
  exit?: (p: number) => Style;
  /** Full-frame flash colour drawn above both clips (peaks at p = 0.5). */
  flash?: string;
}

export const TRANSITION_GROUPS: Record<TransitionGroup, string> = {
  basic: "Asosiy",
  slide: "Siljish",
  wipe: "Parda",
  zoom: "Zoom",
  creative: "Ijodiy",
};

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

export const TRANSITION_DEFS: Record<string, TransitionDef> = {
  none: { label: "Yo'q", group: "basic", enter: () => ({}) },
  fade: { label: "Eriydi", group: "basic", enter: (p) => ({ opacity: p }) },
  dissolve: { label: "Dissolve", group: "basic", enter: (p) => ({ opacity: p }), exit: (p) => ({ opacity: 1 - p * 0.5 }) },
  "dip-black": {
    label: "Qora orqali",
    group: "basic",
    enter: (p) => ({ opacity: Math.max(0, p * 2 - 1) }),
    exit: (p) => ({ filter: `brightness(${Math.max(0, 1 - p * 2)})` }),
  },
  "dip-white": { label: "Oq chaqnash", group: "basic", enter: (p) => ({ opacity: p }), flash: "#ffffff" },
  flash: { label: "Flash", group: "basic", enter: (p) => ({ opacity: p > 0.5 ? 1 : 0 }), flash: "#ffffff" },
  "slide-left": { label: "Chapga siljish", group: "slide", enter: (p) => ({ transform: `translateX(${pct(1 - p)})` }) },
  "slide-right": { label: "O'ngga siljish", group: "slide", enter: (p) => ({ transform: `translateX(${pct(p - 1)})` }) },
  "slide-up": { label: "Yuqoriga siljish", group: "slide", enter: (p) => ({ transform: `translateY(${pct(1 - p)})` }) },
  "slide-down": { label: "Pastga siljish", group: "slide", enter: (p) => ({ transform: `translateY(${pct(p - 1)})` }) },
  "push-left": {
    label: "Itarish chapga",
    group: "slide",
    enter: (p) => ({ transform: `translateX(${pct(1 - p)})` }),
    exit: (p) => ({ transform: `translateX(${pct(-p)})` }),
  },
  "push-right": {
    label: "Itarish o'ngga",
    group: "slide",
    enter: (p) => ({ transform: `translateX(${pct(p - 1)})` }),
    exit: (p) => ({ transform: `translateX(${pct(p)})` }),
  },
  "push-up": {
    label: "Itarish yuqoriga",
    group: "slide",
    enter: (p) => ({ transform: `translateY(${pct(1 - p)})` }),
    exit: (p) => ({ transform: `translateY(${pct(-p)})` }),
  },
  "push-down": {
    label: "Itarish pastga",
    group: "slide",
    enter: (p) => ({ transform: `translateY(${pct(p - 1)})` }),
    exit: (p) => ({ transform: `translateY(${pct(p)})` }),
  },
  "whip-pan": {
    label: "Whip pan",
    group: "slide",
    enter: (p) => ({ transform: `translateX(${pct(1 - p)})`, filter: `blur(${((1 - p) * 40).toFixed(1)}px)` }),
    exit: (p) => ({ transform: `translateX(${pct(-p)})`, filter: `blur(${(p * 40).toFixed(1)}px)` }),
  },
  slide: { label: "Siljish", group: "slide", enter: (p) => ({ transform: `translateX(${pct(1 - p)})` }) },
  wipe: { label: "Parda", group: "wipe", enter: (p) => ({ clipPath: `inset(0 ${pct(1 - p)} 0 0)` }) },
  "wipe-left": { label: "Parda chapga", group: "wipe", enter: (p) => ({ clipPath: `inset(0 0 0 ${pct(1 - p)})` }) },
  "wipe-up": { label: "Parda yuqoriga", group: "wipe", enter: (p) => ({ clipPath: `inset(${pct(1 - p)} 0 0 0)` }) },
  "wipe-down": { label: "Parda pastga", group: "wipe", enter: (p) => ({ clipPath: `inset(0 0 ${pct(1 - p)} 0)` }) },
  "barn-door": { label: "Darvoza", group: "wipe", enter: (p) => ({ clipPath: `inset(0 ${pct((1 - p) / 2)})` }) },
  "split-h": { label: "Gorizontal ochilish", group: "wipe", enter: (p) => ({ clipPath: `inset(${pct((1 - p) / 2)} 0)` }) },
  "circle-open": { label: "Doira ochilishi", group: "wipe", enter: (p) => ({ clipPath: `circle(${(p * 75).toFixed(2)}% at 50% 50%)` }) },
  diamond: {
    label: "Olmos",
    group: "wipe",
    enter: (p) => {
      const r = p * 100;
      return { clipPath: `polygon(50% ${50 - r}%, ${50 + r}% 50%, 50% ${50 + r}%, ${50 - r}% 50%)` };
    },
  },
  "soft-wipe": {
    label: "Yumshoq parda",
    group: "wipe",
    enter: (p) => {
      const edge = p * 130 - 15;
      const mask = `linear-gradient(90deg, #000 ${edge - 15}%, transparent ${edge + 15}%)`;
      return { maskImage: mask, WebkitMaskImage: mask };
    },
  },
  "clock-wipe": {
    label: "Soat",
    group: "wipe",
    enter: (p) => {
      const mask = `conic-gradient(#000 ${(p * 360).toFixed(1)}deg, transparent ${(p * 360 + 0.5).toFixed(1)}deg)`;
      return { maskImage: mask, WebkitMaskImage: mask };
    },
  },
  zoom: { label: "Zoom", group: "zoom", enter: (p) => ({ opacity: p, transform: `scale(${1.4 - 0.4 * p})` }) },
  "zoom-in": {
    label: "Zoom ichkariga",
    group: "zoom",
    enter: (p) => ({ opacity: p, transform: `scale(${0.6 + 0.4 * p})` }),
    exit: (p) => ({ transform: `scale(${1 + p * 0.6})`, opacity: 1 - p }),
  },
  "zoom-out": {
    label: "Zoom tashqariga",
    group: "zoom",
    enter: (p) => ({ opacity: p, transform: `scale(${1.6 - 0.6 * p})` }),
    exit: (p) => ({ transform: `scale(${1 - p * 0.4})` }),
  },
  "cross-zoom": {
    label: "Cross zoom",
    group: "zoom",
    enter: (p) => ({ opacity: p, transform: `scale(${2 - p})`, filter: `blur(${((1 - p) * 25).toFixed(1)}px)` }),
    exit: (p) => ({ transform: `scale(${1 + p})`, filter: `blur(${(p * 25).toFixed(1)}px)` }),
  },
  blur: { label: "Blur", group: "zoom", enter: (p) => ({ opacity: p, filter: `blur(${((1 - p) * 30).toFixed(1)}px)` }) },
  spin: {
    label: "Aylanish",
    group: "creative",
    enter: (p) => ({ opacity: p, transform: `rotate(${((1 - p) * -180).toFixed(1)}deg) scale(${0.4 + 0.6 * p})` }),
    exit: (p) => ({ transform: `rotate(${(p * 180).toFixed(1)}deg) scale(${1 - 0.6 * p})`, opacity: 1 - p }),
  },
  flip: {
    label: "Ag'darish",
    group: "creative",
    enter: (p) => ({ opacity: p > 0.5 ? 1 : 0, transform: `perspective(1600px) rotateY(${((1 - p) * -180).toFixed(1)}deg)` }),
    exit: (p) => ({ opacity: p < 0.5 ? 1 : 0, transform: `perspective(1600px) rotateY(${(p * 180).toFixed(1)}deg)` }),
  },
  "cube-left": {
    label: "Kub",
    group: "creative",
    enter: (p) => ({ transformOrigin: "left center", transform: `perspective(1600px) translateX(${pct(1 - p)}) rotateY(${((1 - p) * 90).toFixed(1)}deg)` }),
    exit: (p) => ({ transformOrigin: "right center", transform: `perspective(1600px) translateX(${pct(-p)}) rotateY(${(p * -90).toFixed(1)}deg)` }),
  },
  glitch: {
    label: "Glitch",
    group: "creative",
    enter: (p) => {
      const step = Math.floor(p * 10);
      const off = (step % 2 ? 1 : -1) * (1 - p) * 8;
      return { opacity: p > 0.15 ? 1 : 0, transform: `translateX(${off.toFixed(2)}%)`, filter: `hue-rotate(${((1 - p) * 120).toFixed(0)}deg) saturate(${1 + (1 - p) * 2})` };
    },
  },
  "rgb-split": {
    label: "RGB split",
    group: "creative",
    enter: (p) => ({ opacity: p, filter: `drop-shadow(${((1 - p) * 30).toFixed(1)}px 0 0 rgba(255,0,80,0.8)) drop-shadow(${((1 - p) * -30).toFixed(1)}px 0 0 rgba(0,200,255,0.8))` }),
  },
  "burn-light": { label: "Yorug'lik kuyishi", group: "creative", enter: (p) => ({ opacity: p, filter: `brightness(${1 + (1 - p) * 2})` }), flash: "#ffb347" },
  "swing-in": {
    label: "Tebranish",
    group: "creative",
    enter: (p) => ({ transformOrigin: "top center", opacity: p, transform: `perspective(1600px) rotateX(${((1 - p) * -90).toFixed(1)}deg)` }),
  },
};

/** Ids accepted by the AI and the UI. */
export const TRANSITION_IDS = Object.keys(TRANSITION_DEFS);

export const TRANSITIONS: Record<string, { label: string }> = Object.fromEntries(
  Object.entries(TRANSITION_DEFS).map(([id, t]) => [id, { label: t.label }]),
);

export const transitionDef = (id: string | undefined) => TRANSITION_DEFS[id ?? "none"] ?? TRANSITION_DEFS.fade;
