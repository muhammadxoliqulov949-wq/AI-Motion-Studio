"use client";

import { Player } from "@remotion/player";
import {
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TimelineComposition } from "../composition/TimelineComposition";
import { ASPECTS } from "../presets";
import { useCurrentTime, useEditor, useIsPlaying } from "../store";
import { setKeyframe, valueAt } from "../keyframes";
import type { Clip, KeyframeProp } from "../types";
import { clamp, formatTime, projectDuration, round } from "../utils";

export function PreviewPanel({ aiBusy, compact = false, hideTransport = false }: { aiBusy: boolean; compact?: boolean; hideTransport?: boolean }) {
  const { project, assets, playerRef, playhead } = useEditor();
  const { width, height } = ASPECTS[project.aspect];
  const total = projectDuration(project);
  const durationInFrames = Math.max(project.fps, Math.ceil(total * project.fps));
  const inputProps = useMemo(() => ({ project, assets }), [project, assets]);

  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: bw, height: bh } = entry.contentRect;
      const scale = Math.min(bw / width, bh / height);
      setSize({ w: Math.floor(width * scale), h: Math.floor(height * scale) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => playhead.setFrame(e.detail.frame);
    const onPlay = () => playhead.setPlaying(true);
    const onPause = () => playhead.setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("seeked", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("seeked", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onPause);
    };
  }, [playerRef, playhead, size.w]);

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className={cn("flex items-center justify-between h-10 px-4 text-xs text-white/50 border-b border-white/[0.06]", compact && "hidden")}>
        <span className="font-medium text-white/70">Ko&apos;rish oynasi</span>
        <span>
          {width}×{height} · {project.fps}fps · {ASPECTS[project.aspect].label}
        </span>
      </div>
      <div ref={boxRef} className={cn("relative flex-1 min-h-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#17171d_0%,#0b0b0e_70%)]", compact ? "p-2" : "p-5")}>
        {size.w > 0 && (
          <div
            className="relative rounded-md overflow-hidden shadow-[0_20px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
            style={{ width: size.w, height: size.h }}
          >
            <Player
              ref={playerRef}
              component={TimelineComposition}
              inputProps={inputProps}
              durationInFrames={durationInFrames}
              fps={project.fps}
              compositionWidth={width}
              compositionHeight={height}
              style={{ width: "100%", height: "100%" }}
              clickToPlay
              doubleClickToFullscreen={!hideTransport}
              acknowledgeRemotionLicense
            />
            <DirectManipulation width={size.w} height={size.h} />
            {aiBusy && (
              <div className="absolute inset-0 pointer-events-none ai-scan">
                <div className="absolute inset-0 bg-violet-500/10" />
              </div>
            )}
          </div>
        )}
      </div>
      {!hideTransport && <Transport total={total} compact={compact} />}
    </div>
  );
}

