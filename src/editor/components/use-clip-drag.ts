"use client";

import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { kindsForClip, updateClip } from "../ops";
import { useEditor } from "../store";
import type { Clip, MediaAsset, Track } from "../types";
import { clamp, clipEnd, round } from "../utils";

export type ClipDragKind = "move" | "trim-l" | "trim-r";

type Drag = { kind: ClipDragKind; clip: Clip; x0: number; moved: boolean } | { kind: "scrub" };

/**
 * Move / trim clips with the pointer (mouse or finger), with snapping to clip edges and the playhead.
 * Shared by the desktop timeline and the mobile timeline.
 */
export function useClipDrag({
  pps,
  snap,
  assetMap,
  onScrub,
}: {
  pps: number;
  snap: boolean;
  assetMap: Map<string, MediaAsset>;
  /** Called while scrubbing (after `startScrub`). */
  onScrub?: (clientX: number) => void;
}) {
  const { project, select, preview, checkpoint, playhead } = useEditor();
  const dragRef = useRef<Drag | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;

  const snapTime = useCallback(
    (t: number, ignoreId: string) => {
      if (!snap) return t;
      const points = [0, playhead.getFrame() / project.fps];
      for (const c of projectRef.current.clips) {
        if (c.id === ignoreId) continue;
        points.push(c.start, clipEnd(c));
      }
      const threshold = 8 / pps;
      let best = t;
      let dist = threshold;
      for (const p of points) {
        if (Math.abs(p - t) < dist) {
          dist = Math.abs(p - t);
          best = p;
        }
      }
      return best;
    },
    [snap, pps, playhead, project.fps],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "scrub") {
        onScrubRef.current?.(e.clientX);
        return;
      }
      const dt = (e.clientX - drag.x0) / pps;
      if (!drag.moved) {
        if (Math.abs(e.clientX - drag.x0) < 3) return;
        drag.moved = true;
        checkpoint();
      }
      const { clip } = drag;
      const current = projectRef.current;
      let trackId = clip.trackId;
      if (drag.kind === "move") {
        // Cross-track dragging: drop onto any compatible lane under the pointer.
        const lane = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.trackId) as HTMLElement | undefined;
        const target = lane && current.tracks.find((t) => t.id === lane.dataset.trackId);
        const asset = clip.type === "media" ? assetMap.get(clip.assetId) : undefined;
        if (target && !target.locked && kindsForClip(clip, asset).includes(target.kind)) trackId = target.id;
      }
      const siblings = current.clips.filter((c) => c.trackId === trackId && c.id !== clip.id);

      let patch: Partial<Clip> = {};
      if (drag.kind === "move") {
        const raw = Math.max(0, clip.start + dt);
        const headSnap = snapTime(raw, clip.id);
        let start = headSnap !== raw ? headSnap : snapTime(raw + clip.duration, clip.id) - clip.duration;
        const prevEnd = siblings.filter((c) => clipEnd(c) <= start + clip.duration / 2).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
        const nextStart = siblings.filter((c) => c.start >= start + clip.duration / 2).reduce((m, c) => Math.min(m, c.start), Infinity);
        if (nextStart - prevEnd < clip.duration - 0.001) return; // no room on that lane
        start = clamp(start, prevEnd, nextStart - clip.duration);
        patch = { start: round(start, 3), trackId };
      } else {
        const prevEnd = siblings.filter((c) => clipEnd(c) <= clip.start + 0.001).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
        const nextStart = siblings.filter((c) => c.start >= clipEnd(clip) - 0.001).reduce((m, c) => Math.min(m, c.start), Infinity);
        if (drag.kind === "trim-l") {
          const minD = clip.type === "media" ? -clip.in / clip.speed : -Infinity;
          let d = snapTime(clip.start + dt, clip.id) - clip.start;
          d = clamp(d, Math.max(minD, prevEnd - clip.start), clip.duration - 0.2);
          patch = {
            start: round(clip.start + d, 3),
            duration: round(clip.duration - d, 3),
            ...(clip.type === "media" ? { in: round(clip.in + d * clip.speed, 3) } : {}),
          };
        } else {
          const asset = clip.type === "media" ? assetMap.get(clip.assetId) : undefined;
          const maxD = clip.type === "media" && asset && asset.kind !== "image" && !clip.reverse ? (asset.duration - clip.in) / clip.speed : Infinity;
          let end = snapTime(clipEnd(clip) + dt, clip.id);
          end = clamp(end, clip.start + 0.2, Math.min(nextStart, clip.start + maxD));
          patch = { duration: round(end - clip.start, 3) };
        }
      }
      preview(updateClip(current, clip.id, patch));
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [pps, checkpoint, preview, snapTime, assetMap]);

  const startClipDrag = (e: React.PointerEvent, clip: Clip, kind: ClipDragKind, track: Track) => {
    e.stopPropagation();
    select(clip.id);
    if (track.locked) return;
    dragRef.current = { kind, clip, x0: e.clientX, moved: false };
    document.body.style.cursor = kind === "move" ? "grabbing" : "ew-resize";
  };

  const startScrub = () => {
    dragRef.current = { kind: "scrub" };
  };

  return { snapTime, startClipDrag, startScrub };
}
