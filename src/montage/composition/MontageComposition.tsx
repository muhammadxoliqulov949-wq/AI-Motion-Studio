import React from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Html5Video,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import type { ResolvedMontage, ResolvedScene } from "../types";
import { AnimatedText, MONTAGE_FONT } from "./AnimatedText";

export interface MontageProps extends Record<string, unknown> {
  montage: ResolvedMontage;
}

export const MONTAGE_SIZES = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
} as const;

export const totalFrames = (m: ResolvedMontage) =>
  Math.max(1, m.scenes.reduce((sum, s) => sum + s.durationInFrames, 0));

/** Lets Remotion Studio / Lambda size the video from the montage JSON. */
export const calculateMontageMetadata: CalculateMetadataFunction<MontageProps> = ({ props }) => ({
  durationInFrames: totalFrames(props.montage),
  fps: props.montage.fps,
  ...MONTAGE_SIZES[props.montage.aspect],
});

const SFX_VOLUME = 0.45;
const VOICE_VOLUME = 1;
const BGM_VOLUME = 0.14;

/**
 * Dynamic timeline: every scene gets its own <Sequence> sized by `durationInFrames`,
 * with stock footage, animated subtitles, a voiceover and an SFX hit at its start.
 * Background music runs underneath the whole video.
 */
export const MontageComposition: React.FC<MontageProps> = ({ montage }) => {
  const { fps } = useVideoConfig();
  const total = totalFrames(montage);
  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {montage.scenes.map((scene, index) => {
        const from = cursor;
        cursor += scene.durationInFrames;
        return (
          <Sequence key={index} from={from} durationInFrames={scene.durationInFrames} name={`Scene ${index + 1}`}>
            <Scene scene={scene} index={index} title={index === 0 ? montage.title : null} vertical={montage.aspect === "9:16"} />
          </Sequence>
        );
      })}

      {montage.bgm && (
        <Html5Audio
          src={staticFile(montage.bgm)}
          loop
          volume={(f) =>
            BGM_VOLUME *
            interpolate(f, [0, fps, total - fps * 1.5, total], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      )}
      <ProgressBar total={total} />
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ scene: ResolvedScene; index: number; title: string | null; vertical: boolean }> = ({
  scene,
  index,
  title,
  vertical,
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const unit = width / 1080;
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const zoom = interpolate(frame, [0, scene.durationInFrames], [1.04, 1.14]);
  const titleIn = interpolate(frame, [0, 12, scene.durationInFrames - 10, scene.durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {scene.footage ? (
          <Html5Video
            src={scene.footage.url}
            muted
            loop
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <FallbackBackground index={index} />
        )}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {title && (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: (vertical ? 260 : 110) * unit }}>
          <div
            style={{
              fontFamily: MONTAGE_FONT,
              fontWeight: 800,
              fontSize: (vertical ? 64 : 58) * unit,
              color: "#0b0b0e",
              background: "#FDE047",
              padding: `${12 * unit}px ${28 * unit}px`,
              borderRadius: 14 * unit,
              opacity: titleIn,
              transform: `translateY(${(1 - titleIn) * -30 * unit}px) rotate(-1.5deg)`,
              maxWidth: "86%",
              textAlign: "center",
            }}
          >
            {title}
          </div>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: (vertical ? 420 : 140) * unit }}>
        <AnimatedText text={scene.text} type={scene.animation_type} durationInFrames={scene.durationInFrames} vertical={vertical} />
      </AbsoluteFill>

      <Html5Audio src={staticFile(`audio/sfx/${scene.sfx_type}.wav`)} volume={SFX_VOLUME} />
      {scene.voiceSrc && (
        <Sequence from={4} layout="none">
          <Html5Audio src={scene.voiceSrc} volume={VOICE_VOLUME} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

const PALETTES = [
  ["#1e1b4b", "#7c3aed", "#f472b6"],
  ["#0c4a6e", "#0ea5e9", "#a7f3d0"],
  ["#431407", "#ea580c", "#fde68a"],
  ["#052e16", "#16a34a", "#d9f99d"],
];

/** Used when no stock clip was found (or no Pexels key is configured). */
const FallbackBackground: React.FC<{ index: number }> = ({ index }) => {
  const frame = useCurrentFrame();
  const [a, b, c] = PALETTES[index % PALETTES.length];
  const angle = 140 + frame * 0.6;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${a} 0%, ${b} 60%, ${c} 120%)` }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${50 + Math.sin(frame / 30) * 20}% ${40 + Math.cos(frame / 40) * 15}%, rgba(255,255,255,0.18), transparent 45%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end" }}>
      <div style={{ height: 8, width: `${(frame / total) * 100}%`, background: "#FDE047", opacity: 0.9 }} />
    </AbsoluteFill>
  );
};
