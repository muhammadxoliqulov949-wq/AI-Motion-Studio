"use client";

import type { RefObject } from "react";
import { EMOTIONS } from "../catalog/emotions";

const CHIPS = ["excited", "cheerful", "calm", "serious", "sad", "whisper", "curious", "dramatic", "slow", "fast"] as const;

/** Inserts `[tag] ` at the cursor of a controlled textarea and moves the cursor after it. */
export const insertTag = (ref: RefObject<HTMLTextAreaElement | null>, value: string, set: (v: string) => void, tag: string) => {
  const el = ref.current;
  const at = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? at;
  const before = value.slice(0, at);
  // Put a space before the tag when it follows a word.
  const lead = before && !/\s$/.test(before) ? " " : "";
  const inserted = `${lead}[${tag}] `;
  set(before + inserted + value.slice(end));
  requestAnimationFrame(() => {
    el?.focus();
    const pos = at + inserted.length;
    el?.setSelectionRange(pos, pos);
  });
};

/**
 * Quick-insert chips for [emotion] tags, ElevenLabs style. A tag sets the delivery of the text after
 * it, up to the next tag; [neutral] resets and [pause 1s] adds silence.
 */
export function EmotionTagBar({ onInsert, compact = false }: { onInsert: (tag: string) => void; compact?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {CHIPS.map((id) => {
          const e = EMOTIONS.find((x) => x.id === id)!;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onInsert(id)}
              title={`[${id}] — keyingi matn "${e.label.toLowerCase()}" o'qiladi`}
              className="h-6 px-2 rounded-full text-[10.5px] text-violet-200 ring-1 ring-violet-400/30 hover:bg-violet-500/15"
            >
              {e.label}
            </button>
          );
        })}
        <button type="button" onClick={() => onInsert("pause 1s")} title="[pause 1s] — 1 soniya jimlik" className="h-6 px-2 rounded-full text-[10.5px] text-sky-200 ring-1 ring-sky-400/30 hover:bg-sky-500/15">
          Pauza
        </button>
        <button type="button" onClick={() => onInsert("neutral")} title="[neutral] — oddiy ohangga qaytish" className="h-6 px-2 rounded-full text-[10.5px] text-white/60 ring-1 ring-white/15 hover:bg-white/10">
          Oddiy
        </button>
      </div>
      {!compact && (
        <p className="mt-1.5 text-[10px] text-white/35 leading-relaxed">
          Teg o&apos;zidan keyingi matnga ta&apos;sir qiladi (keyingi tegacha): <span className="text-white/55">[excited] Ajoyib yangilik! [pause] [whisper] Sir…</span> O&apos;zingiz ham yozishingiz mumkin, masalan [sarcastically].
        </p>
      )}
    </div>
  );
}
