"use client";

import {
  AudioLines,
  type LucideIcon,
  Eye,
  EyeOff,
  Film,
  Layers,
  Lock,
  Magnet,
  Redo2,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { makeMediaClip, makeTextClip, removeClip, splitAt, updateClip } from "../ops";
import { FILTERS } from "../presets";
import { useCurrentTime, useEditor, useIsPlaying } from "../store";
import type { Clip, FilterId, MediaAsset, TextStyleId, Track, TrackKind, TransitionId } from "../types";
import { clamp, clipEnd, formatShort, projectDuration, round } from "../utils";

const HEADER_W = 168;
const RULER_H = 28;
const TRACK_H: Record<TrackKind, number> = { text: 36, overlay: 46, video: 68, audio: 54 };

export const DND = {
  asset: "application/x-ams-asset",
  text: "application/x-ams-text",
  transition: "application/x-ams-transition",
  filter: "application/x-ams-filter",
};

type Drag =
  | { kind: "move" | "trim-l" | "trim-r"; clip: Clip; x0: number; moved: boolean }
  | { kind: "scrub" };

export function Timeline({ compact = false }: { compact?: boolean }) {
  const { project, assets, selectedId, select, commit, preview, checkpoint, undo, redo, canUndo, canRedo, seek, playhead } =
    useEditor();
  const total = projectDuration(project);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(28);
  const [snap, setSnap] = useState(true);
  const dragRef = useRef<Drag | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const contentW = Math.max(total + 20, 60) * pps;

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
      const siblings = projectRef.current.clips.filter((c) => c.trackId === clip.trackId && c.id !== clip.id);
      const prevEnd = siblings.filter((c) => clipEnd(c) <= clip.start + 0.001).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
      const nextStart = siblings.filter((c) => c.start >= clipEnd(clip) - 0.001).reduce((m, c) => Math.min(m, c.start), Infinity);

      let patch: Partial<Clip> = {};
      if (drag.kind === "move") {
        const raw = clip.start + dt;
        const headSnap = snapTime(raw, clip.id);
        let start = headSnap !== raw ? headSnap : snapTime(raw + clip.duration, clip.id) - clip.duration;
        start = clamp(start, prevEnd, nextStart - clip.duration);
        patch = { start: round(start, 3) };
      } else if (drag.kind === "trim-l") {
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
        const maxD = asset && asset.kind !== "image" ? (asset.duration - (clip as { in: number }).in) / (clip as { speed: number }).speed : Infinity;
        let end = snapTime(clipEnd(clip) + dt, clip.id);
        end = clamp(end, clip.start + 0.2, Math.min(nextStart, clip.start + maxD));
        patch = { duration: round(end - clip.start, 3) };
      }
      preview(updateClip(projectRef.current, clip.id, patch));
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
      setPps((p) => clamp(p * (e.deltaY < 0 ? 1.15 : 0.87), 4, 240));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ----- drag & drop from library -----
  const onDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    const at = round(snapTime(timeFromClientX(e.clientX), ""), 3);
    const p = projectRef.current;
    const assetId = e.dataTransfer.getData(DND.asset);
    const textStyle = e.dataTransfer.getData(DND.text) as TextStyleId;
    if (assetId) {
      const asset = assetMap.get(assetId);
      if (!asset) return;
      const target = asset.kind === "audio" ? "A1" : track.kind === "overlay" ? track.id : "V1";
      const clip = makeMediaClip(asset, target, at);
      commit({ ...p, clips: [...p.clips, clip] });
      select(clip.id);
    } else if (textStyle) {
      const clip = makeTextClip(at, { trackId: track.kind === "text" ? track.id : "T1", style: textStyle, text: textStyle === "caption" ? "Bu yerga subtitr" : "Sarlavha", position: textStyle === "caption" || textStyle === "lower-third" ? "bottom" : "center" });
      commit({ ...p, clips: [...p.clips, clip] });
      select(clip.id);
    }
  };

  const onClipDrop = (e: React.DragEvent, clip: Clip) => {
    const transition = e.dataTransfer.getData(DND.transition) as TransitionId;
    const filter = e.dataTransfer.getData(DND.filter) as FilterId;
    if (!transition && !filter) return;
    e.preventDefault();
    e.stopPropagation();
    if (transition) commit(updateClip(projectRef.current, clip.id, { transitionIn: transition }));
    if (filter && clip.type === "media") commit(updateClip(projectRef.current, clip.id, { filter }));
    select(clip.id);
  };

  const split = () => commit(splitAt(project, playhead.getFrame() / project.fps, selectedId ?? undefined));
  const del = (ripple: boolean) => {
    if (!selectedId) return;
    commit(removeClip(project, selectedId, ripple));
    select(null);
  };

  const setTrack = (id: string, patch: Partial<Track>) =>
    commit({ ...project, tracks: project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const fit = useCallback(() => {
    const w = scrollRef.current?.clientWidth ?? 800;
    setPps(clamp((w - 40) / Math.max(total, 5), 4, 240));
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
    "h-7 px-2 inline-flex items-center gap-1.5 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

  return (
    <div className="flex flex-col h-full select-none">
      <div className="h-10 shrink-0 flex items-center gap-1 px-3 border-b border-white/[0.06] overflow-x-auto">
        <button className={tool} onClick={undo} disabled={!canUndo} title="Bekor qilish (Ctrl+Z)">
          <Undo2 className="size-3.5" />
        </button>
        <button className={tool} onClick={redo} disabled={!canRedo} title="Qaytarish (Ctrl+Shift+Z)">
          <Redo2 className="size-3.5" />
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button className={tool} onClick={split} title="Kesish (S)">
          <Scissors className="size-3.5" /> <span className="hidden sm:inline">Kesish</span>
        </button>
        <button className={tool} onClick={() => del(false)} disabled={!selectedId} title="O'chirish (Delete)">
          <Trash2 className="size-3.5" /> <span className="hidden sm:inline">O&apos;chirish</span>
        </button>
        <button className={tool} onClick={() => del(true)} disabled={!selectedId} title="Ripple o'chirish (Shift+Delete)">
          <Layers className="size-3.5" /> <span className="hidden sm:inline">Ripple</span>
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button className={cn(tool, snap && "text-violet-300 bg-violet-500/10")} onClick={() => setSnap(!snap)} title="Magnit (yopishish)">
          <Magnet className="size-3.5" /> <span className="hidden sm:inline">Snap</span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden sm:inline text-[11px] text-white/40 mr-2 tabular-nums">{project.clips.length} klip · {formatShort(total)}</span>
          <button className={tool} onClick={() => setPps((p) => clamp(p * 0.8, 4, 240))} title="Kichraytirish">
            <ZoomOut className="size-3.5" />
          </button>
          <input
            type="range"
            min={4}
            max={240}
            value={pps}
            onChange={(e) => setPps(Number(e.target.value))}
            className="w-16 lg:w-24 accent-violet-400"
          />
          <button className={tool} onClick={() => setPps((p) => clamp(p * 1.25, 4, 240))} title="Kattalashtirish">
            <ZoomIn className="size-3.5" />
          </button>
          <button className={tool} onClick={fit}>
            Moslash
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex overflow-x-hidden overflow-y-auto panel-scroll">
        {/* Track headers */}
        <div className="shrink-0 border-r border-white/[0.06] bg-[#0d0d10]" style={{ width: compact ? 96 : HEADER_W }}>
          <div style={{ height: RULER_H }} className="border-b border-white/[0.06]" />
          {project.tracks.map((track) => (
            <TrackHeader key={track.id} track={track} compact={compact} onChange={(patch) => setTrack(track.id, patch)} />
          ))}
        </div>

        {/* Lanes */}
        <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden timeline-scroll">
          <div className="relative" style={{ width: contentW }}>
            <Ruler pps={pps} width={contentW} onPointerDown={startScrub} />
            {project.tracks.map((track) => (
              <div
                key={track.id}
                className={cn("relative border-b border-white/[0.04]", track.hidden && "opacity-40")}
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
            <Playhead pps={pps} scrollRef={scrollRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

const TRACK_ICON: Record<TrackKind, LucideIcon> = { text: Type, overlay: Layers, video: Film, audio: AudioLines };

function TrackHeader({ track, compact, onChange }: { track: Track; compact: boolean; onChange: (patch: Partial<Track>) => void }) {
  const Icon = TRACK_ICON[track.kind];
  const ib = "size-5 grid place-items-center rounded text-white/40 hover:text-white hover:bg-white/10";
  return (
    <div className={cn("flex items-center gap-1.5 border-b border-white/[0.04]", compact ? "px-2" : "px-3")} style={{ height: TRACK_H[track.kind] }}>
      <Icon className="size-3.5 text-white/40 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-white/80 truncate">{track.name}</div>
        <div className={cn("text-[10px] text-white/30", compact && "hidden")}>{track.id}</div>
      </div>
      {track.kind === "audio" || track.kind === "video" ? (
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
  const step = pps > 120 ? 0.5 : pps > 50 ? 1 : pps > 20 ? 2 : pps > 10 ? 5 : 10;
  const ticks = [];
  for (let t = 0; t * pps < width; t += step) ticks.push(t);
  return (
    <div
      className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0d0d10] cursor-col-resize"
      style={{ height: RULER_H }}
      onPointerDown={onPointerDown}
    >
      {ticks.map((t) => {
        const major = Math.round(t / step) % 2 === 0;
        return (
          <div key={t} className="absolute bottom-0" style={{ left: t * pps }}>
            <div className={cn("w-px bg-white/20", major ? "h-2.5" : "h-1.5")} />
            {major && (
              <span className="absolute bottom-3 left-1 text-[10px] text-white/40 tabular-nums font-mono">
                {formatShort(t)}
              </span>
            )}
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
      <div className="absolute -left-[6px] top-0 w-[13px] h-[14px] bg-white [clip-path:polygon(0_0,100%_0,100%_60%,50%_100%,0_60%)]" />
      <div className="absolute left-0 top-0 bottom-0 w-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
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
    tone = "bg-gradient-to-r from-amber-500/90 to-orange-500/80 text-black";
    body = (
      <div className="flex items-center gap-1.5 px-2 h-full text-[11px] font-semibold truncate">
        <Type className="size-3 shrink-0" />
        <span className="truncate">{clip.text}</span>
      </div>
    );
  } else if (asset?.kind === "audio") {
    tone = "bg-emerald-900/70 text-emerald-100";
    body = <Waveform clip={clip} asset={asset} width={width} height={h} />;
  } else {
    tone = "bg-[#1b1b22] text-white";
    body = <Filmstrip asset={asset} width={width} height={h} />;
  }

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
          {clip.speed !== 1 && <span className="px-1 rounded bg-sky-500/80 text-[9px]">{clip.speed}x</span>}
          {clip.filter !== "none" && (
            <span className="size-2 rounded-full shrink-0 ring-1 ring-white/50" style={{ background: FILTERS[clip.filter].swatch }} />
          )}
        </div>
      )}
      {clip.transitionIn !== "none" && (
        <div
          className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-violet-400/70 to-transparent"
          style={{ width: Math.max(6, clip.transitionDuration * pps) }}
          title={`O'tish: ${clip.transitionIn}`}
        />
      )}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/80 rounded-l-md"
        onPointerDown={(e) => onPointerDown(e, "trim-l")}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/80 rounded-r-md"
        onPointerDown={(e) => onPointerDown(e, "trim-r")}
      />
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
        <img
          key={i}
          src={asset.thumbs![i % asset.thumbs!.length]}
          alt=""
          draggable={false}
          className="h-full object-cover shrink-0"
          style={{ width: tileW }}
        />
      ))}
    </div>
  );
}

function Waveform({ clip, asset, width, height }: { clip: Clip; asset: MediaAsset; width: number; height: number }) {
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
        const bh = Math.max(2, p * (height - 14) * clip.volume);
        return <rect key={i} x={i * 3} y={(height - bh) / 2 + 5} width={2} height={bh} rx={1} fill="#6ee7b7" opacity={0.85} />;
      })}
      <text x={6} y={12} fontSize={10} fill="#d1fae5" fontWeight={600}>
        ♪ {asset.name}
      </text>
    </svg>
  );
}
