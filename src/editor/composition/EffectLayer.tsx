import React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";

interface Props {
  id: string;
  /** Seconds since the effect clip started. */
  t: number;
  duration: number;
  k: number;
  frame: number;
  seed: string;
}

const Particles: React.FC<{
  count: number;
  seed: string;
  t: number;
  render: (i: number, x: number, y: number, r: number) => React.ReactNode;
  speed: number;
  drift?: number;
  up?: boolean;
}> = ({ count, seed, t, render, speed, drift = 0, up }) => (
  <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
    {Array.from({ length: count }, (_, i) => {
      const r = random(`${seed}r${i}`);
      const x0 = random(`${seed}x${i}`);
      const y0 = random(`${seed}y${i}`);
      const v = speed * (0.5 + r);
      const yy = (((y0 + t * v) % 1.2) + 1.2) % 1.2 - 0.1;
      const y = up ? 1 - yy : yy;
      const x = x0 + Math.sin(t * 1.5 + i) * drift;
      return <React.Fragment key={i}>{render(i, x * 100, y * 100, r)}</React.Fragment>;
    })}
  </AbsoluteFill>
);

const dot = (x: number, y: number, size: number, style: React.CSSProperties): React.ReactNode => (
  <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: size, height: size, transform: "translate(-50%,-50%)", ...style }} />
);

