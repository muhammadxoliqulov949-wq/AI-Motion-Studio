"use client";

import {
  ArrowLeftToLine,
  ArrowRightToLine,
  AudioLines,
  Copy,
  Diamond,
  type LucideIcon,
  Eye,
  EyeOff,
  Film,
  Layers,
  Lock,
  Magnet,
  Plus,
  Redo2,
  Scissors,
  Smile,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { EFFECTS } from "../catalog/effects";
import { FILTERS } from "../catalog/filters";
import { emojiByName, shapeById } from "../catalog/stickers";
import { keyframeTimes, setKeyframe, valueAt } from "../keyframes";
import {
  addTrack,
  duplicateClip,
  insertClip,
  kindsForClip,
  makeEffectClip,
  makeMediaClip,
  makeStickerClip,
  makeTextClip,
  removeClip,
  removeTrack,
  splitAt,
  templatePatch,
  TRACK_LABELS,
  trimToPlayhead,
  updateClip,
} from "../ops";
import { TEXT_TEMPLATES } from "../presets";
import { useCurrentTime, useEditor, useIsPlaying } from "../store";
import type { Clip, KeyframeProp, MediaAsset, Track, TrackKind } from "../types";
import { clamp, clipEnd, formatShort, projectDuration, round } from "../utils";
import { useRealPeaks } from "./assets/use-insert";
import { DND } from "./dnd";

const HEADER_W = 172;
const RULER_H = 28;
const TRACK_H: Record<TrackKind, number> = { effect: 30, sticker: 34, text: 34, overlay: 46, video: 66, audio: 46 };

export { DND };

type Drag =
  | { kind: "move" | "trim-l" | "trim-r"; clip: Clip; x0: number; moved: boolean }
  | { kind: "scrub" };

export function Timeline({ compact = false }: { compact?: boolean }) {
  const { project, assets, selectedId, select, commit, preview, checkpoint, undo, redo, canUndo, canRedo, seek, playhead, addAssets } = useEditor();
  const total = projectDuration(project);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(28);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const [snap, setSnap] = useState(true);
  const [menu, setMenu] = useState(false);
  /** Tracks the user added explicitly stay visible even while empty. */
  const [pinned, setPinned] = useState<string[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const realPeaks = useRealPeaks();

  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const contentW = Math.max(total + 20, 60) * pps;
  const selected = project.clips.find((c) => c.id === selectedId);
  // Like CapCut, empty tracks stay hidden until something is placed on them (main video always shows).
  const usedTracks = new Set(project.clips.map((c) => c.trackId));
  const visibleTracks = project.tracks.filter((t) => t.id === "V1" || usedTracks.has(t.id) || t.locked || t.hidden || t.muted || pinned.includes(t.id));

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(0, (clientX - rect.left + el.scrollLeft) / pps);
    },
    [pps],
  );

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

  // ----- pointer drag handling -----
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "scrub") {
        seek(timeFromClientX(e.clientX));
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
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [pps, seek, timeFromClientX, checkpoint, preview, snapTime, assetMap]);

  const startClipDrag = (e: React.PointerEvent, clip: Clip, kind: "move" | "trim-l" | "trim-r", track: Track) => {
    e.stopPropagation();
    select(clip.id);
    if (track.locked) return;
    dragRef.current = { kind, clip, x0: e.clientX, moved: false };
    document.body.style.cursor = kind === "move" ? "grabbing" : "ew-resize";
  };

  const startScrub = (e: React.PointerEvent) => {
    dragRef.current = { kind: "scrub" };
    seek(timeFromClientX(e.clientX));
  };

  // ----- ctrl + wheel zoom -----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setPps((p) => clamp(p * (e.deltaY < 0 ? 1.15 : 0.87), 4, 300));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    // Two-finger pinch zoom on touch screens.
    let pinch: { dist: number; pps: number } | null = null;
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { dist: distance(e.touches), pps: ppsRef.current };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      setPps(clamp(pinch.pps * (distance(e.touches) / pinch.dist), 4, 300));
    };
    const onTouchEnd = () => {
      pinch = null;
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // ----- drag & drop from library -----
  const onDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    const at = round(snapTime(timeFromClientX(e.clientX), ""), 3);
    const p = projectRef.current;
    const dt = e.dataTransfer;
    const assetId = dt.getData(DND.asset);
    const libAsset = dt.getData(DND.libAsset);
    const textStyle = dt.getData(DND.text);
    const sticker = dt.getData(DND.sticker);
    const effect = dt.getData(DND.effect);
    let clip: Clip | null = null;
    let asset: MediaAsset | undefined;
    if (assetId || libAsset) {
      asset = assetId ? assetMap.get(assetId) : (JSON.parse(libAsset) as MediaAsset);
      if (!asset) return;
      if (!assetMap.has(asset.id)) addAssets([asset]);
      realPeaks(asset);
      clip = makeMediaClip(asset, track.id, at);
    } else if (textStyle) {
      clip = makeTextClip(at, { ...templatePatch(textStyle), text: TEXT_TEMPLATES[textStyle]?.sample ?? "Matn", trackId: track.id });
    } else if (sticker) {
      clip = makeStickerClip(at, sticker, { trackId: track.id });
    } else if (effect) {
      clip = makeEffectClip(at, effect, { trackId: track.id });
    }
    if (!clip) return;
    const kinds = kindsForClip(clip, asset);
    const preferred = kinds.includes(track.kind) ? track.id : undefined;
    commit(insertClip(p, clip, kinds, preferred));
    select(clip.id);
  };

  const onClipDrop = (e: React.DragEvent, clip: Clip) => {
    const transition = e.dataTransfer.getData(DND.transition);
    const filter = e.dataTransfer.getData(DND.filter);
    if (!transition && !filter) return;
    e.preventDefault();
    e.stopPropagation();
    if (transition) {
      const [id, dur] = transition.split("|");
      commit(updateClip(projectRef.current, clip.id, { transitionIn: id, transitionDuration: Number(dur) || 0.5 }));
    }
    if (filter && clip.type === "media") commit(updateClip(projectRef.current, clip.id, { filter }));
    select(clip.id);
  };

  const now = () => playhead.getFrame() / project.fps;
  const split = () => commit(splitAt(project, now(), selectedId ?? undefined));
  const del = (ripple: boolean) => {
    if (!selectedId) return;
    commit(removeClip(project, selectedId, ripple));
    select(null);
  };
  const duplicate = () => {
    if (!selectedId) return;
    const r = duplicateClip(project, selectedId);
    commit(r.project);
    if (r.id) select(r.id);
  };
  const trim = (side: "left" | "right") => selectedId && commit(trimToPlayhead(project, selectedId, now(), side));
  const addKeyframes = () => {
    if (!selected || selected.type === "effect") return;
    const t = now() - selected.start;
    if (t < 0 || t > selected.duration) return;
    const props: KeyframeProp[] = selected.type === "media" && assetMap.get(selected.assetId)?.kind === "audio" ? ["volume"] : ["x", "y", "scale", "rotation", "opacity"];
    let next: Clip = selected;
    for (const prop of props) next = setKeyframe(next, prop, t, valueAt(next, prop, t));
    commit({ ...project, clips: project.clips.map((c) => (c.id === selected.id ? next : c)) });
  };

  const setTrack = (id: string, patch: Partial<Track>) => commit({ ...project, tracks: project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const fit = useCallback(() => {
    const w = scrollRef.current?.clientWidth ?? 800;
    setPps(clamp((w - 40) / Math.max(total, 5), 4, 300));
  }, [total]);

  // Re-fit when the edit length changes a lot (e.g. after an AI pass), not on small drags.
  const fittedFor = useRef(0);
  useEffect(() => {
    if (Math.abs(total - fittedFor.current) > 3) {
      fittedFor.current = total;
      fit();
    }
  }, [total, fit]);

  const tool =
    "h-7 px-2 inline-flex items-center gap-1.5 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent transition-colors shrink-0";
  const sep = <div className="w-px h-4 bg-white/10 mx-1 shrink-0" />;

  return (
    <div className="flex flex-col h-full select-none">
      <div className="h-10 shrink-0 flex items-center gap-0.5 px-2 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
        <button className={tool} onClick={undo} disabled={!canUndo} title="Bekor qilish (Ctrl+Z)">
          <Undo2 className="size-3.5" />
        </button>
        <button className={tool} onClick={redo} disabled={!canRedo} title="Qaytarish (Ctrl+Shift+Z)">
          <Redo2 className="size-3.5" />
        </button>
        {sep}
        <button className={tool} onClick={split} title="Kesish (S / Ctrl+B)">
          <Scissors className="size-3.5" /> {!compact && "Kesish"}
        </button>
        <button className={tool} onClick={() => trim("left")} disabled={!selectedId} title="Chapini kesib tashlash (Q)">
          <ArrowLeftToLine className="size-3.5" />
        </button>
        <button className={tool} onClick={() => trim("right")} disabled={!selectedId} title="O'ngini kesib tashlash (W)">
          <ArrowRightToLine className="size-3.5" />
        </button>
        <button className={tool} onClick={duplicate} disabled={!selectedId} title="Nusxa (Ctrl+D)">
          <Copy className="size-3.5" />
        </button>
        <button className={tool} onClick={() => del(false)} disabled={!selectedId} title="O'chirish (Delete)">
          <Trash2 className="size-3.5" />
        </button>
        <button className={tool} onClick={() => del(true)} disabled={!selectedId} title="Ripple o'chirish (Shift+Delete)">
          <Layers className="size-3.5" /> {!compact && "Ripple"}
        </button>
        {sep}
        <button className={tool} onClick={addKeyframes} disabled={!selected || selected.type === "effect"} title="Playheadda keyframe qo'shish (K)">
          <Diamond className="size-3.5" /> {!compact && "Keyframe"}
        </button>
        <button className={cn(tool, snap && "text-cyan-300 bg-cyan-400/10")} onClick={() => setSnap(!snap)} title="Magnit (yopishish)">
          <Magnet className="size-3.5" /> {!compact && "Snap"}
        </button>
        <div className="relative">
          <button className={tool} onClick={() => setMenu(!menu)} title="Trek qo'shish">
            <Plus className="size-3.5" /> {!compact && "Trek"}
          </button>
          {menu && (
            <div className="fixed z-50 mt-1 w-44 rounded-lg bg-[#1a1a20] ring-1 ring-white/10 shadow-xl p-1" onMouseLeave={() => setMenu(false)}>
              {(["overlay", "text", "sticker", "effect", "audio"] as TrackKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    const added = addTrack(project, k);
                    setPinned((p) => [...p, added.track.id]);
                    commit(added.project);
                    setMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-white/80 hover:bg-white/10 flex items-center gap-2"
                >
                  {React.createElement(TRACK_ICON[k], { className: "size-3.5 text-white/50" })} {TRACK_LABELS[k]} treki
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 pl-2">
          <span className="hidden md:inline text-[11px] text-white/40 mr-2 tabular-nums whitespace-nowrap">
            {project.clips.length} klip · {formatShort(total)}
          </span>
          <button className={tool} onClick={() => setPps((p) => clamp(p * 0.8, 4, 300))} title="Kichraytirish (-)">
            <ZoomOut className="size-3.5" />
          </button>
          <input type="range" min={4} max={300} value={pps} onChange={(e) => setPps(Number(e.target.value))} className="ams-range w-16 lg:w-24" style={{ "--fill": `${((pps - 4) / 296) * 100}%` } as React.CSSProperties} />
          <button className={tool} onClick={() => setPps((p) => clamp(p * 1.25, 4, 300))} title="Kattalashtirish (+)">
            <ZoomIn className="size-3.5" />
          </button>
          <button className={tool} onClick={fit} title="Butun loyihani ko'rsatish">
            Moslash
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-x-hidden overflow-y-auto panel-scroll">
        {/* Track headers */}
        <div className="shrink-0 border-r border-white/[0.06] bg-[#0d0d10] sticky left-0 z-20" style={{ width: compact ? 92 : HEADER_W }}>
          <div style={{ height: RULER_H }} className="border-b border-white/[0.06]" />
          {visibleTracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              compact={compact}
              removable={project.tracks.filter((t) => t.kind === track.kind).length > 1 && !["V1", "T1", "A1"].includes(track.id)}
              onRemove={() => commit(removeTrack(project, track.id))}
              onChange={(patch) => setTrack(track.id, patch)}
            />
          ))}
        </div>

        {/* Lanes */}
        <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden timeline-scroll">
          <div className="relative" style={{ width: contentW }}>
            <Ruler pps={pps} width={contentW} onPointerDown={startScrub} />
            {visibleTracks.map((track) => (
              <div
                key={track.id}
                data-track-id={track.id}
                className={cn("relative border-b border-white/[0.04]", track.hidden && "opacity-40", track.kind === "video" && "bg-white/[0.015]")}
                style={{ height: TRACK_H[track.kind] }}
                onPointerDown={(e) => {
                  select(null);
                  startScrub(e);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, track)}
              >
                {project.clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => (
                    <ClipView
                      key={clip.id}
                      clip={clip}
                      track={track}
                      asset={clip.type === "media" ? assetMap.get(clip.assetId) : undefined}
                      pps={pps}
                      selected={clip.id === selectedId}
                      onPointerDown={(e, kind) => startClipDrag(e, clip, kind, track)}
                      onDrop={(e) => onClipDrop(e, clip)}
                    />
                  ))}
              </div>
            ))}
            <div
              className="h-16 border-b border-dashed border-white/[0.05] text-[10px] text-white/20 flex items-center pl-3"
              onPointerDown={(e) => {
                select(null);
                startScrub(e);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, project.tracks.find((t) => t.id === "V1")!)}
            >
              Media, audio, matn, stiker yoki effektni shu yerga sudrang — kerakli trek o&apos;zi yaratiladi
            </div>
            <Playhead pps={pps} scrollRef={scrollRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

const TRACK_ICON: Record<TrackKind, LucideIcon> = { text: Type, overlay: Layers, video: Film, audio: AudioLines, sticker: Smile, effect: Sparkles };

function TrackHeader({
  track,
  compact,
  removable,
  onRemove,
  onChange,
}: {
  track: Track;
  compact: boolean;
  removable: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<Track>) => void;
}) {
  const Icon = TRACK_ICON[track.kind];
  const ib = "size-5 grid place-items-center rounded text-white/40 hover:text-white hover:bg-white/10";
  return (
    <div className={cn("group flex items-center gap-1.5 border-b border-white/[0.04]", compact ? "px-2" : "px-3")} style={{ height: TRACK_H[track.kind] }}>
      <Icon className="size-3.5 text-white/40 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-white/80 truncate">{track.name}</div>
        {!compact && TRACK_H[track.kind] > 40 && <div className="text-[10px] text-white/30">{track.id}</div>}
      </div>
      {removable && !compact && (
        <button className={cn(ib, "opacity-0 group-hover:opacity-100")} onClick={onRemove} title="Trekni o'chirish">
          <X className="size-3" />
        </button>
      )}
      {track.kind === "audio" || track.kind === "video" || track.kind === "overlay" ? (
        <button className={ib} onClick={() => onChange({ muted: !track.muted })} title="Ovoz">
          {track.muted ? <VolumeX className="size-3 text-rose-400" /> : <Volume2 className="size-3" />}
        </button>
      ) : null}
      {track.kind !== "audio" && !compact && (
        <button className={ib} onClick={() => onChange({ hidden: !track.hidden })} title="Ko'rinish">
          {track.hidden ? <EyeOff className="size-3 text-rose-400" /> : <Eye className="size-3" />}
        </button>
      )}
      {!compact && (
        <button className={ib} onClick={() => onChange({ locked: !track.locked })} title="Qulf">
          {track.locked ? <Lock className="size-3 text-amber-400" /> : <Unlock className="size-3" />}
        </button>
      )}
    </div>
  );
}

function Ruler({ pps, width, onPointerDown }: { pps: number; width: number; onPointerDown: (e: React.PointerEvent) => void }) {
  const step = pps > 160 ? 0.5 : pps > 60 ? 1 : pps > 24 ? 2 : pps > 10 ? 5 : 10;
  const ticks = [];
  for (let t = 0; t * pps < width; t += step) ticks.push(t);
  return (
    <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0d0d10] cursor-col-resize" style={{ height: RULER_H }} onPointerDown={onPointerDown}>
      {ticks.map((t) => {
        const major = Math.round(t / step) % 2 === 0;
        return (
          <div key={t} className="absolute bottom-0" style={{ left: t * pps }}>
            <div className={cn("w-px bg-white/20", major ? "h-2.5" : "h-1.5")} />
            {major && <span className="absolute bottom-3 left-1 text-[10px] text-white/40 tabular-nums font-mono">{formatShort(t)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Playhead({ pps, scrollRef }: { pps: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const time = useCurrentTime();
  const playing = useIsPlaying();
  const x = time * pps;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = x - 80;
  }, [x, playing, scrollRef]);

  return (
    <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: x }}>
      <div className="absolute -left-[6px] top-0 w-[13px] h-[14px] bg-cyan-300 [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]" />
      <div className="absolute left-0 top-0 bottom-0 w-px bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.6)]" />
    </div>
  );
}

function ClipView({
  clip,
  track,
  asset,
  pps,
  selected,
  onPointerDown,
  onDrop,
}: {
  clip: Clip;
  track: Track;
  asset?: MediaAsset;
  pps: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, kind: "move" | "trim-l" | "trim-r") => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const left = clip.start * pps;
  const width = Math.max(4, clip.duration * pps);
  const h = TRACK_H[track.kind] - 6;

  let body: React.ReactNode;
  let tone = "";
  if (clip.type === "text") {
    tone = "bg-gradient-to-r from-amber-400/90 to-orange-500/85 text-black";
    body = (
      <div className="flex items-center gap-1.5 px-2 h-full text-[11px] font-semibold truncate">
        <Type className="size-3 shrink-0" />
        <span className="truncate">{clip.text}</span>
      </div>
    );
  } else if (clip.type === "sticker") {
    const [k, v] = clip.sticker.split(/:(.+)/);
    const label = k === "emoji" ? `${emojiByName(v)?.char ?? "🙂"} ${v}` : k === "shape" ? `◆ ${shapeById(v)?.label ?? v}` : v;
    tone = "bg-gradient-to-r from-pink-500/85 to-rose-500/80 text-white";
    body = <div className="flex items-center px-2 h-full text-[11px] font-medium truncate">{label}</div>;
  } else if (clip.type === "effect") {
    const e = EFFECTS[clip.effect];
    tone = "bg-gradient-to-r from-fuchsia-600/85 to-violet-600/80 text-white";
    body = (
      <div className="flex items-center gap-1 px-2 h-full text-[10.5px] font-medium truncate">
        <span>{e?.icon}</span>
        <span className="truncate">{e?.label ?? clip.effect}</span>
      </div>
    );
  } else if (asset?.kind === "audio") {
    tone = asset.origin === "sfx" ? "bg-sky-900/70 text-sky-100" : "bg-emerald-900/70 text-emerald-100";
    body = <Waveform clip={clip} asset={asset} width={width} height={h} color={asset.origin === "sfx" ? "#7dd3fc" : "#6ee7b7"} />;
  } else {
    tone = "bg-[#1b1b22] text-white";
    body = <Filmstrip asset={asset} width={width} height={h} />;
  }

  const kfTimes = keyframeTimes(clip);

  return (
    <div
      className={cn(
        "absolute top-[3px] rounded-md overflow-hidden group cursor-grab active:cursor-grabbing",
        tone,
        selected ? "ring-2 ring-white z-10" : "ring-1 ring-black/40 hover:ring-white/40",
        track.locked && "cursor-not-allowed",
      )}
      style={{ left, width, height: h }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {body}
      {clip.type === "media" && asset?.kind !== "audio" && (
        <div className="absolute top-0 left-0 right-0 flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-b from-black/70 to-transparent text-[10px] font-medium">
          <span className="truncate">{asset?.name}</span>
          {clip.speed !== 1 && <span className="px-1 rounded bg-sky-500/80 text-[9px]">{round(clip.speed, 2)}x</span>}
          {clip.speedCurve && clip.speedCurve !== "none" && <span className="px-1 rounded bg-sky-500/80 text-[9px]">egri</span>}
          {clip.reverse && <span className="px-1 rounded bg-amber-500/80 text-[9px]">◀</span>}
          {clip.chroma?.enabled && <span className="px-1 rounded bg-green-500/80 text-[9px]">key</span>}
          {clip.filter !== "none" && <span className="size-2 rounded-full shrink-0 ring-1 ring-white/50" style={{ background: FILTERS[clip.filter]?.swatch }} />}
        </div>
      )}
      {clip.type === "media" && asset?.kind === "audio" && (
        <>
          {(clip.fadeIn ?? 0) > 0 && <div className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-black/50 to-transparent pointer-events-none" style={{ width: (clip.fadeIn ?? 0) * pps }} />}
          {(clip.fadeOut ?? 0) > 0 && <div className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-black/50 to-transparent pointer-events-none" style={{ width: (clip.fadeOut ?? 0) * pps }} />}
        </>
      )}
      {clip.transitionIn !== "none" && (
        <div
          className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-cyan-300/70 to-transparent"
          style={{ width: Math.max(6, clip.transitionDuration * pps) }}
          title={`O'tish: ${clip.transitionIn}`}
        />
      )}
      {kfTimes.map((t) => (
        <Diamond key={t} className="absolute bottom-0.5 size-2.5 -ml-[5px] text-cyan-200 fill-cyan-300 pointer-events-none" style={{ left: t * pps }} />
      ))}
      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/80 rounded-l-md" onPointerDown={(e) => onPointerDown(e, "trim-l")} />
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/80 rounded-r-md" onPointerDown={(e) => onPointerDown(e, "trim-r")} />
    </div>
  );
}

function Filmstrip({ asset, width, height }: { asset?: MediaAsset; width: number; height: number }) {
  if (!asset) return null;
  if (!asset.thumbs?.length) {
    return (
      <div className="absolute inset-0" style={{ background: asset.gradient }}>
        <div className="absolute inset-0 opacity-30 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_58px,rgba(0,0,0,0.5)_58px,rgba(0,0,0,0.5)_60px)]" />
      </div>
    );
  }
  const tileW = height * ((asset.width ?? 16) / (asset.height ?? 9));
  const count = Math.max(1, Math.ceil(width / tileW));
  return (
    <div className="absolute inset-0 flex">
      {Array.from({ length: count }, (_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={asset.thumbs![i % asset.thumbs!.length]} alt="" draggable={false} className="h-full object-cover shrink-0" style={{ width: tileW }} />
      ))}
    </div>
  );
}

function Waveform({ clip, asset, width, height, color }: { clip: Clip; asset: MediaAsset; width: number; height: number; color: string }) {
  if (clip.type !== "media" || !asset.peaks) return null;
  const peaks = asset.peaks;
  const from = Math.floor((clip.in / asset.duration) * peaks.length);
  const to = Math.ceil(((clip.in + clip.duration * clip.speed) / asset.duration) * peaks.length);
  const slice = peaks.slice(from, Math.max(from + 1, to));
  const bars = Math.max(1, Math.floor(width / 3));
  return (
    <svg width={width} height={height} className="absolute inset-0">
      {Array.from({ length: bars }, (_, i) => {
        const p = slice[Math.floor((i / bars) * slice.length)] ?? 0;
        const bh = Math.max(2, p * (height - 14) * Math.min(1.5, clip.volume));
        return <rect key={i} x={i * 3} y={(height - bh) / 2 + 5} width={2} height={bh} rx={1} fill={color} opacity={0.85} />;
      })}
      <text x={6} y={12} fontSize={10} fill="#fff" fontWeight={600} opacity={0.9}>
        {asset.origin === "music" ? "♪" : asset.origin === "sfx" ? "🔊" : "♫"} {asset.name}
      </text>
    </svg>
  );
}

