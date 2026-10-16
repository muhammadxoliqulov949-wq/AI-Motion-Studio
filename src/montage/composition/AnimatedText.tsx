import { loadFont } from "@remotion/google-fonts/Montserrat";
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationType } from "../types";

const { fontFamily } = loadFont("normal", { weights: ["600", "800", "900"], subsets: ["latin", "cyrillic"] });

export const MONTAGE_FONT = fontFamily;

/**
 * Subtitle that enters word by word. The style of the entrance follows
 * `animation_type`; the active word is highlighted like karaoke captions.
 */
export const AnimatedText: React.FC<{
  text: string;
  type: AnimationType;
  durationInFrames: number;
  vertical: boolean;
}> = ({ text, type, durationInFrames, vertical }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);
  const unit = width / 1080;
  const stagger = Math.max(2, Math.min(5, Math.floor((durationInFrames * 0.35) / Math.max(1, words.length))));
  const activeWord = Math.min(words.length - 1, Math.floor((frame / durationInFrames) * words.length * 1.1));
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        fontFamily,
        fontWeight: 900,
        fontSize: (vertical ? 84 : 72) * unit,
        lineHeight: 1.12,
        textAlign: "center",
        textTransform: "uppercase",
        color: "white",
        maxWidth: "88%",
        opacity: exit,
        textShadow: `0 ${6 * unit}px ${28 * unit}px rgba(0,0,0,0.55)`,
      }}
    >
      {words.map((word, i) => {
        const local = frame - i * stagger;
        const s = spring({ frame: local, fps, config: { damping: type === "pop" ? 9 : 16, mass: 0.6 } });
        const opacity = interpolate(local, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        let transform = "none";
        if (type === "pop") transform = `scale(${0.3 + 0.7 * s})`;
        if (type === "slide") transform = `translateY(${(1 - s) * 60 * unit}px)`;
        if (type === "fade") transform = `translateY(${(1 - s) * 12 * unit}px)`;
        const active = i === activeWord;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              margin: `0 ${10 * unit}px`,
              opacity,
              transform,
              color: active ? "#FDE047" : "white",
              WebkitTextStroke: `${3 * unit}px rgba(0,0,0,0.85)`,
              paintOrder: "stroke",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
