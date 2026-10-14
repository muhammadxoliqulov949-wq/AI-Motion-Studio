import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { TextClip } from "../types";

const DISPLAY_FONT = "var(--font-display), 'Inter', system-ui, sans-serif";

export const TextLayer: React.FC<{ clip: TextClip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height) / 1080;
  const total = Math.round(clip.duration * fps);
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const exit = interpolate(frame, [total - 8, total], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const justify =
    clip.position === "top" ? "flex-start" : clip.position === "bottom" ? "flex-end" : "center";

  let content: React.ReactNode;
  switch (clip.style) {
    case "title":
      content = (
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 120 * unit,
            fontWeight: 800,
            letterSpacing: interpolate(enter, [0, 1], [30, -2]) * unit,
            color: clip.color,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 60 * unit}px)`,
            textShadow: "0 8px 40px rgba(0,0,0,0.5)",
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          {clip.text}
        </div>
      );
      break;
    case "caption": {
      const words = clip.text.split(" ");
      const active = Math.floor((frame / total) * words.length);
      content = (
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 64 * unit,
            fontWeight: 800,
            textAlign: "center",
            maxWidth: "85%",
            lineHeight: 1.2,
            textTransform: "uppercase",
            WebkitTextStroke: `${3 * unit}px #000`,
            paintOrder: "stroke",
          }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              style={{
                color: i === active ? "#facc15" : clip.color,
                display: "inline-block",
                marginRight: 16 * unit,
                transform: i === active ? "scale(1.12)" : "scale(1)",
              }}
            >
              {w}
            </span>
          ))}
        </div>
      );
      break;
    }
    case "lower-third":
      content = (
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
          <div style={{ width: 10 * unit, background: "#8b5cf6", borderRadius: 4 }} />
          <div
            style={{
              background: "rgba(10,10,15,0.75)",
              backdropFilter: "blur(10px)",
              padding: `${18 * unit}px ${32 * unit}px`,
              borderRadius: 12 * unit,
              fontFamily: DISPLAY_FONT,
              color: clip.color,
            }}
          >
            <div style={{ fontSize: 48 * unit, fontWeight: 700 }}>{clip.text}</div>
            <div style={{ fontSize: 26 * unit, opacity: 0.7 }}>AI Motion Studio</div>
          </div>
        </div>
      );
      break;
    case "pop":
      content = (
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 150 * unit,
            fontWeight: 900,
            color: "#facc15",
            WebkitTextStroke: `${6 * unit}px #000`,
            paintOrder: "stroke",
            transform: `scale(${enter}) rotate(${(1 - enter) * -20 - 4}deg)`,
            textShadow: `0 ${10 * unit}px 0 #000`,
          }}
        >
          {clip.text}
        </div>
      );
      break;
    case "typewriter": {
      const chars = Math.floor(interpolate(frame, [0, Math.min(total * 0.7, clip.text.length * 2.5)], [0, clip.text.length], { extrapolateRight: "clamp" }));
      content = (
        <div
          style={{
            fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
            fontSize: 72 * unit,
            color: clip.color,
            background: "rgba(0,0,0,0.55)",
            padding: `${12 * unit}px ${24 * unit}px`,
            borderRadius: 10 * unit,
          }}
        >
          {clip.text.slice(0, chars)}
          <span style={{ opacity: Math.floor(frame / 8) % 2 ? 1 : 0 }}>▍</span>
        </div>
      );
      break;
    }
    case "neon":
      content = (
        <div
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 140 * unit,
            fontWeight: 800,
            color: "#fff",
            opacity: frame % 37 < 2 ? 0.4 : enter,
            textShadow: `0 0 ${10 * unit}px ${clip.color}, 0 0 ${40 * unit}px #e879f9, 0 0 ${80 * unit}px #e879f9`,
          }}
        >
          {clip.text}
        </div>
      );
      break;
  }

  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: "center",
        padding: `${110 * unit}px ${60 * unit}px`,
        opacity: exit,
      }}
    >
      {content}
    </AbsoluteFill>
  );
};
