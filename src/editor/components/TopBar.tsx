"use client";

import { ChevronLeft, Download, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ASPECTS } from "../presets";
import { useEditor } from "../store";
import type { AspectRatio } from "../types";
import { Logo } from "@/components/Logo";

export function TopBar({ onExport, compact = false }: { onExport: () => void; compact?: boolean }) {
  const { project, commit, preview, checkpoint, undo, redo, canUndo, canRedo } = useEditor();
  const ib = "size-8 grid place-items-center rounded-md text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <header className="h-13 shrink-0 flex items-center gap-2 lg:gap-3 px-2 lg:px-3 border-b border-white/[0.06] bg-[#0b0b0e]">
      <Link href="/" className="flex items-center gap-2 pr-2 lg:pr-3 shrink-0 border-r border-white/[0.06] text-white/60 hover:text-white">
        <ChevronLeft className="size-4" />
        <Logo size={26} />
      </Link>
      <div className="flex items-center gap-2 min-w-0 flex-1 lg:flex-none">
        {!compact && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider text-violet-200 bg-violet-500/15">Montaj + AI</span>
        )}
        <input
          value={project.name}
          onFocus={checkpoint}
          onChange={(e) => preview({ ...project, name: e.target.value })}
          className="bg-transparent text-sm font-medium text-white outline-none rounded px-1.5 py-1 hover:bg-white/5 focus:bg-white/10 w-full lg:w-56 min-w-0 truncate"
        />
        <span className="text-[11px] text-white/30 hidden xl:inline shrink-0">Avtomatik saqlandi</span>
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
        <div className="flex rounded-lg bg-white/5 p-0.5">
          {(Object.keys(ASPECTS) as AspectRatio[]).map((a) => (
            <button
              key={a}
              onClick={() => commit({ ...project, aspect: a })}
              className={cn(
                "px-2 lg:px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                project.aspect === a ? "bg-white text-black" : "text-white/55 hover:text-white",
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onExport}
        title="Eksport"
        className="h-8 px-2.5 lg:px-3.5 shrink-0 inline-flex items-center gap-2 rounded-lg bg-white text-black text-[13px] font-semibold hover:bg-white/90"
      >
        <Download className="size-4" />
        {!compact && "Eksport"}
      </button>
    </header>
  );
}
