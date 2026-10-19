"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { sampleKeyframes } from "@/editor/keyframes";
import { CAMERA_PRESETS } from "../camera";

const LOOP_SECONDS = 2.4;

/**
 * Camera move picker: every tile plays its own move on the current picture (same keyframes the
 * video uses), so you see what a preset does before choosing it. One animation loop drives all tiles.
 */
export function CameraGrid({ value, onChange, imageUrl, intensity }: { value: string; onChange: (id: string) => void; imageUrl: string | null; intensity: number }) {
  const tiles = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const frames = CAMERA_PRESETS.map((p) => p.build(LOOP_SECONDS, intensity));
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (((now - start) / 1000) % (LOOP_SECONDS + 0.5));
      const at = Math.min(t, LOOP_SECONDS);
      frames.forEach((kf, i) => {
        const el = tiles.current[i];
        if (!el) return;
        const x = sampleKeyframes(kf.x, at, 0);
        const y = sampleKeyframes(kf.y, at, 0);
        const r = sampleKeyframes(kf.rotation, at, 0);
        const s = sampleKeyframes(kf.scale, at, 1);
        // Same order as the video renderer: translate, rotate, scale.
        el.style.transform = `translate(${x}%, ${y}%) rotate(${r}deg) scale(${s})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [intensity]);

  return (
    <div className="grid grid-cols-3 gap-2">
      {CAMERA_PRESETS.map((p, i) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          title={p.hint}
          className={cn("group text-left rounded-xl overflow-hidden ring-1 transition", value === p.id ? "ring-2 ring-white bg-white/10" : "ring-white/10 hover:ring-white/35")}
        >
          <div className="relative aspect-[4/5] overflow-hidden bg-black">
            <div
              ref={(el) => {
                tiles.current[i] = el;
              }}
              className="absolute inset-0 will-change-transform"
              style={imageUrl ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "linear-gradient(180deg,#1e3a8a 0%,#7c3aed 45%,#fb923c 70%,#0f172a 71%,#020617 100%)" }}
            >
              {!imageUrl && <div className="absolute left-[30%] top-[28%] size-[34%] rounded-full bg-amber-200/90 blur-[1px]" />}
            </div>
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 to-transparent" />
          </div>
          <div className="px-1.5 py-1.5 text-[11px] leading-tight text-white/85 min-h-[30px]">{p.label}</div>
        </button>
      ))}
    </div>
  );
}