function Transport({ total, compact }: { total: number; compact: boolean }) {
  const { playerRef, seek, togglePlay, project } = useEditor();
  const time = useCurrentTime();
  const playing = useIsPlaying();
  const [muted, setMuted] = useState(false);

  const btn =
    "size-8 grid place-items-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors";

  return (
    <div className={cn("shrink-0 grid grid-cols-[1fr_auto_1fr] items-center px-3 border-t border-white/[0.06]", compact ? "h-10" : "h-12")}>
      <div className="font-mono text-xs tabular-nums">
        <span className="text-white">{formatTime(time, project.fps)}</span>
        {!compact && <span className="text-white/30"> / {formatTime(total, project.fps)}</span>}
      </div>
      <div className="flex items-center gap-1">
        <button className={btn} onClick={() => seek(0)} title="Boshiga (Home)">
          <SkipBack className="size-4" />
        </button>
        <button
          className="size-9 grid place-items-center rounded-full bg-white text-black hover:scale-105 transition-transform"
          onClick={togglePlay}
          title="Ijro / pauza (Space)"
        >
          {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current ml-0.5" />}
        </button>
        <button className={btn} onClick={() => seek(total)} title="Oxiriga (End)">
          <SkipForward className="size-4" />
        </button>
      </div>
      <div className="flex justify-end gap-1">
        <button
          className={btn}
          onClick={() => {
            const next = !muted;
            setMuted(next);
            if (next) playerRef.current?.mute();
            else playerRef.current?.unmute();
          }}
          title="Ovoz"
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <button className={btn} onClick={() => playerRef.current?.requestFullscreen()} title="To'liq ekran">
          <Maximize2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Drag the selected text / sticker / overlay directly on the preview (CapCut-style).
 * Mouse: drag to move, wheel to scale. Touch: one finger moves, two fingers pinch-scale and rotate.
 */
function DirectManipulation({ width, height }: { width: number; height: number }) {
  const { project, selectedId, preview, commit, checkpoint, togglePlay } = useEditor();
  const time = useCurrentTime();
  const clip = project.clips.find((c) => c.id === selectedId);
  const drag = useRef<{ x0: number; y0: number; bx: number; by: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; angle: number; sc: number; rot: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  if (!clip || clip.type === "effect") return null;
  if (clip.type === "media" && project.tracks.find((tr) => tr.id === clip.trackId)?.kind === "audio") return null;
  const t = time - clip.start;
  if (t < 0 || t > clip.duration) return null;

  const write = (patch: Partial<Record<KeyframeProp, number>>, live: boolean) => {
    let next: Clip = clip;
    for (const [prop, v] of Object.entries(patch) as [KeyframeProp, number][]) {
      next = next.keyframes?.[prop]?.length ? setKeyframe(next, prop, t, v) : ({ ...next, [prop]: v } as Clip);
    }
    const p = { ...project, clips: project.clips.map((c) => (c.id === clip.id ? next : c)) };
    if (live) preview(p);
    else commit(p);
  };

  const twoFinger = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  };
  const startDrag = (x: number, y: number, moved: boolean) => {
    drag.current = { x0: x, y0: y, bx: valueAt(clip, "x", t), by: valueAt(clip, "y", t), moved };
  };

  const release = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) {
        pinch.current = null;
        // Continue as a one-finger move from where the remaining finger is, without a jump.
        const rest = [...pointers.current.values()][0];
        if (rest) startDrag(rest.x, rest.y, true);
        else drag.current = null;
      }
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && e.type === "pointerup") togglePlay();
  };

  return (
    <div
      className="absolute inset-0 cursor-move touch-none"
      title="Sudrab joylashtiring, g'ildirak bilan masshtab"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 1) {
          startDrag(e.clientX, e.clientY, false);
        } else if (pointers.current.size === 2) {
          if (!drag.current?.moved) checkpoint();
          drag.current = null;
          const g = twoFinger();
          pinch.current = { ...g, sc: valueAt(clip, "scale", t), rot: valueAt(clip, "rotation", t) };
        }
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pc = pinch.current;
        if (pc && pointers.current.size >= 2) {
          const g = twoFinger();
          write({ scale: round(clamp(pc.sc * (g.dist / pc.dist), 0.1, 6), 3), rotation: round(pc.rot + g.angle - pc.angle, 1) }, true);
          return;
        }
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x0;
        const dy = e.clientY - d.y0;
        if (!d.moved) {
          if (Math.hypot(dx, dy) < 4) return;
          d.moved = true;
          checkpoint();
        }
        write({ x: round(clamp(d.bx + (dx / width) * 100, -150, 150), 2), y: round(clamp(d.by + (dy / height) * 100, -150, 150), 2) }, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onWheel={(e) => {
        const sc = valueAt(clip, "scale", t);
        checkpoint();
        write({ scale: round(clamp(sc * (e.deltaY < 0 ? 1.06 : 0.94), 0.1, 6), 3) }, false);
      }}
    >
      <div className="absolute inset-0 ring-1 ring-inset ring-cyan-300/50 pointer-events-none" />
      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-cyan-400 text-black text-[10px] font-semibold pointer-events-none">
        Sudrab joylashtiring
      </div>
    </div>
  );
}
