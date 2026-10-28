"use client";

import { Dices, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EXAMPLE_CATEGORIES, exampleImage, GEN_EXAMPLES, PROMPT_BOOSTERS, type ExampleCategory, type GenExample } from "../examples";
import { Chips } from "./kit";

const ratio = (aspect: string) => {
  const [w, h] = aspect.split(":").map(Number);
  return w && h ? w / h : 1;
};

/** Card picture; falls back to a gradient if the file is missing. */
function Thumb({ example, className }: { example: GenExample; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className={cn("block bg-gradient-to-br from-violet-500/40 via-fuchsia-500/25 to-orange-400/25", className)} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={exampleImage(example)} alt={example.title} loading="lazy" onError={() => setFailed(true)} className={cn("object-cover", className)} />
  );
}

/** Idea gallery shown before the user writes anything: tap a card to load its prompt, style and format. */
export function ExampleGallery({ onPick, actionLabel = "Shuni olish" }: { onPick: (e: GenExample) => void; actionLabel?: string }) {
  const [category, setCategory] = useState<ExampleCategory | "all">("all");
  const list = GEN_EXAMPLES.filter((e) => category === "all" || e.category === category);
  return (
    <div>
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1 mb-3">
        <Chips value={category} options={EXAMPLE_CATEGORIES} onChange={setCategory} size="sm" />
      </div>
      <div className="columns-2 sm:columns-3 gap-2.5 [column-fill:_balance]">
        {list.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e)}
            className="group relative mb-2.5 block w-full break-inside-avoid rounded-xl overflow-hidden ring-1 ring-white/[0.08] hover:ring-violet-400/70 bg-black text-left"
            style={{ aspectRatio: ratio(e.aspect) }}
          >
            <Thumb example={e} className="absolute inset-0 size-full transition-transform duration-500 group-hover:scale-105" />
            <span className="absolute inset-x-0 bottom-0 p-2.5 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
              <span className="block text-[12px] font-semibold text-white leading-tight">{e.title}</span>
              <span className="block mt-0.5 text-[10.5px] text-white/60 line-clamp-2 leading-snug">{e.prompt}</span>
            </span>
            <span className="absolute top-2 right-2 h-6 px-2 rounded-md bg-black/60 text-[10px] text-white/90 inline-flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
              <Plus className="size-3" /> {actionLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Compact horizontal strip of the same ideas, for the controls column. */
export function ExampleStrip({ onPick, active }: { onPick: (e: GenExample) => void; active?: string | null }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
      {GEN_EXAMPLES.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onPick(e)}
          title={e.prompt}
          className={cn("shrink-0 w-[76px] text-left rounded-xl overflow-hidden ring-2 transition", active === e.id ? "ring-white" : "ring-transparent opacity-80 hover:opacity-100")}
        >
          <Thumb example={e} className="block w-[76px] h-[76px]" />
          <span className="block px-1 py-1 text-[9.5px] leading-tight text-white/70 bg-white/[0.04] line-clamp-2 h-[30px]">{e.title}</span>
        </button>
      ))}
    </div>
  );
}

/** "Random idea" button. */
export function RandomIdea({ onPick }: { onPick: (e: GenExample) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(GEN_EXAMPLES[Math.floor(Math.random() * GEN_EXAMPLES.length)])}
      className="h-7 px-2.5 rounded-lg text-[11.5px] ring-1 ring-white/12 text-white/70 hover:text-white hover:ring-violet-400/50 inline-flex items-center gap-1.5"
    >
      <Dices className="size-3.5" /> Tasodifiy g&apos;oya
    </button>
  );
}

/** Tap-to-add words (lighting, camera, mood) that make a short prompt richer. */
export function PromptBoosters({ prompt, onChange }: { prompt: string; onChange: (p: string) => void }) {
  const has = (phrase: string) => prompt.toLowerCase().includes(phrase.toLowerCase());
  const toggle = (phrase: string) => {
    if (has(phrase)) {
      onChange(
        prompt
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && s.toLowerCase() !== phrase.toLowerCase())
          .join(", "),
      );
    } else {
      const base = prompt.trim().replace(/,\s*$/, "");
      onChange(base ? `${base}, ${phrase}` : phrase);
    }
  };
  return (
    <div className="space-y-2">
      {PROMPT_BOOSTERS.map((g) => (
        <div key={g.group} className="flex items-center gap-2">
          <span className="w-[62px] shrink-0 text-[10.5px] text-white/40">{g.group}</span>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {g.items.map(([phrase, label]) => (
              <button
                key={phrase}
                type="button"
                onClick={() => toggle(phrase)}
                title={phrase}
                className={cn(
                  "shrink-0 h-7 px-2.5 rounded-lg text-[11.5px] ring-1 transition-colors",
                  has(phrase) ? "bg-violet-500/20 ring-violet-400/60 text-white" : "ring-white/10 text-white/60 hover:text-white hover:ring-white/30",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
