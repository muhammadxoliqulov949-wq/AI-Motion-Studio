import { Audio, Video } from "@remotion/media";
import React, { useMemo } from "react";
import { AbsoluteFill, Freeze, Img, interpolate, random, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { animTransform, clipAnimState } from "../catalog/animations";
import { EFFECTS } from "../catalog/effects";
import { adjustCss, filterCss } from "../catalog/filters";
import { transitionDef } from "../catalog/transitions";
import { valueAt } from "../keyframes";
import { sortClips } from "../ops";
import { SPEED_CURVES } from "../presets";
import type { ChromaKey, Clip, EffectClip, MediaAsset, MediaClip, Mask, Project, ProjectBackground, Track, VisualClip } from "../types";
import { clipEnd } from "../utils";
import { EffectOverlay, Grain } from "./EffectLayer";
import { SceneVisual } from "./scenes";
import { StickerLayer } from "./StickerLayer";
import { TextLayer } from "./TextLayer";

export interface TimelineCompositionProps extends Record<string, unknown> {
  project: Project;
  assets: MediaAsset[];
}

export const DEFAULT_BACKGROUND: ProjectBackground = { type: "color", color: "#000000", blur: 40 };

interface ExitTransition {
  id: string;
  duration: number;
}

type Style = React.CSSProperties;

/** Merges transition/effect styles: transforms and filters stack, opacities multiply. */
const mergeStyles = (...styles: Style[]): Style => {
  const out: Style = {};
  const transforms: string[] = [];
  const filters: string[] = [];
  let opacity = 1;
  for (const s of styles) {
    if (!s) continue;
    const { transform, filter, opacity: o, ...rest } = s;
    if (transform) transforms.push(String(transform));
    if (filter) filters.push(String(filter));
    if (o !== undefined) opacity *= Number(o);
    Object.assign(out, rest);
  }
  if (transforms.length) out.transform = transforms.join(" ");
  if (filters.length) out.filter = filters.join(" ");
  if (opacity !== 1) out.opacity = opacity;
  return out;
};

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** Renders the JSON project (tracks + clips) as a Remotion composition. */
export const TimelineComposition: React.FC<TimelineCompositionProps> = ({ project, assets }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const unit = Math.min(width, height) / 1080;
  const t = frame / fps;
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const bg = project.background ?? DEFAULT_BACKGROUND;

  // Tracks are listed top-first in the UI; paint bottom-first.
  const bottomFirst = [...project.tracks].reverse();
  const footageTracks = bottomFirst.filter((tr) => (tr.kind === "video" || tr.kind === "overlay") && !tr.hidden);
  const topTracks = bottomFirst.filter((tr) => (tr.kind === "text" || tr.kind === "sticker") && !tr.hidden);
  const effectTrackIds = new Set(project.tracks.filter((tr) => tr.kind === "effect" && !tr.hidden).map((tr) => tr.id));
  const activeEffects = project.clips.filter(
    (c): c is EffectClip => c.type === "effect" && effectTrackIds.has(c.trackId) && t >= c.start && t < clipEnd(c),
  );

  const effectFootage = mergeStyles(
    ...activeEffects.map((c) => {
      const def = EFFECTS[c.effect];
      const f = def?.footage?.(t - c.start, c.duration, c.intensity, frame);
      return f ? { transform: f.transform, filter: f.filter, opacity: f.opacity } : {};
    }),
  );

  const renderTrack = (track: Track) => {
    const clips = sortClips(project.clips.filter((c) => c.trackId === track.id));
    return (
      <AbsoluteFill key={track.id}>
        {clips.map((clip, i) => {
          const next = clips[i + 1];
          // Keep the outgoing clip alive underneath the next clip's transition.
          const exit: ExitTransition | undefined =
            next && next.transitionIn !== "none" && Math.abs(next.start - clipEnd(clip)) < 0.05
              ? { id: next.transitionIn, duration: next.transitionDuration }
              : undefined;
          const from = Math.round(clip.start * fps);
          const duration = Math.max(1, Math.round((clip.duration + (exit?.duration ?? 0)) * fps));
          const asset = clip.type === "media" ? assetMap.get(clip.assetId) : undefined;
          return (
            <Sequence key={clip.id} from={from} durationInFrames={duration} layout="none">
              <ClipLayer clip={clip} asset={asset} track={track} exit={exit} background={bg} unit={unit} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    );
  };

  const bgStyle: Style =
    bg.type === "gradient" && bg.gradient ? { background: bg.gradient } : { backgroundColor: bg.type === "color" ? bg.color : "#000" };

  return (
    <AbsoluteFill style={bgStyle}>
      {/* Footage is graded + affected by effects; titles and stickers sit above like in an NLE. */}
      <AbsoluteFill style={{ ...effectFootage, filter: [filterCss(project.grade.filter), effectFootage.filter ?? ""].join(" ").trim() || undefined }}>
        {footageTracks.map(renderTrack)}
      </AbsoluteFill>
      {project.grade.vignette && (
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
      )}
      {project.grade.grain && <Grain />}
      {activeEffects
        .filter((c) => EFFECTS[c.effect]?.overlay)
        .map((c) => (
          <EffectOverlay key={c.id} id={EFFECTS[c.effect].overlay!} t={t - c.start} duration={c.duration} k={c.intensity} frame={frame} seed={c.id} />
        ))}
      {project.grade.letterbox && <Letterbox />}
      {topTracks.map(renderTrack)}
      <AudioTracks project={project} assetMap={assetMap} />
    </AbsoluteFill>
  );
};

const AudioTracks: React.FC<{ project: Project; assetMap: Map<string, MediaAsset> }> = ({ project, assetMap }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {project.tracks
        .filter((tr) => tr.kind === "audio")
        .map((track) =>
          project.clips
            .filter((c): c is MediaClip => c.trackId === track.id && c.type === "media")
            .map((clip) => {
              const asset = assetMap.get(clip.assetId);
              if (!asset?.src || track.muted) return null;
              return (
                <Sequence
                  key={clip.id}
                  from={Math.round(clip.start * fps)}
                  durationInFrames={Math.max(1, Math.round(clip.duration * fps))}
                  layout="none"

                >
                  <Audio
                    src={asset.src}
                    trimBefore={Math.round(clip.in * fps)}
                    playbackRate={clip.speed}
                    volume={(f) => audioVolume(clip, f / fps, true)}
                  />
                </Sequence>
              );
            }),
        )}
    </>
  );
};

/** Clip volume at `t` seconds into the clip including keyframes and fades. */
const audioVolume = (clip: MediaClip, t: number, isAudioTrack: boolean) => {
  const fadeIn = clip.fadeIn ?? (isAudioTrack ? 0.5 : 0);
  const fadeOut = clip.fadeOut ?? (isAudioTrack ? 1 : 0);
  let k = 1;
  if (fadeIn > 0) k *= Math.min(1, t / fadeIn);
  if (fadeOut > 0) k *= Math.min(1, Math.max(0, (clip.duration - t) / fadeOut));
  const v = clip.keyframes?.volume?.length ? valueAt(clip, "volume", t) : clip.volume;
  return Math.max(0, Math.min(2, v * k));
};

const transitionStyles = (clip: Clip, exit: ExitTransition | undefined, t: number) => {
  const styles: Style[] = [];
  let flash = 0;
  let flashColor = "#fff";
  if (clip.transitionIn !== "none" && t < clip.transitionDuration) {
    const def = transitionDef(clip.transitionIn);
    const p = easeInOut(Math.max(0, t / Math.max(0.01, clip.transitionDuration)));
    styles.push(def.enter(p));
    if (def.flash) {
      flash = 1 - Math.abs(p - 0.5) * 2;
      flashColor = def.flash;
    }
  }
  if (exit && t > clip.duration) {
    const def = transitionDef(exit.id);
    const p = easeInOut(Math.min(1, (t - clip.duration) / Math.max(0.01, exit.duration)));
    if (def.exit) styles.push(def.exit(p));
  }
  return { style: mergeStyles(...styles), flash, flashColor };
};

/** Source time (seconds) for a media clip at `t` seconds into it, honouring speed curves + reverse. */
export const sourceTime = (clip: MediaClip, t: number) => {
  const span = clip.duration * clip.speed;
  let u = Math.max(0, Math.min(1, t / Math.max(0.001, clip.duration)));
  const curve = clip.speedCurve && clip.speedCurve !== "none" ? SPEED_CURVES[clip.speedCurve]?.points : null;
  if (curve) {
    // Integrate the piecewise-linear speed curve and normalise so the clip covers the same source span.
    const seg = curve.length - 1;
    const area = (x: number) => {
      let acc = 0;
      for (let i = 0; i < seg; i++) {
        const a = i / seg;
        const b = (i + 1) / seg;
        if (x <= a) break;
        const e = Math.min(x, b);
        const va = curve[i];
        const vb = curve[i] + ((curve[i + 1] - curve[i]) * (e - a)) / (b - a);
        acc += ((va + vb) / 2) * (e - a);
      }
      return acc;
    };
    u = area(u) / area(1);
  }
  const offset = u * span;
  return clip.reverse ? clip.in + span - offset : clip.in + offset;
};

const maskStyle = (mask: Mask | undefined): Style => {
  if (!mask || mask.shape === "none") return {};
  const size = Math.max(0.02, mask.size);
  const f = Math.max(0, mask.feather);
  const cx = 50 + mask.x * 50;
  const cy = 50 + mask.y * 50;
  const inside = mask.invert ? "transparent" : "#000";
  const outside = mask.invert ? "#000" : "transparent";
  let image = "";
  let clipPath: string | undefined;
  switch (mask.shape) {
    case "circle":
      image = `radial-gradient(circle at ${cx}% ${cy}%, ${inside} ${size * 50 * (1 - f)}%, ${outside} ${size * 50 + f * 10}%)`;
      break;
    case "linear":
      image = `linear-gradient(${180 + mask.rotation}deg, ${inside} ${cy - f * 20}%, ${outside} ${cy + f * 20}%)`;
      break;
    case "mirror": {
      const h = size * 50;
      image = `linear-gradient(${90 + mask.rotation}deg, ${outside} ${cy - h - f * 15}%, ${inside} ${cy - h + f * 15}%, ${inside} ${cy + h - f * 15}%, ${outside} ${cy + h + f * 15}%)`;
      break;
    }
    case "rect": {
      const half = size * 50;
      clipPath = `inset(${Math.max(0, cy - half)}% ${Math.max(0, 100 - cx - half)}% ${Math.max(0, 100 - cy - half)}% ${Math.max(0, cx - half)}% round ${f * 20}%)`;
      break;
    }
    case "star":
    case "heart":
    case "diamond": {
      const pts = SHAPE_POINTS[mask.shape].map(([x, y]) => `${cx + (x - 50) * size}% ${cy + (y - 50) * size}%`);
      clipPath = `polygon(${pts.join(",")})`;
      break;
    }
  }
  return {
    ...(image ? { maskImage: image, WebkitMaskImage: image } : {}),
    ...(clipPath ? { clipPath } : {}),
  };
};

const SHAPE_POINTS: Record<"star" | "heart" | "diamond", [number, number][]> = {
  star: [[50, 2], [62, 36], [98, 37], [69, 58], [79, 94], [50, 73], [21, 94], [31, 58], [2, 37], [38, 36]],
  diamond: [[50, 0], [100, 50], [50, 100], [0, 50]],
  heart: [[50, 95], [10, 58], [2, 38], [6, 20], [18, 8], [34, 6], [50, 20], [66, 6], [82, 8], [94, 20], [98, 38], [90, 58]],
};

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Linear chroma key: alpha falls off along the key colour's chroma direction (feColorMatrix). */
const ChromaFilter: React.FC<{ id: string; chroma: ChromaKey }> = ({ id, chroma }) => {
  const k = hexToRgb(chroma.color);
  const mean = (k[0] + k[1] + k[2]) / 3;
  const d = k.map((v) => v - mean);
  const len2 = Math.max(0.01, d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  const gain = 1 / (chroma.smoothness * 0.5 + 0.04);
  const thr = 1 - chroma.similarity;
  const a = d.map((v) => (-gain * v) / len2);
  const dom = d.indexOf(Math.max(...d));
  const s = chroma.spill * 0.5;
  const rows = [0, 1, 2].map((c) => {
    if (c !== dom) return [c === 0 ? 1 : 0, c === 1 ? 1 : 0, c === 2 ? 1 : 0, 0, 0];
    const row = [0, 0, 0, 0, 0];
    row[c] = 1 - s;
    [0, 1, 2].filter((o) => o !== c).forEach((o) => (row[o] = s / 2));
    return row;
  });
  const values = [...rows.flat(), a[0], a[1], a[2], 0, 1 + gain * thr].map((v) => v.toFixed(4)).join(" ");
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={values} />
      </filter>
    </svg>
  );
};

const ClipLayer: React.FC<{ clip: Clip; asset?: MediaAsset; track: Track; exit?: ExitTransition; background: ProjectBackground; unit: number }> = ({
  clip,
  asset,
  track,
  exit,
  background,
  unit,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (clip.type === "effect") return null;
  const t = frame / fps;
  const tr = transitionStyles(clip, exit, t);
  const visual = clip as VisualClip;

  // Keyframed transform + clip animations.
  const x = valueAt(clip, "x", Math.min(t, clip.duration));
  const y = valueAt(clip, "y", Math.min(t, clip.duration));
  const scale = valueAt(clip, "scale", Math.min(t, clip.duration));
  const rotation = valueAt(clip, "rotation", Math.min(t, clip.duration));
  const opacity = valueAt(clip, "opacity", Math.min(t, clip.duration));
  const anim = clipAnimState(Math.min(t, clip.duration), clip.duration, visual);
  const flip = `${visual.flipH ? "scaleX(-1)" : ""} ${visual.flipV ? "scaleY(-1)" : ""}`.trim();
  const userTransform = [
    x || y ? `translate(${x}%, ${y}%)` : "",
    rotation ? `rotate(${rotation}deg)` : "",
    scale !== 1 ? `scale(${scale})` : "",
    flip,
    animTransform(anim),
  ]
    .filter(Boolean)
    .join(" ");

  const flashLayer = tr.flash > 0 ? <AbsoluteFill style={{ background: tr.flashColor, opacity: tr.flash }} /> : null;
  const blend = visual.blendMode && visual.blendMode !== "normal" ? (visual.blendMode as React.CSSProperties["mixBlendMode"]) : undefined;

  if (clip.type === "text" || clip.type === "sticker") {
    return (
      <AbsoluteFill style={{ ...tr.style, opacity: (Number(tr.style.opacity ?? 1)) * opacity * anim.opacity, mixBlendMode: blend }}>
        <AbsoluteFill style={{ transform: userTransform || undefined, filter: anim.blur ? `blur(${anim.blur * unit}px)` : undefined }}>
          {clip.type === "text" ? <TextLayer clip={clip} /> : <StickerLayer clip={clip} />}
        </AbsoluteFill>
        {flashLayer}
      </AbsoluteFill>
    );
  }
  if (!asset) return null;

  const mediaT = Math.min(t, clip.duration);
  const timeMapped = !!clip.reverse || (!!clip.speedCurve && clip.speedCurve !== "none");
  const srcT = sourceTime(clip, mediaT);
  const fit = clip.fit ?? "cover";
  const filter = [
    filterCss(clip.filter, clip.filterIntensity ?? 1),
    adjustCss(clip.adjust, unit),
    anim.blur ? `blur(${anim.blur * unit}px)` : "",
    clip.chroma?.enabled ? `url(#ck-${clip.id})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const crop = clip.crop;
  const cropPath =
    crop && (crop.top || crop.right || crop.bottom || crop.left)
      ? `inset(${crop.top * 100}% ${crop.right * 100}% ${crop.bottom * 100}% ${crop.left * 100}%)`
      : undefined;
  const mStyle = maskStyle(clip.mask);
  const clipPath = [cropPath, mStyle.clipPath].filter(Boolean)[0];
  const motion = motionTransform(clip, frame, fps);
  const vignette = clip.adjust?.vignette ?? 0;
  const muted = track.muted;

  const renderMedia = (objectFit: "cover" | "contain" | "fill", silent: boolean) => {
    if (asset.scene) return <SceneVisual scene={asset.scene} t={srcT} />;
    if (asset.kind === "image" && asset.src) return <Img src={asset.src} style={{ width: "100%", height: "100%", objectFit }} />;
    if (asset.kind === "video" && asset.src) {
      if (timeMapped) {
        return (
          <Freeze frame={Math.max(0, Math.round(srcT * fps))}>
            <Video src={asset.src} muted objectFit={objectFit} style={{ width: "100%", height: "100%" }} />
          </Freeze>
        );
      }
      return (
        <Video
          src={asset.src}
          trimBefore={Math.round(clip.in * fps)}
          playbackRate={clip.speed}
          muted={silent || muted}
          volume={silent ? 0 : (f) => audioVolume(clip, f / fps, false)}
          objectFit={objectFit}
          style={{ width: "100%", height: "100%" }}
        />
      );
    }
    return null;
  };

  const showBlurBg = track.kind === "video" && background.type === "blur" && (fit === "contain" || scale < 1 || x !== 0 || y !== 0);

  return (
    <AbsoluteFill style={{ ...tr.style, opacity: Number(tr.style.opacity ?? 1) * opacity * anim.opacity * clip.opacity, mixBlendMode: blend }}>
      {showBlurBg && (
        <AbsoluteFill style={{ filter: `blur(${background.blur * unit}px) brightness(0.8)`, transform: "scale(1.15)" }}>{renderMedia("cover", true)}</AbsoluteFill>
      )}
      {clip.chroma?.enabled && <ChromaFilter id={`ck-${clip.id}`} chroma={clip.chroma} />}
      <AbsoluteFill style={{ transform: userTransform || undefined }}>
        <AbsoluteFill style={{ clipPath, maskImage: mStyle.maskImage, WebkitMaskImage: mStyle.WebkitMaskImage, filter: filter || undefined, overflow: "hidden" }}>
          <AbsoluteFill style={{ transform: motion || undefined }}>{renderMedia(fit, false)}</AbsoluteFill>
          {vignette > 0 && (
            <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent ${60 - vignette * 30}%, rgba(0,0,0,${0.4 + vignette * 0.5}) 100%)` }} />
          )}
        </AbsoluteFill>
      </AbsoluteFill>
      {flashLayer}
    </AbsoluteFill>
  );
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
