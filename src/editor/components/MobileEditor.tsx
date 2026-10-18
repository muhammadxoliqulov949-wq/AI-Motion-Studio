"use client";

import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clapperboard,
  Copy,
  Diamond,
  Gauge,
  type LucideIcon,
  Maximize2,
  Move,
  Music2,
  Palette,
  Pause,
  Play,
  Redo2,
  Scissors,
  Settings2,
  Shuffle,
  SlidersHorizontal,
  Smile,
  Sparkles,
  SquareDashed,
  Trash2,
  Type,
  Undo2,
  Volume2,
  Wand2,
} from "lucide-react";
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { duplicateClip, removeClip, splitAt, trimToPlayhead } from "../ops";
import { useCurrentTime, useEditor, useIsPlaying } from "../store";
import type { Clip } from "../types";
import { formatTime, projectDuration } from "../utils";
import { AiPanel } from "./AiPanel";
import { ASSET_TABS, AssetPanel, type AssetTab } from "./AssetPanel";
import { AutoCaptions } from "./AutoCaptions";
import { ExportDialog } from "./ExportDialog";
import { Inspector } from "./Inspector";
import { MobileTimeline } from "./MobileTimeline";
import { PreviewPanel } from "./PreviewPanel";
import { TopBar } from "./TopBar";
import { useKeyframeToggle } from "./use-keyframe-toggle";

type Sheet =
  | { kind: "assets"; tab: AssetTab }
  | { kind: "inspector"; tab?: string; title: string }
  | { kind: "ai" }
  | { kind: "captions" }
  | { kind: "project" };

interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
  disabled?: boolean;
  /** Custom button (for tools whose look depends on the playhead, e.g. Keyframe add/remove). */
  render?: () => React.ReactNode;
}

/** Short vibration on supported phones (Android); silently ignored elsewhere. */
const buzz = () => {
  try {
    // Chrome blocks vibrate() until the user has interacted with the page.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
  } catch {
    /* not supported */
  }
};

/**
 * Phone editor (CapCut-mobile layout): preview on top, transport, a timeline with a fixed centre
 * playhead, and a bottom toolbar. Libraries and clip settings open as bottom sheets in place of the
 * timeline so the preview stays visible. The desktop editor is untouched (see EditorShell).
 */
