import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TEXT_ANIMATIONS } from "../catalog/animations";
import { fontStack, useCompositionFont } from "../catalog/font-loader";
import type { TextClip } from "../types";

const DISPLAY_FONT = "var(--font-display), 'Inter', system-ui, sans-serif";

/** Look of the six original styles; explicit clip fields override these. */
const LEGACY: Record<string, Partial<TextClip>> = {
  title: { fontSize: 120, fontWeight: 800, shadowColor: "rgba(0,0,0,0.5)", shadowBlur: 40, textIn: "rise-lines" },
  caption: { font: "Montserrat", fontSize: 64, fontWeight: 800, uppercase: true, strokeColor: "#000000", strokeWidth: 3, textLoop: "karaoke", highlightColor: "#facc15" },
  pop: { fontSize: 150, fontWeight: 900, strokeColor: "#000000", strokeWidth: 6, shadowColor: "#000000", shadowBlur: 0, animIn: { id: "in:pop-in", duration: 0.5 } },
  typewriter: { font: "JetBrains Mono", fontSize: 72, fontWeight: 400, bgColor: "#000000", bgOpacity: 0.55, textIn: "typewriter" },
  neon: { fontSize: 140, fontWeight: 800, textLoop: "flicker" },
};

const hexToRgba = (hex: string, alpha: number) => {
  if (!hex.startsWith("#")) return hex;
  const h = hex.slice(1);
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

const easeOut = (p: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3);
const easeOutBack = (p: number) => {
  const x = Math.max(0, Math.min(1, p));
  return 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
};
const bounceOut = (p: number) => {
  let x = Math.max(0, Math.min(1, p));
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
};

interface Unit {
  text: string;
  index: number; // char index across the text
  word: number;
}

export const TextLayer: React.FC<{ clip: TextClip }> = ({ clip: raw }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const clip = { ...LEGACY[raw.style], ...stripUndefined(raw) } as TextClip;
  useCompositionFont(clip.font);
  const unit = Math.min(width, height) / 1080;
  const t = Math.min(frame / fps, clip.duration);
  const total = Math.round(clip.duration * fps);

  const justify = clip.position === "top" ? "flex-start" : clip.position === "bottom" ? "flex-end" : "center";
  const fontFamily = clip.font ? fontStack(clip.font, DISPLAY_FONT) : DISPLAY_FONT;

  if (raw.style === "lower-third") return <LowerThird clip={clip} unit={unit} fontFamily={fontFamily} justify={justify} />;

  const text = clip.uppercase ? clip.text.toLocaleUpperCase("uz") : clip.text;
  const words = text.split(/(\s+)/);
  const units: Unit[] = [];
  let charIndex = 0;
  let wordIndex = 0;
  for (const w of words) {
    if (/^\s+$/.test(w)) {
      units.push({ text: w, index: charIndex, word: -1 });
      continue;
    }
    for (const ch of Array.from(w)) units.push({ text: ch, index: charIndex++, word: wordIndex });
    wordIndex++;
  }
  const charCount = Math.max(1, charIndex);
  const wordCount = Math.max(1, wordIndex);

  const inAnim = clip.textIn && TEXT_ANIMATIONS[clip.textIn] ? clip.textIn : null;
  const outAnim = clip.textOut && TEXT_ANIMATIONS[clip.textOut] ? clip.textOut : null;
  const loop = clip.textLoop && TEXT_ANIMATIONS[clip.textLoop] ? clip.textLoop : null;
  const inDur = Math.min(clip.duration * 0.5, inAnim === "typewriter" ? Math.max(0.6, charCount * 0.05) : 0.9);
  const outDur = Math.min(clip.duration * 0.4, 0.7);
  const outStart = clip.duration - outDur;

  const fontSize = (clip.fontSize ?? 90) * unit;
  const strokeW = (clip.strokeWidth ?? 0) * unit;
  const glow =
    raw.style === "neon"
      ? `0 0 ${10 * unit}px ${clip.color}, 0 0 ${40 * unit}px #e879f9, 0 0 ${80 * unit}px #e879f9`
      : clip.shadowColor
        ? `0 ${(clip.shadowBlur ?? 0) * 0.15 * unit + (clip.shadowBlur === 0 ? 8 * unit : 0)}px ${(clip.shadowBlur ?? 0) * unit}px ${clip.shadowColor}`
        : undefined;
  const glowPulse = loop === "glow-pulse" ? 0.6 + 0.4 * Math.sin(t * 5) : 1;

  // Whole-line effects.
  const lineStyle: React.CSSProperties = {};
  let typedChars = charCount;
  if (inAnim && t < inDur + 0.5) {
    const p = t / inDur;
    if (inAnim === "spread") {
      lineStyle.letterSpacing = `${interpolate(easeOut(p), [0, 1], [0.6, (clip.letterSpacing ?? 0) / (clip.fontSize ?? 90)])}em`;
      lineStyle.opacity = easeOut(p);
    }
    if (inAnim === "wipe-text") lineStyle.clipPath = `inset(0 ${(1 - easeOut(p)) * 100}% 0 0)`;
    if (inAnim === "typewriter") typedChars = Math.floor(Math.min(1, p) * charCount);
  }
  if (outAnim && t > outStart) {
    const p = (t - outStart) / outDur;
    if (outAnim === "blur-out") {
      lineStyle.filter = `blur(${p * 20 * unit}px)`;
      lineStyle.opacity = 1 - p;
    }
    if (outAnim === "erase") typedChars = Math.min(typedChars, Math.floor((1 - Math.min(1, p)) * charCount));
  }
  if (loop === "flicker") lineStyle.opacity = (lineStyle.opacity as number ?? 1) * (random(`fl${Math.floor(frame / 2)}${clip.id}`) > 0.92 ? 0.35 : 1);
  // Legacy styles faded out over the last frames.
  const legacyExit = LEGACY[raw.style] && !clip.animOut && !outAnim ? interpolate(frame, [total - 8, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const legacyEnter = raw.style === "neon" ? spring({ frame, fps, config: { damping: 14, mass: 0.7 } }) : 1;

  const activeWord = Math.floor((t / Math.max(0.01, clip.duration)) * wordCount);

  const unitStyle = (u: Unit): React.CSSProperties => {
    if (u.word < 0) return {};
    const s: React.CSSProperties = { display: "inline-block" };
    const transforms: string[] = [];
    let opacity = 1;
    let blur = 0;
    let color: string | undefined;
    const ci = u.index;
    const wi = u.word;
    if (inAnim && t < inDur + 0.6) {
      const def = TEXT_ANIMATIONS[inAnim];
      const n = def.unit === "word" ? wordCount : charCount;
      const i = def.unit === "word" ? wi : ci;
      const stagger = (inDur * 0.6) / n;
      const local = (t - i * stagger) / Math.max(0.05, inDur * 0.4);
      switch (inAnim) {
        case "typewriter":
          opacity = ci < typedChars ? 1 : 0;
          break;
        case "fade-chars":
          opacity = easeOut(local);
          break;
        case "pop-words":
          transforms.push(`scale(${easeOutBack(local)})`);
          opacity = Math.min(1, local * 3);
          break;
        case "bounce-chars":
          transforms.push(`translateY(${(1 - bounceOut(local)) * -80}%)`);
          opacity = Math.min(1, local * 4);
          break;
        case "slide-words":
        case "rise-lines":
          transforms.push(`translateY(${(1 - easeOut(local)) * 60}%)`);
          opacity = easeOut(local);
          break;
        case "blur-chars":
          blur = (1 - easeOut(local)) * 20;
          opacity = easeOut(local);
          break;
        case "zoom-chars":
          transforms.push(`scale(${3 - 2 * easeOut(local)})`);
          opacity = easeOut(local);
          break;
        case "drop-chars":
          transforms.push(`translateY(${(1 - bounceOut(local)) * -150}%)`);
          opacity = Math.min(1, local * 5);
          break;
        case "flip-chars":
          transforms.push(`perspective(400px) rotateX(${(1 - easeOut(local)) * 90}deg)`);
          opacity = Math.min(1, local * 2);
          break;
        case "glitch-in": {
          const settled = local >= 1;
          if (!settled) {
            transforms.push(`translate(${(random(`gx${ci}${frame}`) - 0.5) * 40}%, ${(random(`gy${ci}${frame}`) - 0.5) * 40}%)`);
            opacity = random(`go${ci}${frame}`) > 0.4 ? 1 : 0;
            color = random(`gc${ci}${frame}`) > 0.5 ? "#22d3ee" : "#f43f5e";
          }
          break;
        }
      }
    }
    if (outAnim && t > outStart) {
      const def = TEXT_ANIMATIONS[outAnim];
      const n = def.unit === "word" ? wordCount : charCount;
      const i = def.unit === "word" ? wi : ci;
      const stagger = (outDur * 0.6) / n;
      const local = (t - outStart - i * stagger) / Math.max(0.05, outDur * 0.4);
      switch (outAnim) {
        case "fade-out-chars":
          opacity *= 1 - easeOut(local);
          break;
        case "slide-out-words":
          transforms.push(`translateY(${easeOut(local) * 80}%)`);
          opacity *= 1 - easeOut(local);
          break;
        case "zoom-out-chars":
          transforms.push(`scale(${1 - easeOut(local)})`);
          break;
        case "erase":
          opacity *= ci < typedChars ? 1 : 0;
          break;
      }
    }
    switch (loop) {
      case "karaoke":
        if (wi <= activeWord) color = clip.highlightColor ?? "#facc15";
        if (wi === activeWord) transforms.push("scale(1.08)");
        break;
      case "highlight-word":
        if (wi === activeWord) {
          color = clip.highlightColor ?? "#facc15";
          transforms.push("scale(1.18)");
        }
        break;
      case "wave":
        transforms.push(`translateY(${Math.sin(t * 6 + ci * 0.55) * 12}%)`);
        break;
      case "shake-text":
        transforms.push(`translate(${Math.sin(frame * 1.7 + ci) * 3}%, ${Math.cos(frame * 2.3 + ci) * 3}%)`);
        break;
      case "rainbow":
        color = `hsl(${(ci * 32 + t * 160) % 360}, 90%, 62%)`;
        break;
      case "jitter":
        if (Math.floor(frame / 3) % 2) transforms.push(`translate(${(random(`j${ci}${Math.floor(frame / 3)}`) - 0.5) * 8}%, ${(random(`jy${ci}${Math.floor(frame / 3)}`) - 0.5) * 8}%)`);
        break;
    }
    if (transforms.length) s.transform = transforms.join(" ");
    if (opacity !== 1) s.opacity = Math.max(0, Math.min(1, opacity));
    if (blur) s.filter = `blur(${blur * unit}px)`;
    if (color) s.color = color;
    return s;
  };

  // Group units into words so wrapping never splits a word.
  const groups: Unit[][] = [];
  for (const u of units) {
    if (u.word < 0) groups.push([u]);
    else if (groups.length && groups[groups.length - 1][0].word === u.word) groups[groups.length - 1].push(u);
    else groups.push([u]);
  }

  const bg = clip.bgColor && (clip.bgOpacity ?? 1) > 0 ? hexToRgba(clip.bgColor, clip.bgOpacity ?? 1) : undefined;

  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: clip.align === "left" ? "flex-start" : clip.align === "right" ? "flex-end" : "center",
        padding: `${110 * unit}px ${70 * unit}px`,
        opacity: legacyExit * legacyEnter,
      }}
    >
      <div
        style={{
          fontFamily,
          fontSize,
          fontWeight: clip.fontWeight ?? 800,
          fontStyle: clip.italic ? "italic" : undefined,
          color: clip.color,
          textAlign: clip.align ?? "center",
          lineHeight: clip.lineHeight ?? 1.15,
          letterSpacing: (clip.letterSpacing ?? 0) * unit,
          maxWidth: "92%",
          WebkitTextStroke: strokeW ? `${strokeW * 2}px ${clip.strokeColor ?? "#000"}` : undefined,
          paintOrder: strokeW ? "stroke fill" : undefined,
          textShadow: glow,
          background: bg,
          padding: bg ? `${0.18 * fontSize}px ${0.4 * fontSize}px` : undefined,
          borderRadius: bg ? 0.18 * fontSize : undefined,
          filter: glowPulse !== 1 ? `brightness(${0.85 + glowPulse * 0.3}) drop-shadow(0 0 ${glowPulse * 18 * unit}px ${clip.shadowColor ?? clip.color})` : undefined,
          whiteSpace: "pre-wrap",
          ...lineStyle,
        }}
      >
        {groups.map((g, gi) =>
          g[0].word < 0 ? (
            <span key={gi}>{g[0].text}</span>
          ) : (
            <span key={gi} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              {g.map((u) => (
                <span key={u.index} style={unitStyle(u)}>
                  {u.text}
                </span>
              ))}
            </span>
          ),
        )}
        {inAnim === "typewriter" && t < inDur + 0.8 && <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }}>▍</span>}
      </div>
    </AbsoluteFill>
  );
};

