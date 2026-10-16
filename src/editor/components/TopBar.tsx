"use client";

import { Check, ChevronDown, ChevronLeft, CloudOff, Download, FilePlus2, Keyboard, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { ASPECTS } from "../presets";
import { useEditor } from "../store";
import type { AspectRatio } from "../types";
import { TemplatePicker } from "./TemplatePicker";

const SHORTCUTS: [string, string][] = [
  ["Space", "Ijro / pauza"],
  ["S · Ctrl+B", "Playheadda kesish"],
  ["Q / W", "Chap / o'ng qismini kesib tashlash"],
  ["Delete", "O'chirish (Shift — ripple)"],
  ["Ctrl+C / X / V", "Nusxa / kesib olish / qo'yish"],
  ["Ctrl+D", "Klip nusxasi"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Bekor qilish / qaytarish"],
  ["← / →", "1 kadr (Shift — 1 soniya)"],
  ["Home / End", "Boshi / oxiri"],
  ["Ctrl + g'ildirak", "Timeline zoom"],
  ["Esc", "Tanlovni bekor qilish"],
];

export function TopBar({ onExport, compact = false, saved = true }: { onExport: () => void; compact?: boolean; saved?: boolean }) {
  const { project, commit, preview, checkpoint, undo, redo, canUndo, canRedo } = useEditor();
  const [aspectOpen, setAspectOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const ib = "size-8 grid place-items-center rounded-md text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <header className="h-12 shrink-0 flex items-center gap-2 lg:gap-3 px-2 lg:px-3 border-b border-white/[0.06] bg-[#0c0c0f] relative z-40">
      <Link href="/" className="flex items-center gap-2 pr-2 lg:pr-3 shrink-0 border-r border-white/[0.06] text-white/60 hover:text-white">
        <ChevronLeft className="size-4" />
        <Logo size={24} />
      </Link>
      <div className="flex items-center gap-2 min-w-0 flex-1 lg:flex-none">
        <input
          value={project.name}
          onFocus={checkpoint}
          onChange={(e) => preview({ ...project, name: e.target.value })}
          className="bg-transparent text-sm font-medium text-white outline-none rounded px-1.5 py-1 hover:bg-white/5 focus:bg-white/10 w-full lg:w-56 min-w-0 truncate"
        />
        {!compact && (
          <span className={cn("text-[11px] hidden xl:inline-flex items-center gap-1 shrink-0", saved ? "text-white/35" : "text-white/25")}>
            {saved ? <Check className="size-3" /> : <CloudOff className="size-3" />}
            {saved ? "Brauzerda saqlandi" : "Saqlanmoqda…"}
          </span>
        )}
      </div>

      <div className={cn("flex items-center gap-1 shrink-0", !compact && "mx-auto")}>
        {!compact && (
          <>
            <button className={ib} onClick={undo} disabled={!canUndo} title="Bekor qilish (Ctrl+Z)">
              <Undo2 className="size-4" />
            </button>
            <button className={ib} onClick={redo} disabled={!canRedo} title="Qaytarish (Ctrl+Shift+Z)">
              <Redo2 className="size-4" />
            </button>
            <div className="w-px h-5 bg-white/10 mx-2" />
          </>
        )}
        <div className="relative">
          <button
            onClick={() => setAspectOpen(!aspectOpen)}
            className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-[12px] font-medium text-white inline-flex items-center gap-1.5"
          >
            <span className="border border-white/70 rounded-[2px]" style={{ width: (ASPECTS[project.aspect].width / Math.max(ASPECTS[project.aspect].width, ASPECTS[project.aspect].height)) * 14, height: (ASPECTS[project.aspect].height / Math.max(ASPECTS[project.aspect].width, ASPECTS[project.aspect].height)) * 14 }} />
            {project.aspect}
            <ChevronDown className="size-3 text-white/50" />
          </button>
          {aspectOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 top-10 w-56 rounded-xl bg-[#1a1a20] ring-1 ring-white/10 shadow-2xl p-1.5" onMouseLeave={() => setAspectOpen(false)}>
              {(Object.keys(ASPECTS) as AspectRatio[]).map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    commit({ ...project, aspect: a });
                    setAspectOpen(false);
                  }}
                  className={cn("w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left", project.aspect === a ? "bg-cyan-400/15" : "hover:bg-white/[0.06]")}
                >
                  <span className="w-5 grid place-items-center">
                    <span className="border border-white/60 rounded-[2px]" style={{ width: (ASPECTS[a].width / Math.max(ASPECTS[a].width, ASPECTS[a].height)) * 16, height: (ASPECTS[a].height / Math.max(ASPECTS[a].width, ASPECTS[a].height)) * 16 }} />
                  </span>
                  <span className="text-xs text-white font-medium w-10">{a}</span>
                  <span className="text-[11px] text-white/45 truncate">{ASPECTS[a].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="relative">
          <button className={ib} onClick={() => setKeysOpen(!keysOpen)} title="Tezkor tugmalar">
            <Keyboard className="size-4" />
          </button>
          {keysOpen && (
            <div className="absolute right-0 top-10 w-80 rounded-xl bg-[#1a1a20] ring-1 ring-white/10 shadow-2xl p-3" onMouseLeave={() => setKeysOpen(false)}>
              <div className="text-xs font-semibold text-white mb-2">Tezkor tugmalar</div>
              <div className="space-y-1.5">
                {SHORTCUTS.map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-white/60">{label}</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-mono text-[10px] whitespace-nowrap">{k}</kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <button
        className={cn(ib, !compact && "w-auto px-2.5 gap-1.5 text-[12px] inline-flex items-center")}
        title="Yangi loyiha va shablonlar"
        onClick={() => setTemplatesOpen(true)}
      >
        <FilePlus2 className="size-4" />
        {!compact && "Shablonlar"}
      </button>
      <TemplatePicker open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <button
        onClick={onExport}
        title="Eksport"
        className="h-8 px-2.5 lg:px-3.5 shrink-0 inline-flex items-center gap-2 rounded-lg bg-cyan-400 text-black text-[13px] font-semibold hover:bg-cyan-300"
      >
        <Download className="size-4" />
        {!compact && "Eksport"}
      </button>
    </header>
  );
}
