import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import React, { useEffect, useState } from "react";
import { AbsoluteFill, AnimatedImage, continueRender, delayRender, Img, useVideoConfig } from "remotion";
import { isSafeSvg } from "../catalog/icons";
import { motionPreset } from "../catalog/motion-presets";
import { emojiByName, emojiLottieUrl, shapeById } from "../catalog/stickers";
import type { StickerClip } from "../types";
import { MotionSticker } from "./MotionSticker";

/**
 * GIPHY stickers / GIFs. Where the browser has ImageDecoder (Chrome, Edge, the export renderers) the
 * GIF is decoded frame by frame, so preview and export match exactly; elsewhere (e.g. iOS Safari)
 * the browser animates the <img> itself, which is fine for preview.
 */
const canDecode = typeof window !== "undefined" && "ImageDecoder" in window;

const GifSticker: React.FC<{ src: string; width: number; height: number }> = ({ src, width, height }) =>
  canDecode ? (
    <AnimatedImage src={src} width={width} height={height} fit="contain" loopBehavior="loop" />
  ) : (
    <Img src={src} style={{ width, height, objectFit: "contain" }} />
  );

const lottieCache = new Map<string, Promise<LottieAnimationData>>();

const fetchLottie = (url: string) => {
  let p = lottieCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Lottie ${r.status}`);
      return r.json();
    });
    lottieCache.set(url, p);
  }
  return p;
};

const EmojiLottie: React.FC<{ codepoint: string; fallback: string; size: number }> = ({ codepoint, fallback, size }) => {
  const url = emojiLottieUrl(codepoint);
  const [data, setData] = useState<LottieAnimationData | null>(null);
  const [failed, setFailed] = useState(false);
  const [handle] = useState(() => delayRender(`emoji ${codepoint}`, { timeoutInMilliseconds: 20000 }));
  useEffect(() => {
    let alive = true;
    fetchLottie(url)
      .then((json) => alive && setData(json))
      .catch(() => alive && setFailed(true))
      .finally(() => continueRender(handle));
    return () => {
      alive = false;
    };
  }, [url, handle]);
  if (failed || !data) {
    return <div style={{ fontSize: size * 0.8, lineHeight: 1, opacity: failed ? 1 : 0 }}>{fallback}</div>;
  }
  return <Lottie animationData={data} loop style={{ width: size, height: size }} />;
};

export const StickerLayer: React.FC<{ clip: StickerClip }> = ({ clip }) => {
  const { width, height } = useVideoConfig();
  const size = Math.min(width, height) * 0.28;
  const [kind, value] = clip.sticker.split(/:(.+)/);
  let content: React.ReactNode = null;
  if (kind === "emoji") {
    const e = emojiByName(value);
    content = e ? <EmojiLottie codepoint={e.codepoint} fallback={e.char} size={size} /> : null;
  } else if (kind === "char") {
    content = <div style={{ fontSize: size * 0.8, lineHeight: 1 }}>{value}</div>;
  } else if (kind === "gif" && clip.src) {
    // Keep the GIF's own proportions inside a box about the size of other stickers.
    const aspect = clip.aspect ?? 1;
    const w = aspect >= 1 ? size * 1.3 : size * 1.3 * aspect;
    content = <GifSticker src={clip.src} width={w} height={w / aspect} />;
  } else if (kind === "icon" && clip.src && isSafeSvg(clip.src)) {
    content = (
      <div
        style={{ width: size, height: size, color: clip.color ?? "#ffffff", lineHeight: 0 }}
        // Iconify SVGs declare width/height="1em": sizing the font scales the icon to the box.
        dangerouslySetInnerHTML={{ __html: clip.src.replace(/swidth="[^"]*"/, ' width="100%"').replace(/sheight="[^"]*"/, ' height="100%"') }}
      />
    );
  } else if (kind === "motion" && motionPreset(value)) {
    content = <MotionSticker id={value} color={clip.color} size={size * 0.8} />;
  } else if (kind === "shape") {
    const shape = shapeById(value);
    content = shape ? (
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ color: clip.color ?? shape.defaultColor, overflow: "visible" }}
        dangerouslySetInnerHTML={{ __html: shape.svg }}
      />
    ) : null;
  }
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>{content}</AbsoluteFill>;
};

