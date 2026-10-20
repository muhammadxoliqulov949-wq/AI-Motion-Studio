"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { TimelineComposition } from "@/editor/composition/TimelineComposition";
import { ASPECTS } from "@/editor/presets";
import type { MediaAsset, Project } from "@/editor/types";
import { projectDuration } from "@/editor/utils";

/** Live preview of a studio project, scaled to fit its container (any aspect ratio), looping. */
export function FitPlayer({ project, assets, playerRef }: { project: Project; assets: MediaAsset[]; playerRef?: React.Ref<PlayerRef> }) {
  const { width, height } = ASPECTS[project.aspect];
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const inputProps = useMemo(() => ({ project, assets }), [project, assets]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: bw, height: bh } = entry.contentRect;
      const k = Math.min(bw / width, bh / height);
      setSize({ w: Math.floor(width * k), h: Math.floor(height * k) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  return (
    <div ref={box} className="absolute inset-0 grid place-items-center">
      {size.w > 0 && (
        <div className="rounded-xl overflow-hidden ring-1 ring-white/10 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.9)]" style={{ width: size.w, height: size.h }}>
          <Player
            ref={playerRef}
            component={TimelineComposition}
            inputProps={inputProps}
            durationInFrames={Math.max(project.fps, Math.ceil(projectDuration(project) * project.fps))}
            fps={project.fps}
            compositionWidth={width}
            compositionHeight={height}
            style={{ width: "100%", height: "100%" }}
            loop
            autoPlay
            initiallyMuted
            clickToPlay
            acknowledgeRemotionLicense
          />
        </div>
      )}
    </div>
  );
}
