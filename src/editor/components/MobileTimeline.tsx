"use client";

import { Plus } from "lucide-react";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useEditor } from "../store";
import type { TrackKind } from "../types";
import { clamp, projectDuration } from "../utils";
import { ClipView, Ruler, RULER_H, TRACK_ICON } from "./Timeline";
import { useClipDrag } from "./use-clip-drag";

/** Lane heights on phones: the main video track is the tallest, like CapCut. */
const LANE_H: Record<TrackKind, number> = { effect: 30, sticker: 34, text: 34, overlay: 44, video: 58, audio: 40 };

/**
 * CapCut-mobile timeline: the playhead stays fixed in the middle and the timeline scrolls under it.
 * Scroll (swipe) to seek, pinch to zoom, tap a clip to select it, drag the selected clip to move it,
 * and drag its white handles to trim.
 */
export function MobileTimeline({ onAddMedia }: { onAddMedia: () => void }) {
  const { project, assets, selectedId, select, seek, playhead, playerRef } = useEditor();
  const total = projectDuration(project);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(40);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const [width, setWidth] = useState(0);
  const half = Math.round(width / 2);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const selfSeek = useRef(false);
  const { startClipDrag } = useClipDrag({ pps, snap: true, assetMap });

  const usedTracks = new Set(project.clips.map((c) => c.trackId));
  const visibleTracks = project.tracks.filter((t) => t.id === "V1" || usedTracks.has(t.id));
  const contentW = Math.max(total, 1) * pps;
  const v1Top = RULER_H + visibleTracks.slice(0, visibleTracks.findIndex((t) => t.id === "V1")).reduce((s, t) => s + LANE_H[t.kind], 0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the whole edit on first layout and when its length changes a lot (e.g. after an AI pass).
  const fittedFor = useRef(-100);
  useEffect(() => {
    if (!width || Math.abs(total - fittedFor.current) <= 3) return;
    fittedFor.current = total;
    setPps(clamp((width * 0.9) / Math.max(total, 4), 6, 300));
  }, [total, width]);

  // Swiping the timeline seeks (only while paused; during playback the timeline follows the player).
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || playhead.getPlaying()) return;
    const t = el.scrollLeft / ppsRef.current;
    if (Math.abs(Math.round(t * project.fps) - playhead.getFrame()) < 1) return;
    // Mark the seek as ours so the follower does not snap the scroll back to a whole frame mid-swipe.
    selfSeek.current = true;
    seek(Math.min(t, total));
    selfSeek.current = false;
  };

  // Touching the timeline pauses playback (CapCut behaviour); two fingers pinch-zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let pinch: { dist: number; pps: number } | null = null;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (playhead.getPlaying()) playerRef.current?.pause();
      if (e.touches.length === 2) pinch = { dist: distance(e.touches), pps: ppsRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      setPps(clamp(pinch.pps * (distance(e.touches) / pinch.dist), 6, 300));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setPps((p) => clamp(p * (e.deltaY < 0 ? 1.15 : 0.87), 6, 300));
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [playhead, playerRef]);

  return (
    <div className="relative h-full select-none bg-[#0b0b0e]">
      <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0 overflow-auto no-scrollbar overscroll-contain">
        <div className="relative" style={{ width: contentW + half * 2, minHeight: "100%" }}>
          <div className="sticky top-0 z-20" style={{ marginLeft: half, width: contentW }}>
            <Ruler pps={pps} width={contentW} onPointerDown={() => {}} />
          </div>
          {visibleTracks.map((track) => (
            <div key={track.id} className="relative" style={{ height: LANE_H[track.kind] }} onClick={() => select(null)}>
              <div className={cn("absolute top-1/2 -translate-y-1/2 flex items-center justify-end pr-2 text-white/25", track.hidden && "opacity-40")} style={{ width: half }}>
                {React.createElement(TRACK_ICON[track.kind], { className: "size-3.5" })}
              </div>
              <div data-track-id={track.id} className={cn("absolute top-0 bottom-0", track.kind === "video" && "bg-white/[0.02]", track.hidden && "opacity-40")} style={{ left: half, width: contentW }}>
                {project.clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => (
                    <ClipView
                      key={clip.id}
                      clip={clip}
                      track={track}
                      asset={clip.type === "media" ? assetMap.get(clip.assetId) : undefined}
                      pps={pps}
                      height={LANE_H[track.kind]}
                      selected={clip.id === selectedId}
                      touch
                      onTap={() => select(clip.id)}
                      onPointerDown={(e, kind) => {
                        // Unselected clips only get selected on tap, so swiping over them still scrolls.
                        if (kind === "move" && clip.id !== selectedId) return;
                        startClipDrag(e, clip, kind, track);
                      }}
                    />
                  ))}
              </div>
            </div>
          ))}
          <div className="h-10" onClick={() => select(null)} />
        </div>
        <ScrollFollower scrollRef={scrollRef} pps={pps} width={width} selfSeek={selfSeek} />
      </div>

      {/* Fixed centre playhead */}
      <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -ml-px bg-white z-30 pointer-events-none shadow-[0_0_6px_rgba(0,0,0,0.8)]">
        <div className="absolute -left-[5px] top-0 w-3 h-3 rounded-full bg-white" />
      </div>

      <button
        onClick={onAddMedia}
        className="absolute right-2 z-30 size-9 grid place-items-center rounded-lg bg-white text-black shadow-lg active:scale-95"
        style={{ top: v1Top + (LANE_H.video - 36) / 2 }}
        title="Media qo'shish"
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}

/** Keeps the scroll position in sync with the playhead (playback, transport buttons, zoom changes). */
function ScrollFollower({ scrollRef, pps, width, selfSeek }: { scrollRef: React.RefObject<HTMLDivElement | null>; pps: number; width: number; selfSeek: React.RefObject<boolean> }) {
  const { playhead, project } = useEditor();
  useEffect(() => {
    const sync = () => {
      const el = scrollRef.current;
      if (!el) return;
      const x = (playhead.getFrame() / project.fps) * pps;
      if (Math.abs(el.scrollLeft - x) > 1) el.scrollLeft = x;
    };
    sync();
    const unsubscribe = playhead.subscribe(() => {
      if (!selfSeek.current) sync();
    });
    return () => {
      unsubscribe();
    };
    // width: the side padding (half the width) only exists once the container has been measured.
  }, [scrollRef, pps, width, playhead, project.fps, selfSeek]);
  return null;
}
