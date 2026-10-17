import React from "react";
import { interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { motionPreset } from "../catalog/motion-presets";

/**
 * Call-to-action stickers animated in code (frame-exact in preview and export).
 * `size` is the sticker's base height in px; frame 0 is the clip start (we are inside its Sequence).
 */
export const MotionSticker: React.FC<{ id: string; color?: string; size: number }> = ({ id, color, size }) => {
  const preset = motionPreset(id);
  if (!preset) return null;
  const c = color ?? preset.defaultColor;
  const w = size * preset.aspect;
  const props = { c, w, h: size };
  switch (id) {
    case "subscribe":
      return <Subscribe {...props} />;
    case "like":
      return <Like {...props} />;
    case "bell":
      return <BellRing {...props} />;
    case "arrow-down":
      return <ArrowBounce {...props} dir="down" />;
    case "arrow-right":
      return <ArrowBounce {...props} dir="right" />;
    case "tap":
      return <Tap {...props} />;
    case "swipe-up":
      return <SwipeUp {...props} />;
    case "hearts":
      return <Hearts {...props} />;
    default:
      return null;
  }
};

type P = { c: string; w: number; h: number };

const usePop = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 11, stiffness: 160 } });
};

const BellIcon: React.FC<{ size: number; color: string; angle?: number }> = ({ size, color, angle = 0 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ transform: `rotate(${angle}deg)`, transformOrigin: "50% 10%" }}>
    <path d="M12 2a1.5 1.5 0 0 1 1.5 1.5v.6A6.5 6.5 0 0 1 18.5 10.5v4.2l1.8 2.4a.8.8 0 0 1-.6 1.3H4.3a.8.8 0 0 1-.6-1.3l1.8-2.4v-4.2a6.5 6.5 0 0 1 5-6.4v-.6A1.5 1.5 0 0 1 12 2Z" fill={color} />
    <path d="M9.5 19.8a2.6 2.6 0 0 0 5 0Z" fill={color} />
  </svg>
);

const Cursor: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,.5))" }}>
    <path d="M5 2.5v16.2l4.3-4.1 2.7 6.4 2.6-1.1-2.7-6.3h6.1Z" fill="#fff" stroke="#111" strokeWidth={1.3} strokeLinejoin="round" />
  </svg>
);