export const EffectOverlay: React.FC<Props> = ({ id, t, duration, k, frame, seed }) => {
  const { width, height, fps } = useVideoConfig();
  const unit = Math.min(width, height) / 1080;
  const p = Math.max(0, Math.min(1, t / Math.max(0.01, duration)));
  const n = (base: number) => Math.round(base * (0.4 + k * 0.8));

  switch (id) {
    case "flash":
      return <AbsoluteFill style={{ background: "#fff", opacity: Math.max(0, 1 - t / 0.35) * k }} />;
    case "light-leak":
      return (
        <AbsoluteFill
          style={{
            mixBlendMode: "screen",
            opacity: 0.75 * k * Math.sin(p * Math.PI),
            background: `radial-gradient(ellipse at ${20 + p * 60}% ${30 + Math.sin(t) * 20}%, rgba(255,140,40,0.9), rgba(255,60,120,0.4) 35%, transparent 65%)`,
          }}
        />
      );
    case "film-burn":
      return (
        <AbsoluteFill
          style={{
            mixBlendMode: "screen",
            opacity: k * Math.sin(p * Math.PI),
            background: `radial-gradient(circle at ${10 + p * 80}% ${50 + Math.sin(t * 3) * 30}%, #fff7cc 0%, #ffb02e ${12 + p * 20}%, #ff4d00 ${25 + p * 25}%, transparent ${45 + p * 30}%)`,
          }}
        />
      );
    case "glow":
      return <AbsoluteFill style={{ mixBlendMode: "screen", opacity: 0.25 * k, background: "radial-gradient(ellipse at center, rgba(255,255,255,0.7), transparent 70%)" }} />;
    case "lens-flare": {
      const cx = 20 + p * 60;
      return (
        <AbsoluteFill style={{ mixBlendMode: "screen", opacity: 0.85 * k }}>
          <AbsoluteFill style={{ background: `radial-gradient(circle at ${cx}% 25%, rgba(255,255,230,0.95), rgba(255,200,120,0.35) 8%, transparent 22%)` }} />
          {[0.3, 0.55, 0.8].map((f, i) => (
            <AbsoluteFill
              key={i}
              style={{ background: `radial-gradient(circle at ${cx + (50 - cx) * f * 2}% ${25 + 50 * f}%, rgba(${120 + i * 60},180,255,0.35), transparent ${4 + i * 3}%)` }}
            />
          ))}
        </AbsoluteFill>
      );
    }
    case "vhs":
      return (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <AbsoluteFill style={{ opacity: 0.25 * k, background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 2px, transparent 2px, transparent 5px)" }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${((frame * 3) % 120) - 10}%`,
              height: "6%",
              background: "linear-gradient(transparent, rgba(255,255,255,0.12), transparent)",
            }}
          />
          <div style={{ position: "absolute", left: 40 * unit, top: 40 * unit, color: "#fff", fontFamily: "monospace", fontSize: 44 * unit, textShadow: "2px 0 #f0f, -2px 0 #0ff", opacity: k }}>
            PLAY ▶
          </div>
          <Grain opacity={0.2 * k} />
        </AbsoluteFill>
      );
    case "old-film":
      return (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          <Grain opacity={0.3 * k} />
          {random(`of${Math.floor(frame / 3)}`) > 0.6 && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${random(`ol${Math.floor(frame / 3)}`) * 100}%`, width: 2 * unit, background: "rgba(255,255,255,0.5)" }} />
          )}
          <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(40,20,0,0.7) 100%)", opacity: k }} />
        </AbsoluteFill>
      );
    case "scanlines":
      return <AbsoluteFill style={{ opacity: 0.35 * k, background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.7) 0px, rgba(0,0,0,0.7) 1px, transparent 1px, transparent 4px)" }} />;
    case "grain":
      return <Grain opacity={0.15 + 0.25 * k} />;
    case "glitch": {
      const bars = Array.from({ length: 6 }, (_, i) => i);
      return (
        <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
          {bars.map((i) =>
            random(`gb${i}${Math.floor(frame / 2)}`) > 1 - 0.3 * k ? (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: `${random(`gt${i}${frame}`) * 100}%`,
                  height: `${2 + random(`gh${i}${frame}`) * 8}%`,
                  background: i % 2 ? "rgba(0,255,255,0.35)" : "rgba(255,0,128,0.35)",
                  transform: `translateX(${(random(`gx${i}${frame}`) - 0.5) * 20}%)`,
                }}
              />
            ) : null,
          )}
        </AbsoluteFill>
      );
    }
    case "snow":
      return <Particles count={n(90)} seed={seed} t={t} speed={0.08} drift={0.02} render={(i, x, y, r) => dot(x, y, (4 + r * 10) * unit, { borderRadius: "50%", background: "#fff", opacity: 0.6 + r * 0.4 })} />;
    case "rain":
      return (
        <Particles
          count={n(140)}
          seed={seed}
          t={t}
          speed={1.1}
          render={(i, x, y, r) => dot(x, y, 2 * unit, { height: (30 + r * 40) * unit, background: "linear-gradient(transparent, rgba(200,220,255,0.7))", transform: "rotate(12deg)" })}
        />
      );
    case "confetti":
      return (
        <Particles
          count={n(110)}
          seed={seed}
          t={t}
          speed={0.25}
          drift={0.03}
          render={(i, x, y, r) =>
            dot(x, y, (10 + r * 10) * unit, {
              height: (6 + r * 6) * unit,
              background: ["#f43f5e", "#facc15", "#22d3ee", "#a3e635", "#a855f7", "#fb923c"][i % 6],
              transform: `rotate(${t * 300 * (r - 0.5) + i * 40}deg)`,
              borderRadius: 2,
            })
          }
        />
      );
    case "sparkles":
      return (
        <Particles
          count={n(50)}
          seed={seed}
          t={t}
          speed={0.04}
          render={(i, x, y, r) => {
            const tw = Math.abs(Math.sin(t * 4 + i * 1.7));
            return (
              <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, fontSize: (14 + r * 26) * unit, opacity: tw, transform: `translate(-50%,-50%) scale(${0.5 + tw * 0.7})`, color: "#fff7c2", textShadow: "0 0 12px #fde047" }}>
                ✦
              </div>
            );
          }}
        />
      );
    case "hearts":
      return (
        <Particles
          count={n(36)}
          seed={seed}
          t={t}
          speed={0.15}
          up
          drift={0.03}
          render={(i, x, y, r) => (
            <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, fontSize: (24 + r * 40) * unit, opacity: 0.85, transform: "translate(-50%,-50%)" }}>{["💖", "❤️", "💕", "💗"][i % 4]}</div>
          )}
        />
      );
    case "bubbles":
      return (
        <Particles
          count={n(40)}
          seed={seed}
          t={t}
          speed={0.12}
          up
          drift={0.02}
          render={(i, x, y, r) => dot(x, y, (16 + r * 50) * unit, { borderRadius: "50%", border: `${2 * unit}px solid rgba(255,255,255,0.6)`, background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), transparent 60%)" })}
        />
      );
    case "stars":
      return (
        <Particles
          count={n(70)}
          seed={seed}
          t={t * 0.1}
          speed={0.02}
          render={(i, x, y, r) => dot(x, y, (2 + r * 4) * unit, { borderRadius: "50%", background: "#fff", opacity: 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + i)), boxShadow: "0 0 6px #fff" })}
        />
      );
    case "letterbox-in": {
      const bar = Math.max(0, (height - width / 2.39) / 2) * Math.min(1, t / 0.6) * Math.min(1, (duration - t) / 0.6 + 0.0001);
      return (
        <AbsoluteFill>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(bar, 0), background: "#000" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: Math.max(bar, 0), background: "#000" }} />
        </AbsoluteFill>
      );
    }
    case "fade-black":
      return <AbsoluteFill style={{ background: "#000", opacity: p * k }} />;
    case "fade-white":
      return <AbsoluteFill style={{ background: "#fff", opacity: p * k }} />;
    case "vignette-pulse":
      return <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent ${45 - Math.abs(Math.sin(t * 3)) * 15 * k}%, rgba(0,0,0,0.85) 100%)` }} />;
    case "rec": {
      const sec = Math.floor(t);
      const tc = `00:${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}:${String(Math.floor((t % 1) * fps)).padStart(2, "0")}`;
      const m = 50 * unit;
      const corner = (s: React.CSSProperties) => <div style={{ position: "absolute", width: 70 * unit, height: 70 * unit, borderColor: "#fff", borderStyle: "solid", borderWidth: 0, ...s }} />;
      return (
        <AbsoluteFill style={{ fontFamily: "monospace", color: "#fff", fontSize: 38 * unit }}>
          {corner({ top: m, left: m, borderTopWidth: 4 * unit, borderLeftWidth: 4 * unit })}
          {corner({ top: m, right: m, borderTopWidth: 4 * unit, borderRightWidth: 4 * unit })}
          {corner({ bottom: m, left: m, borderBottomWidth: 4 * unit, borderLeftWidth: 4 * unit })}
          {corner({ bottom: m, right: m, borderBottomWidth: 4 * unit, borderRightWidth: 4 * unit })}
          <div style={{ position: "absolute", top: m * 1.8, left: m * 1.8, display: "flex", alignItems: "center", gap: 14 * unit }}>
            <span style={{ width: 26 * unit, height: 26 * unit, borderRadius: "50%", background: "#ef4444", opacity: Math.floor(t * 2) % 2 ? 1 : 0.2 }} /> REC
          </div>
          <div style={{ position: "absolute", top: m * 1.8, right: m * 1.8 }}>{tc}</div>
          <div style={{ position: "absolute", bottom: m * 1.8, right: m * 1.8 }}>4K · 30FPS</div>
        </AbsoluteFill>
      );
    }
    case "countdown": {
      const step = duration / 3;
      const num = 3 - Math.min(2, Math.floor(t / step));
      const lp = (t % step) / step;
      return (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }}>
          <div
            style={{
              width: 420 * unit,
              height: 420 * unit,
              borderRadius: "50%",
              border: `${10 * unit}px solid rgba(255,255,255,0.85)`,
              display: "grid",
              placeItems: "center",
              fontSize: 260 * unit,
              fontWeight: 900,
              color: "#fff",
              fontFamily: "var(--font-display), sans-serif",
              transform: `scale(${1.2 - lp * 0.2})`,
              opacity: 1 - lp * 0.3,
            }}
          >
            {num}
          </div>
        </AbsoluteFill>
      );
    }
    default:
      return null;
  }
};

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.12 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ transform: `translate(${(frame * 37) % 50}px, ${(frame * 23) % 50}px) scale(1.1)` }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