export function MobileEditor({ saved, aiBusy, onAiBusyChange, showStart = false }: { saved: boolean; aiBusy: boolean; onAiBusyChange: (busy: boolean) => void; showStart?: boolean }) {
  const { project, assets, selectedId, select, commit, playhead } = useEditor();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const selected = project.clips.find((c) => c.id === selectedId);
  const asset = selected?.type === "media" ? assets.find((a) => a.id === selected.assetId) : undefined;

  const open = (s: Sheet) => {
    setExpanded(false);
    setSheet(s);
  };
  const now = () => playhead.getFrame() / project.fps;

  const rootTools: Tool[] = [
    {
      id: "edit",
      label: "Tahrirlash",
      icon: Scissors,
      onClick: () => {
        // Select the main-track clip under the playhead, like CapCut's "Edit" button.
        const t = now();
        const clip = project.clips.find((c) => c.trackId === "V1" && c.start <= t && t < c.start + c.duration) ?? project.clips.find((c) => c.trackId === "V1");
        if (clip) select(clip.id);
      },
    },
    { id: "audio", label: "Audio", icon: Music2, onClick: () => open({ kind: "assets", tab: "audio" }) },
    { id: "text", label: "Matn", icon: Type, onClick: () => open({ kind: "assets", tab: "text" }) },
    { id: "stickers", label: "Stiker", icon: Smile, onClick: () => open({ kind: "assets", tab: "stickers" }) },
    { id: "effects", label: "Effekt", icon: Sparkles, onClick: () => open({ kind: "assets", tab: "effects" }) },
    { id: "filters", label: "Filtr", icon: Palette, onClick: () => open({ kind: "assets", tab: "filters" }) },
    { id: "transitions", label: "O'tish", icon: Shuffle, onClick: () => open({ kind: "assets", tab: "transitions" }) },
    { id: "ai", label: "AI", icon: Wand2, accent: true, onClick: () => open({ kind: "ai" }) },
    { id: "captions", label: "Subtitr", icon: Captions, onClick: () => open({ kind: "captions" }) },
    { id: "media", label: "Media", icon: Clapperboard, onClick: () => open({ kind: "assets", tab: "media" }) },
    { id: "project", label: "Loyiha", icon: Settings2, onClick: () => open({ kind: "project" }) },
  ];

  const clipTools = selected ? toolsForClip(selected, asset?.kind, {
    inspect: (tab, title) => open({ kind: "inspector", tab, title }),
    split: () => {
      buzz();
      commit(splitAt(project, now(), selected.id));
    },
    duplicate: () => {
      const r = duplicateClip(project, selected.id);
      commit(r.project);
      if (r.id) select(r.id);
    },
    remove: () => {
      buzz();
      commit(removeClip(project, selected.id));
      select(null);
    },
    trim: (side) => commit(trimToPlayhead(project, selected.id, now(), side)),
  }) : null;

  // While a sheet is open the preview shrinks a little; "expanded" gives the sheet most of the screen.
  const previewH = sheet ? (expanded ? "18dvh" : "32dvh") : "38dvh";

  return (
    <div className="mobile-editor h-dvh w-screen flex flex-col bg-[#0a0a0c] text-white overflow-hidden">
      <TopBar onExport={() => setExportOpen(true)} compact saved={saved} showStart={showStart} onOpenAi={() => open({ kind: "ai" })} />
      <div className="shrink-0 transition-[height] duration-200" style={{ height: previewH }}>
        <PreviewPanel aiBusy={aiBusy} compact hideTransport />
      </div>
      <MobileTransport />

      {/* The AI chat stays mounted so its history survives closing the sheet. */}
      <div className={cn("flex-1 min-h-0 flex-col", sheet?.kind === "ai" ? "flex" : "hidden")}>
        <SheetHeader title="AI montajchi" expanded={expanded} onExpand={() => setExpanded(!expanded)} onClose={() => setSheet(null)} />
        <div className="flex-1 min-h-0 overflow-y-auto panel-scroll">
          <AiPanel onBusyChange={onAiBusyChange} />
        </div>
      </div>

      {sheet && sheet.kind !== "ai" ? (
        <div className="flex-1 min-h-0 flex flex-col bg-[#111115] border-t border-white/[0.06] animate-in slide-in-from-bottom-4 duration-200">
          {sheet.kind === "assets" ? (
            <>
              <SheetHeader
                title={ASSET_TABS.find((t) => t.id === sheet.tab)?.label ?? ""}
                expanded={expanded}
                onExpand={() => setExpanded(!expanded)}
                onClose={() => setSheet(null)}
              />
              <div className="shrink-0 flex gap-1 px-2 pb-2 overflow-x-auto no-scrollbar">
                {ASSET_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setSheet({ kind: "assets", tab: id })}
                    className={cn("h-8 px-3 shrink-0 rounded-full text-[12px] inline-flex items-center gap-1.5", sheet.tab === id ? "bg-white text-black font-semibold" : "bg-white/[0.06] text-white/70")}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0">
                <AssetPanel tab={sheet.tab} onTab={(tab) => setSheet({ kind: "assets", tab })} rail={false} />
              </div>
            </>
          ) : (
            <>
              <SheetHeader
                title={sheet.kind === "inspector" ? sheet.title : sheet.kind === "captions" ? "Avto-subtitr" : "Loyiha sozlamalari"}
                expanded={expanded}
                onExpand={() => setExpanded(!expanded)}
                onClose={() => setSheet(null)}
              />
              <div className="flex-1 min-h-0 overflow-y-auto panel-scroll">
                {sheet.kind === "inspector" && (selected ? <Inspector key={`${selected.id}-${sheet.tab}`} initialTab={sheet.tab} /> : <EmptySelection />)}
                {sheet.kind === "project" && <ProjectSheet />}
                {sheet.kind === "captions" && (
                  <div className="p-4">
                    <AutoCaptions />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {!sheet && (
        <>
          <div className="flex-1 min-h-0 border-t border-white/[0.06]">
            <MobileTimeline onAddMedia={() => open({ kind: "assets", tab: "media" })} />
          </div>
          <Toolbar
            tools={clipTools ?? rootTools}
            onBack={clipTools ? () => select(null) : undefined}
          />
        </>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function toolsForClip(
  clip: Clip,
  assetKind: string | undefined,
  a: {
    inspect: (tab: string | undefined, title: string) => void;
    split: () => void;
    duplicate: () => void;
    remove: () => void;
    trim: (side: "left" | "right") => void;
  },
): Tool[] {
  const split: Tool = { id: "split", label: "Kesish", icon: Scissors, onClick: a.split };
  const copy: Tool = { id: "dup", label: "Nusxa", icon: Copy, onClick: a.duplicate };
  const del: Tool = { id: "del", label: "O'chirish", icon: Trash2, onClick: a.remove, danger: true };
  const trimL: Tool = { id: "trim-l", label: "Chapini", icon: ArrowLeftToLine, onClick: () => a.trim("left") };
  const trimR: Tool = { id: "trim-r", label: "O'ngini", icon: ArrowRightToLine, onClick: () => a.trim("right") };
  const kf: Tool = { id: "kf", label: "Keyframe", icon: Diamond, onClick: () => {}, render: () => <KeyframeTool key="kf" /> };
  const anim = (title: string): Tool => ({ id: "anim", label: "Animatsiya", icon: Sparkles, onClick: () => a.inspect("anim", title) });

  if (clip.type === "text") {
    return [
      { id: "edit", label: "Tahrirlash", icon: Type, onClick: () => a.inspect("text", "Matn") },
      { id: "style", label: "Uslub", icon: Palette, onClick: () => a.inspect("style", "Matn uslubi") },
      anim("Matn animatsiyasi"),
      { id: "pos", label: "Joylashuv", icon: Move, onClick: () => a.inspect("transform", "Joylashuv") },
      split,
      copy,
      kf,
      del,
    ];
  }
  if (clip.type === "sticker") {
    return [{ id: "basic", label: "Sozlash", icon: SlidersHorizontal, onClick: () => a.inspect("basic", "Stiker") }, anim("Stiker animatsiyasi"), split, copy, kf, del];
  }
  if (clip.type === "effect") {
    return [{ id: "basic", label: "Sozlash", icon: SlidersHorizontal, onClick: () => a.inspect(undefined, "Effekt") }, split, copy, del];
  }
  if (assetKind === "audio") {
    return [split, { id: "vol", label: "Ovoz", icon: Volume2, onClick: () => a.inspect(undefined, "Ovoz") }, trimL, trimR, copy, kf, del];
  }
  const image = assetKind === "image";
  return [
    split,
    ...(!image ? [{ id: "speed", label: "Tezlik", icon: Gauge, onClick: () => a.inspect("speed", "Tezlik") }] : []),
    ...(!image ? [{ id: "vol", label: "Ovoz", icon: Volume2, onClick: () => a.inspect("audio", "Ovoz") }] : []),
    anim("Animatsiya"),
    { id: "color", label: "Rang", icon: Palette, onClick: () => a.inspect("adjust", "Filtr va rang") },
    { id: "mask", label: "Maska", icon: SquareDashed, onClick: () => a.inspect("mask", "Maska") },
    { id: "basic", label: "Sozlash", icon: SlidersHorizontal, onClick: () => a.inspect("basic", "Asosiy sozlamalar") },
    trimL,
    trimR,
    copy,
    kf,
    del,
  ];
}

function Toolbar({ tools, onBack }: { tools: Tool[]; onBack?: () => void }) {
  return (
    <nav className="shrink-0 flex items-stretch border-t border-white/[0.06] bg-[#0c0c0f] pb-[env(safe-area-inset-bottom)]">
      {onBack && (
        <button onClick={onBack} className="shrink-0 w-12 grid place-items-center border-r border-white/[0.06] text-white/70 active:bg-white/10" title="Orqaga">
          <ChevronLeft className="size-5" />
        </button>
      )}
      <div className="flex-1 flex overflow-x-auto no-scrollbar px-1">
        {tools.map(({ id, label, icon: Icon, onClick, danger, accent, disabled, render }) =>
          render ? (
            render()
          ) : (
            <button
              key={id}
              onClick={onClick}
              disabled={disabled}
              className={cn(
                "shrink-0 min-w-[62px] h-[62px] px-1.5 flex flex-col items-center justify-center gap-1 text-[10.5px] rounded-lg active:bg-white/10 disabled:opacity-30",
                danger ? "text-rose-300" : "text-white/80",
              )}
            >
              <Icon className={cn("size-[21px]", accent && "text-fuchsia-300")} />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ),
        )}
      </div>
    </nav>
  );
}

/** Adds a keyframe at the playhead, or removes the one the playhead is on (tap a ◆ on the clip to jump to it). */
function KeyframeTool() {
  const { enabled, active, toggle } = useKeyframeToggle();
  return (
    <button
      onClick={() => {
        if (toggle()) buzz();
      }}
      disabled={!enabled}
      className={cn(
        "shrink-0 min-w-[62px] h-[62px] px-1.5 flex flex-col items-center justify-center gap-1 text-[10.5px] rounded-lg active:bg-white/10 disabled:opacity-30",
        active ? "text-cyan-300" : "text-white/80",
      )}
    >
      <Diamond className={cn("size-[21px]", active && "fill-current")} />
      <span className="whitespace-nowrap">{active ? "KF o'chirish" : "Keyframe"}</span>
    </button>
  );
}

function SheetHeader({ title, expanded, onExpand, onClose }: { title: string; expanded: boolean; onExpand: () => void; onClose: () => void }) {
  return (
    <div className="shrink-0 h-11 flex items-center gap-2 pl-4 pr-2 border-b border-white/[0.06] bg-[#111115]">
      <span className="flex-1 text-[13px] font-semibold truncate">{title}</span>
      <button onClick={onExpand} className="size-9 grid place-items-center rounded-lg text-white/60 active:bg-white/10" title={expanded ? "Kichraytirish" : "Kattalashtirish"}>
        {expanded ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
      </button>
      <button onClick={onClose} className="size-9 grid place-items-center rounded-lg bg-white text-black active:scale-95" title="Tayyor">
        <Check className="size-5" />
      </button>
    </div>
  );
}

function MobileTransport() {
  const { project, togglePlay, undo, redo, canUndo, canRedo, playerRef } = useEditor();
  const time = useCurrentTime();
  const playing = useIsPlaying();
  const total = projectDuration(project);
  const ib = "size-10 grid place-items-center rounded-lg text-white/70 active:bg-white/10 disabled:opacity-25";
  return (
    <div className="shrink-0 h-12 grid grid-cols-[1fr_auto_1fr] items-center px-2 border-t border-white/[0.06] bg-[#0c0c0f]">
      <div className="pl-1 font-mono text-[11px] tabular-nums">
        <span className="text-white">{formatTime(time, project.fps).replace(/:\d\d$/, "")}</span>
        <span className="text-white/35"> / {formatTime(total, project.fps).replace(/:\d\d$/, "")}</span>
      </div>
      <button onClick={togglePlay} className="size-11 grid place-items-center rounded-full bg-white text-black active:scale-95" title="Ijro / pauza">
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current ml-0.5" />}
      </button>
      <div className="flex justify-end">
        <button className={ib} onClick={undo} disabled={!canUndo} title="Bekor qilish">
          <Undo2 className="size-[18px]" />
        </button>
        <button className={ib} onClick={redo} disabled={!canRedo} title="Qaytarish">
          <Redo2 className="size-[18px]" />
        </button>
        <button className={ib} onClick={() => playerRef.current?.requestFullscreen()} title="To'liq ekran">
          <Maximize2 className="size-[18px]" />
        </button>
      </div>
    </div>
  );
}

function EmptySelection() {
  return <div className="p-6 text-center text-[12px] text-white/40">Avval timeline&apos;da klipni tanlang</div>;
}

/** Inspector with nothing selected shows the project settings (format, grade, background…). */
function ProjectSheet() {
  const { selectedId, select } = useEditor();
  React.useEffect(() => {
    if (selectedId) select(null);
  }, [selectedId, select]);
  return selectedId ? null : <Inspector />;
}
