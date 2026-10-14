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
import { formatTime, projectDuration } from "../utils";

export function PreviewPanel({ aiBusy, compact = false }: { aiBusy: boolean; compact?: boolean }) {
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
        <span className="font-medium text-white/70">Preview</span>
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
              doubleClickToFullscreen
              acknowledgeRemotionLicense
            />
            {aiBusy && (
              <div className="absolute inset-0 pointer-events-none ai-scan">
                <div className="absolute inset-0 bg-violet-500/10" />
              </div>
            )}
          </div>
        )}
      </div>
      <Transport total={total} compact={compact} />
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
