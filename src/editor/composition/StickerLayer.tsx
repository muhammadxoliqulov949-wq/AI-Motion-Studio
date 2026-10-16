import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useVideoConfig } from "remotion";
import { emojiByName, emojiLottieUrl, shapeById } from "../catalog/stickers";
import type { StickerClip } from "../types";

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

