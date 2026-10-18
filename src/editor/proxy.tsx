"use client";

/**
 * Proxy media: big uploads (short side > 720 px, i.e. 1080p / 4K) get a light 540p copy rendered in
 * the browser with @remotion/web-renderer. The preview plays the copy, so scrubbing and playback stay
 * smooth on laptops and phones; export always uses the original file. Copies live for the session
 * only (object URLs) and are rebuilt in the background after a reload.
 */
import { Video } from "@remotion/media";
import React, { useEffect, useSyncExternalStore } from "react";
import { AbsoluteFill } from "remotion";
import { useEditor } from "./store";
import type { MediaAsset } from "./types";

const PROXY_SHORT_SIDE = 540;
const MIN_SHORT_SIDE = 720;
const FPS = 30;

export const needsProxy = (a: MediaAsset) =>
  a.kind === "video" && a.origin === "upload" && !!a.src && !a.proxySrc && Math.min(a.width ?? 0, a.height ?? 0) > MIN_SHORT_SIDE;

// ----- status shared with the UI -----

interface ProxyStatus {
  /** Asset ids waiting or rendering. */
  pending: string[];
  current: string | null;
  progress: number;
}

let status: ProxyStatus = { pending: [], current: null, progress: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<ProxyStatus>) => {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useProxyStatus = () => useSyncExternalStore(subscribe, () => status, () => status);

// ----- rendering -----

const ProxyComposition: React.FC<{ src: string }> = ({ src }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Video src={src} style={{ width: "100%", height: "100%" }} />
  </AbsoluteFill>
);

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

const renderProxy = async (asset: MediaAsset, onProgress: (p: number) => void) => {
  const { renderMediaOnWeb, canRenderMediaOnWeb } = await import("@remotion/web-renderer");
  const w = asset.width ?? 1920;
  const h = asset.height ?? 1080;
  const k = PROXY_SHORT_SIDE / Math.min(w, h);
  const width = even(w * k);
  const height = even(h * k);
  const check = await canRenderMediaOnWeb({ container: "mp4", videoCodec: "h264", width, height, videoBitrate: "low" });
  if (!check.canRender) return null;
  const props = { src: asset.src! };
  const result = await renderMediaOnWeb({
    composition: { component: ProxyComposition, id: "proxy", width, height, fps: FPS, durationInFrames: Math.max(1, Math.ceil(asset.duration * FPS)), defaultProps: props },
    inputProps: props,
    container: "mp4",
    videoCodec: "h264",
    videoBitrate: "low",
    onProgress: (p) => onProgress(p.progress),
    delayRenderTimeoutInMilliseconds: 60000,
  });
  return URL.createObjectURL(await result.getBlob());
};

const queue: string[] = [];
// The worker loop outlives renders: it reads the latest assets / updater through these.
const assetsRef: { current: MediaAsset[] } = { current: [] };
const updateRef: { current: (id: string, patch: Partial<MediaAsset>) => void } = { current: () => {} };
const failed = new Set<string>();
let running = false;

/** Mount once in the editor: watches the assets and builds proxies one at a time. */
export function useProxyQueue() {
  const { assets, updateAsset } = useEditor();

  useEffect(() => {
    let added = false;
    for (const a of assets) {
      if (needsProxy(a) && !queue.includes(a.id) && !failed.has(a.id) && status.current !== a.id) {
        queue.push(a.id);
        added = true;
      }
    }
    if (added) set({ pending: [...queue] });
    if (running || !queue.length) return;

    running = true;
    void (async () => {
      while (queue.length) {
        const id = queue[0];
        const asset = assetsRef.current.find((a) => a.id === id);
        set({ current: id, progress: 0 });
        if (asset && needsProxy(asset)) {
          try {
            const url = await renderProxy(asset, (progress) => set({ progress }));
            if (url) updateRef.current(id, { proxySrc: url });
            else failed.add(id);
          } catch (err) {
            console.warn("Proxy render failed", err);
            failed.add(id);
          }
        }
        queue.shift();
        set({ pending: [...queue], current: null, progress: 0 });
      }
      running = false;
    })();
  }, [assets]);

  assetsRef.current = assets;
  updateRef.current = updateAsset;
}


/** Assets as the preview should see them: proxies swapped in where ready. */
export const withProxies = (assets: MediaAsset[]) => (assets.some((a) => a.proxySrc) ? assets.map((a) => (a.proxySrc ? { ...a, src: a.proxySrc } : a)) : assets);