const stripUndefined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

const LowerThird: React.FC<{ clip: TextClip; unit: number; fontFamily: string; justify: string }> = ({ clip, unit, fontFamily, justify }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.round(clip.duration * fps);
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const exit = interpolate(frame, [total - 8, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: justify, alignItems: "center", padding: `${110 * unit}px ${60 * unit}px`, opacity: exit }}>
      <div
        style={{
          alignSelf: "flex-start",
          marginLeft: 80 * unit,
          transform: `translateX(${(1 - enter) * -120}%)`,
          display: "flex",
          alignItems: "stretch",
          gap: 16 * unit,
        }}
      >
        <div style={{ width: 10 * unit, background: clip.highlightColor ?? "#8b5cf6", borderRadius: 4 }} />
        <div
          style={{
            background: clip.bgColor ? hexToRgba(clip.bgColor, clip.bgOpacity ?? 0.75) : "rgba(10,10,15,0.75)",
            padding: `${18 * unit}px ${32 * unit}px`,
            borderRadius: 12 * unit,
            fontFamily,
            color: clip.color,
          }}
        >
          <div style={{ fontSize: (clip.fontSize ?? 48) * unit, fontWeight: clip.fontWeight ?? 700 }}>{clip.text.split("\n")[0]}</div>
          <div style={{ fontSize: 26 * unit, opacity: 0.7 }}>{clip.text.split("\n")[1] ?? "AI Motion Studio"}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