/** Red button pops in, a cursor clicks it, it turns grey ("subscribed") and the bell rings. */
const Subscribe: React.FC<P> = ({ c, w, h }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = usePop();
  const clickAt = Math.round(fps * 1.3);
  const clicked = frame >= clickAt;
  const press = interpolate(frame, [clickAt - 4, clickAt, clickAt + 5], [1, 0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorIn = interpolate(frame, [fps * 0.5, clickAt - 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cursorOut = interpolate(frame, [clickAt + fps * 0.4, clickAt + fps * 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ring = clicked ? Math.sin((frame - clickAt) / 2.2) * 22 * Math.max(0, 1 - (frame - clickAt) / (fps * 1.2)) : 0;
  const bh = h * 0.62;
  return (
    <div style={{ position: "relative", width: w, height: h, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          transform: `scale(${pop * press})`,
          display: "flex",
          alignItems: "center",
          gap: bh * 0.22,
          height: bh,
          padding: `0 ${bh * 0.45}px`,
          borderRadius: bh * 0.22,
          background: clicked ? "#3f3f46" : c,
          color: "#fff",
          fontFamily: "Inter, Arial, sans-serif",
          fontWeight: 800,
          fontSize: bh * 0.36,
          letterSpacing: 0.5,
          boxShadow: "0 8px 30px rgba(0,0,0,.35)",
          whiteSpace: "nowrap",
        }}
      >
        <BellIcon size={bh * 0.48} color="#fff" angle={ring} />
        {clicked ? "OBUNA BO'LINDI ✓" : "OBUNA BO'LING"}
      </div>
      <div
        style={{
          position: "absolute",
          left: "58%",
          top: "55%",
          opacity: 1 - cursorOut,
          transform: `translate(${cursorIn * w * 0.35}px, ${cursorIn * h * 0.6 + cursorOut * h * 0.3}px) scale(${clicked && frame < clickAt + 5 ? 0.85 : 1})`,
        }}
      >
        <Cursor size={h * 0.45} />
      </div>
    </div>
  );
};

/** Thumbs-up pops in a circle with a ring of particles. */
const Like: React.FC<P> = ({ c, h }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = usePop();
  const burst = interpolate(frame, [fps * 0.15, fps * 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "relative", width: h, height: h, display: "grid", placeItems: "center" }}>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const r = h * (0.32 + burst * 0.22);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: h * 0.06,
              height: h * 0.06,
              borderRadius: "50%",
              background: i % 2 ? c : "#facc15",
              opacity: 1 - burst,
              transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px)`,
            }}
          />
        );
      })}
      <div style={{ width: h * 0.62, height: h * 0.62, borderRadius: "50%", background: c, display: "grid", placeItems: "center", transform: `scale(${pop})`, boxShadow: "0 8px 30px rgba(0,0,0,.35)" }}>
        <svg viewBox="0 0 24 24" width={h * 0.34} height={h * 0.34} style={{ transform: `rotate(${interpolate(pop, [0, 1], [-30, 0])}deg)` }}>
          <path d="M2 10h4v11H2zM8 21h9.3a2 2 0 0 0 2-1.6l1.6-7.4A2 2 0 0 0 19 9.6h-5.4l.8-4a1.8 1.8 0 0 0-3.3-1.3L8 10Z" fill="#fff" />
        </svg>
      </div>
    </div>
  );
};

const BellRing: React.FC<P> = ({ c, h }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = usePop();
  // Rings for a second, rests, rings again.
  const cycle = frame % Math.round(fps * 1.6);
  const angle = cycle < fps ? Math.sin(cycle / 1.8) * 24 * (1 - cycle / fps) : 0;
  const wave = (cycle % fps) / fps;
  return (
    <div style={{ position: "relative", width: h, height: h, display: "grid", placeItems: "center", transform: `scale(${pop})` }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: h * (0.6 + ((wave + i * 0.5) % 1) * 0.4),
            height: h * (0.6 + ((wave + i * 0.5) % 1) * 0.4),
            borderRadius: "50%",
            border: `${h * 0.03}px solid ${c}`,
            opacity: cycle < fps ? 1 - ((wave + i * 0.5) % 1) : 0,
          }}
        />
      ))}
      <BellIcon size={h * 0.6} color={c} angle={angle} />
    </div>
  );
};

const ArrowBounce: React.FC<P & { dir: "down" | "right" }> = ({ c, w, h, dir }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = usePop();
  const bounce = Math.abs(Math.sin((frame / fps) * Math.PI * 1.6)) * (dir === "down" ? h : w) * 0.12;
  return (
    <div style={{ width: w, height: h, display: "grid", placeItems: "center", transform: `scale(${pop})` }}>
      <svg
        viewBox="0 0 100 100"
        width={dir === "down" ? w * 0.9 : w * 0.8}
        height={dir === "down" ? h * 0.8 : h * 0.9}
        style={{ transform: `${dir === "down" ? `translateY(${bounce}px)` : `translateX(${bounce}px)`} rotate(${dir === "down" ? 90 : 0}deg)`, overflow: "visible", filter: "drop-shadow(0 4px 10px rgba(0,0,0,.45))" }}
      >
        <path d="M8 40h52V18l34 32-34 32V60H8z" fill={c} stroke="#000" strokeWidth={4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** Pointing hand taps, with expanding ripples. */
const Tap: React.FC<P> = ({ c, h }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = usePop();
  const period = Math.round(fps * 1.1);
  const t = (frame % period) / period;
  const press = t < 0.15 ? 1 - t * 0.8 : 1;
  return (
    <div style={{ position: "relative", width: h, height: h, transform: `scale(${pop})` }}>
      {[0, 0.35].map((d) => {
        const r = Math.max(0, (t - d) / 0.65);
        return (
          <div
            key={d}
            style={{
              position: "absolute",
              left: "28%",
              top: "18%",
              width: h * 0.5 * r,
              height: h * 0.5 * r,
              marginLeft: -(h * 0.25 * r),
              marginTop: -(h * 0.25 * r),
              borderRadius: "50%",
              border: `${h * 0.025}px solid ${c}`,
              opacity: r > 0 && r < 1 ? 1 - r : 0,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: "16%", top: "10%", transform: `scale(${press})`, transformOrigin: "20% 10%", fontSize: h * 0.62, lineHeight: 1 }}>👆</div>
    </div>
  );
};

const SwipeUp: React.FC<P> = ({ c, w, h }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = usePop();
  const t = (frame / fps) % 1;
  return (
    <div style={{ width: w, height: h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${pop})`, fontFamily: "Inter, Arial, sans-serif" }}>
      {[0, 1, 2].map((i) => {
        const o = interpolate((t + i / 3) % 1, [0, 0.5, 1], [0.15, 1, 0.15]);
        return (
          <svg key={i} viewBox="0 0 40 20" width={w * 0.5} height={h * 0.16} style={{ opacity: o, transform: `translateY(${-t * h * 0.05}px)` }}>
            <path d="M4 17 20 4l16 13" fill="none" stroke={c} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      })}
      <div style={{ marginTop: h * 0.04, color: c, fontWeight: 800, fontSize: h * 0.1, textShadow: "0 2px 8px rgba(0,0,0,.6)", whiteSpace: "nowrap" }}>YUQORIGA SURING</div>
    </div>
  );
};

/** Hearts floating up and fading, like a live-stream reaction. */
const Hearts: React.FC<P> = ({ c, w, h }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      {Array.from({ length: 9 }, (_, i) => {
        const delay = i * fps * 0.28;
        const life = fps * 1.8;
        const t = (frame - delay) / life;
        if (t < 0 || t > 1) return null;
        const x = (random(`hx${i}`) - 0.5) * w * 0.6 + Math.sin(t * 6 + i) * w * 0.08;
        const s = h * (0.16 + random(`hs${i}`) * 0.1);
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            width={s}
            height={s}
            style={{ position: "absolute", left: w / 2 + x - s / 2, top: h * (0.85 - t * 0.8) - s / 2, opacity: interpolate(t, [0, 0.1, 0.7, 1], [0, 1, 1, 0]), transform: `scale(${interpolate(t, [0, 0.15], [0.4, 1], { extrapolateRight: "clamp" })})` }}
          >
            <path d="M12 21s-7.5-4.6-9.6-9.2C.8 8.2 3 4.5 6.6 4.5c2 0 3.6 1.1 5.4 3 1.8-1.9 3.4-3 5.4-3 3.6 0 5.8 3.7 4.2 7.3C19.5 16.4 12 21 12 21Z" fill={i % 3 === 1 ? "#fb7185" : c} />
          </svg>
        );
      })}
    </div>
  );
};
