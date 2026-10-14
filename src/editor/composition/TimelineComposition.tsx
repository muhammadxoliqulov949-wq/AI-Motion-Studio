import React from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Html5Video,
  Img,
  interpolate,
  random,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { sortClips } from "../ops";
import { FILTERS } from "../presets";
import type { Clip, MediaAsset, MediaClip, Project, Track } from "../types";
import { clipEnd } from "../utils";
import { SceneVisual } from "./scenes";
import { TextLayer } from "./TextLayer";

export interface TimelineCompositionProps extends Record<string, unknown> {
  project: Project;
  assets: MediaAsset[];
}

/** Renders the JSON project (tracks + clips) as a Remotion composition. */
export const TimelineComposition: React.FC<TimelineCompositionProps> = ({ project, assets }) => {
  const { fps } = useVideoConfig();
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  // Tracks are listed top-first in the UI; paint bottom-first.
  const visualTracks = [...project.tracks].reverse().filter((t) => t.kind !== "audio" && !t.hidden);
  const audioTracks = project.tracks.filter((t) => t.kind === "audio");

  const renderTrack = (track: Track) => {
    const clips = sortClips(project.clips.filter((c) => c.trackId === track.id));
    return (
      <AbsoluteFill key={track.id}>
        {clips.map((clip, i) => {
          const next = clips[i + 1];
          // Keep the outgoing clip alive underneath the next clip's transition.
          const overlap =
            next && next.transitionIn !== "none" && Math.abs(next.start - clipEnd(clip)) < 0.05
              ? next.transitionDuration
              : 0;
          const from = Math.round(clip.start * fps);
          const duration = Math.max(1, Math.round((clip.duration + overlap) * fps));
          return (
            <Sequence key={clip.id} from={from} durationInFrames={duration} layout="none">
              <ClipLayer clip={clip} asset={clip.type === "media" ? assetMap.get(clip.assetId) : undefined} muted={track.muted} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Footage is graded; titles sit above the grade and letterbox like in an NLE. */}
      <AbsoluteFill style={{ filter: FILTERS[project.grade.filter].css }}>
        {visualTracks.filter((t) => t.kind !== "text").map(renderTrack)}
      </AbsoluteFill>
      {project.grade.vignette && (
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
      )}
      {project.grade.grain && <Grain />}
      {project.grade.letterbox && <Letterbox />}
      {visualTracks.filter((t) => t.kind === "text").map(renderTrack)}
      {audioTracks.map((track) =>
        project.clips
          .filter((c): c is MediaClip => c.trackId === track.id && c.type === "media")
          .map((clip) => {
            const asset = assetMap.get(clip.assetId);
            if (!asset?.src) return null;
            return (
              <Sequence key={clip.id} from={Math.round(clip.start * fps)} durationInFrames={Math.max(1, Math.round(clip.duration * fps))} layout="none">
                <Html5Audio
                  src={asset.src}
                  trimBefore={Math.round(clip.in * fps)}
                  playbackRate={clip.speed}
                  volume={(f) => (track.muted ? 0 : clip.volume * interpolate(f, [0, fps * 0.5, clip.duration * fps - fps, clip.duration * fps], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))}
                />
              </Sequence>
            );
          }),
      )}
    </AbsoluteFill>
  );
};

const ClipLayer: React.FC<{ clip: Clip; asset?: MediaAsset; muted: boolean }> = ({ clip, asset, muted }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (clip.type === "text") {
    return (
      <AbsoluteFill style={transitionStyle(clip, frame, fps)}>
        <TextLayer clip={clip} />
      </AbsoluteFill>
    );
  }
  if (!asset) return null;

  const t = clip.in + (frame / fps) * clip.speed;
  const motion = motionTransform(clip, frame, fps);
  const transition = transitionStyle(clip, frame, fps);
  const clipFilter = FILTERS[clip.filter].css;

  let media: React.ReactNode = null;
  if (asset.scene) {
    media = <SceneVisual scene={asset.scene} t={t} />;
  } else if (asset.kind === "video" && asset.src) {
    media = (
      <Html5Video
        src={asset.src}
        trimBefore={Math.round(clip.in * fps)}
        playbackRate={clip.speed}
        volume={muted ? 0 : clip.volume}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  } else if (asset.kind === "image" && asset.src) {
    media = <Img src={asset.src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }

  return (
    <AbsoluteFill
      style={{
        ...transition,
        opacity: ((transition.opacity as number | undefined) ?? 1) * clip.opacity,
        filter: [clipFilter === "none" ? "" : clipFilter, transition.filter ?? ""].join(" ").trim() || undefined,
      }}
    >
      <AbsoluteFill style={{ transform: `${motion} scale(${clip.scale})`, overflow: "hidden" }}>{media}</AbsoluteFill>
    </AbsoluteFill>
  );
};

const transitionStyle = (clip: Clip, frame: number, fps: number): React.CSSProperties => {
  if (clip.transitionIn === "none") return {};
  const p = interpolate(frame, [0, clip.transitionDuration * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - p, 3);
  switch (clip.transitionIn) {
    case "fade":
      return { opacity: eased };
    case "slide":
      return { transform: `translateX(${(1 - eased) * 100}%)` };
    case "zoom":
      return { opacity: eased, transform: `scale(${1.4 - 0.4 * eased})` };
    case "blur":
      return { opacity: eased, filter: `blur(${(1 - eased) * 30}px)` };
    case "wipe":
      return { clipPath: `inset(0 ${(1 - eased) * 100}% 0 0)` };
  }
};

const motionTransform = (clip: MediaClip, frame: number, fps: number) => {
  const total = clip.duration * fps;
  switch (clip.motion) {
    case "ken-burns":
      return `scale(${interpolate(frame, [0, total], [1, 1.18], { extrapolateRight: "clamp" })}) translateX(${interpolate(frame, [0, total], [0, -2], { extrapolateRight: "clamp" })}%)`;
    case "punch-in": {
      const k = interpolate(frame, [total * 0.45, total * 0.45 + 4], [1, 1.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return `scale(${k})`;
    }
    case "shake":
      return `translate(${(random(`x${frame}`) - 0.5) * 14}px, ${(random(`y${frame}`) - 0.5) * 14}px) scale(1.04)`;
    case "drift":
      return `scale(1.08) translateX(${interpolate(frame, [0, total], [-3, 3])}%)`;
    default:
      return "";
  }
};

const Letterbox: React.FC = () => {
  const { height, width } = useVideoConfig();
  // Crop to 2.39:1 inside the current frame.
  const target = width / 2.39;
  const bar = Math.max(0, (height - target) / 2);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: bar, background: "#000" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: bar, background: "#000" }} />
    </AbsoluteFill>
  );
};

const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: 0.12, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ transform: `translate(${(frame * 37) % 50}px, ${(frame * 23) % 50}px) scale(1.1)` }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
