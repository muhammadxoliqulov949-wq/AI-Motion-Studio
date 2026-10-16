"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TEXT_TEMPLATES } from "../../catalog/text-templates";
import { computePeaks } from "../../sample-media";
import { insertClip, kindsForClip, makeEffectClip, makeMediaClip, makeStickerClip, makeTextClip, templatePatch } from "../../ops";
import { useEditor } from "../../store";
import type { MediaAsset, Project, TextClip } from "../../types";
import { projectDuration, round } from "../../utils";

const peakJobs = new Set<string>();

/** Decodes same-origin audio once to replace placeholder peaks with the real waveform. */
export const useRealPeaks = () => {
  const { updateAsset } = useEditor();
  return useCallback(
    (asset: MediaAsset) => {
      if (asset.kind !== "audio" || !asset.src || peakJobs.has(asset.id)) return;
      if (/^https?:/.test(asset.src) && !asset.src.startsWith(window.location.origin)) return;
      peakJobs.add(asset.id);
      fetch(asset.src)
        .then((r) => r.arrayBuffer())
        .then(async (buf) => {
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(buf);
          void ctx.close();
          updateAsset(asset.id, { peaks: computePeaks(decoded.getChannelData(0), 400), duration: decoded.duration });
        })
        .catch(() => peakJobs.delete(asset.id));
    },
    [updateAsset],
  );
};

const videoEnd = (p: Project) =>
  p.clips.filter((c) => c.trackId === "V1").reduce((m, c) => Math.max(m, c.start + c.duration), 0);

/** Helpers that add library items to the timeline at the playhead, on a free track. */
export const useInsert = () => {
  const { project, assets, commit, select, playhead, addAssets } = useEditor();
  const realPeaks = useRealPeaks();
  const now = () => round(playhead.getFrame() / project.fps, 3);

  const asset = (a: MediaAsset, at?: number, preferredTrack?: string) => {
    if (!assets.some((x) => x.id === a.id)) addAssets([a]);
    realPeaks(a);
    const start = at ?? now();
    let duration = a.duration;
    if (a.origin === "music") {
      const end = Math.max(videoEnd(project), projectDuration(project));
      if (end - start > 3) duration = Math.min(a.duration, round(end - start, 3));
    }
    const clip = makeMediaClip(a, preferredTrack ?? (a.kind === "audio" ? (a.origin === "sfx" ? "A2" : "A1") : "V1"), start, { duration });
    const preferred = preferredTrack ?? clip.trackId;
    const kinds = a.kind === "audio" ? (["audio"] as const) : preferred === "V1" ? (["video", "overlay"] as const) : kindsForClip(clip, a);
    const next = insertClip(project, clip, [...kinds], preferred);
    commit(next);
    select(clip.id);
    return clip.id;
  };

  const text = (style: string, at?: number, content?: string, extra: Partial<TextClip> = {}) => {
    const clip = makeTextClip(at ?? now(), {
      ...templatePatch(style),
      text: content ?? TEXT_TEMPLATES[style]?.sample ?? "Matn",
      trackId: style.includes("caption") ? "T2" : "T1",
      ...extra,
    });
    commit(insertClip(project, clip, ["text"], clip.trackId));
    select(clip.id);
  };

  const sticker = (id: string, at?: number) => {
    const clip = makeStickerClip(at ?? now(), id);
    commit(insertClip(project, clip, ["sticker"], "S1"));
    select(clip.id);
  };

  const effect = (id: string, at?: number) => {
    const clip = makeEffectClip(at ?? now(), id);
    commit(insertClip(project, clip, ["effect"], "FX1"));
    select(clip.id);
  };

  return { asset, text, sticker, effect, now };
};

/** Single <audio> element shared by every library list for previews. */
let previewAudio: HTMLAudioElement | null = null;
let previewOwner: string | null = null;
const previewListeners = new Set<(id: string | null) => void>();

export const useAudioPreview = () => {
  const [playing, setPlaying] = useState<string | null>(previewOwner);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const l = (id: string | null) => mounted.current && setPlaying(id);
    previewListeners.add(l);
    return () => {
      mounted.current = false;
      previewListeners.delete(l);
    };
  }, []);
  const emit = (id: string | null) => {
    previewOwner = id;
    previewListeners.forEach((l) => l(id));
  };
  const toggle = (id: string, url: string) => {
    if (!previewAudio) {
      previewAudio = new Audio();
      previewAudio.addEventListener("ended", () => emit(null));
    }
    if (previewOwner === id) {
      previewAudio.pause();
      emit(null);
      return;
    }
    previewAudio.src = url;
    previewAudio.currentTime = 0;
    previewAudio.volume = 0.8;
    void previewAudio.play().catch(() => emit(null));
    emit(id);
  };
  const stop = () => {
    previewAudio?.pause();
    emit(null);
  };
  return { playing, toggle, stop };
};
