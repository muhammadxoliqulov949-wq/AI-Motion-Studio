"use client";

import { Player } from "@remotion/player";
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { runAgent } from "@/editor/ai-agent";
import { TimelineComposition } from "@/editor/composition/TimelineComposition";
import { createInitialProject } from "@/editor/ops";
import { createSampleAssets } from "@/editor/sample-media";
import { projectDuration } from "@/editor/utils";

export const HERO_PROMPT = 'Sinematik qil, o\'tishlar silliq bo\'lsin, sarlavha: "Toshkent tunlari"';

/** A real edit produced by the same agent + composition the editor uses. */
export default function HeroPlayer() {
  const { project, assets } = useMemo(() => {
    const assets = createSampleAssets();
    const raw = createInitialProject(assets);
    const shortened = runAgent("20 soniyaga qisqartir", raw, assets, null).project;
    return { project: runAgent(HERO_PROMPT, shortened, assets, null).project, assets };
  }, []);
  const duration = Math.ceil(projectDuration(project) * project.fps);

  return (
    <div className="relative">
      <div className="absolute -inset-10 bg-gradient-to-tr from-violet-600/30 via-fuchsia-500/20 to-orange-400/20 blur-3xl rounded-full" />
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/15 shadow-2xl bg-black">
        <Player
          component={TimelineComposition}
          inputProps={{ project, assets }}
          durationInFrames={duration}
          fps={project.fps}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{ width: "100%", aspectRatio: "16 / 9" }}
          autoPlay
          loop
          initiallyMuted
          acknowledgeRemotionLicense
        />
      </div>
      <div className="relative mt-3 sm:mt-0 sm:absolute sm:-bottom-6 sm:-right-6 sm:w-80 rounded-xl bg-[#121216]/95 backdrop-blur ring-1 ring-white/10 p-3 shadow-xl">
        <div className="flex gap-2 items-start">
          <span className="size-6 shrink-0 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center">
            <Sparkles className="size-3 text-white" />
          </span>
          <div className="text-[12px] leading-snug">
            <div className="text-white/45 mb-0.5">Foydalanuvchi so&apos;radi:</div>
            <div className="text-white">“{HERO_PROMPT}”</div>
            <div className="mt-1.5 text-emerald-300/90">✓ 55s xom material → tayyor montaj</div>
          </div>
        </div>
      </div>
    </div>
  );
}
