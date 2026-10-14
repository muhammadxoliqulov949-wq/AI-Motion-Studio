"use client";

import { Braces, Clapperboard, type LucideIcon, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { createInitialProject, removeClip, splitAt } from "../ops";
import { createSampleAssets, renderDemoMusic } from "../sample-media";
import { EditorProvider, useEditor } from "../store";
import { projectDuration } from "../utils";
import { AiPanel } from "./AiPanel";
import { CodeView } from "./CodeView";
import { ExportDialog } from "./ExportDialog";
import { Inspector } from "./Inspector";
import { LibraryPanel } from "./LibraryPanel";
import { PreviewPanel } from "./PreviewPanel";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";

export default function EditorShell() {
  const assets = useMemo(createSampleAssets, []);
  const project = useMemo(() => createInitialProject(assets), [assets]);
  return (
    <EditorProvider initialProject={project} initialAssets={assets}>
      <Editor />
    </EditorProvider>
  );
}

type SideTab = "ai" | "media" | "inspector" | "code";

const TAB_META: Record<SideTab, { label: string; short: string; icon: LucideIcon }> = {
  ai: { label: "AI Montajchi", short: "AI", icon: Sparkles },
  media: { label: "Media", short: "Media", icon: Clapperboard },
  inspector: { label: "Xususiyatlar", short: "Sozlama", icon: SlidersHorizontal },
  code: { label: "Kod", short: "Kod", icon: Braces },
};

const useIsDesktop = () => {
  const query = "(min-width: 1024px)";
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return desktop;
};

function Editor() {
  const { addAssets, selectedId } = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [tab, setTab] = useState<SideTab>("ai");
  const desktop = useIsDesktop();

  useEffect(() => {
    renderDemoMusic().then((music) => addAssets([music])).catch(console.error);
  }, []);

  useEffect(() => {
    if (desktop && tab === "media") setTab("ai");
  }, [desktop, tab]);

  useShortcuts();

  const tabs: SideTab[] = desktop ? ["ai", "inspector", "code"] : ["ai", "media", "inspector", "code"];

  const tabBar = (
    <div className="h-10 shrink-0 flex items-end gap-1 px-2 border-b border-white/[0.06] overflow-x-auto">
      {tabs.map((id) => {
        const { label, short, icon: Icon } = TAB_META[id];
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "relative h-9 px-3 shrink-0 inline-flex items-center gap-1.5 text-xs font-medium transition-colors",
              tab === id ? "text-white" : "text-white/45 hover:text-white/80",
            )}
          >
            <Icon className={cn("size-3.5", id === "ai" && "text-violet-300")} />
            {desktop ? label : short}
            {id === "inspector" && selectedId && tab !== "inspector" && <span className="size-1.5 rounded-full bg-violet-400" />}
            {tab === id && (
              <span className={cn("absolute left-2 right-2 -bottom-px h-0.5 rounded-full", id === "ai" ? "bg-gradient-to-r from-violet-400 to-fuchsia-400" : "bg-white")} />
            )}
          </button>
        );
      })}
    </div>
  );

  const tabContent = (
    <div className="flex-1 min-h-0 overflow-y-auto panel-scroll">
      {/* Keep the chat mounted so history survives tab switches. */}
      <div className={cn("h-full", tab !== "ai" && "hidden")}>
        <AiPanel onBusyChange={setAiBusy} />
      </div>
      {tab === "media" && <LibraryPanel />}
      {tab === "inspector" && <Inspector />}
      {tab === "code" && <CodeView />}
    </div>
  );

  if (!desktop) {
    return (
      <div className="h-dvh w-screen flex flex-col bg-[#09090b] text-white overflow-hidden">
        <TopBar onExport={() => setExportOpen(true)} compact />
        <div className="h-[32vh] min-h-[200px] shrink-0">
          <PreviewPanel aiBusy={aiBusy} compact />
        </div>
        <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.06] bg-[#0e0e12]">
          {tabBar}
          {tabContent}
        </div>
        <section className="h-[210px] shrink-0 border-t border-white/[0.06] bg-[#0b0b0e]">
          <Timeline compact />
        </section>
        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#09090b] text-white overflow-hidden">
      <TopBar onExport={() => setExportOpen(true)} />
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[300px] shrink-0 border-r border-white/[0.06] bg-[#0e0e12]">
          <LibraryPanel />
        </aside>
        <main className="flex-1 min-w-0">
          <PreviewPanel aiBusy={aiBusy} />
        </main>
        <aside className="w-[380px] shrink-0 border-l border-white/[0.06] bg-[#0e0e12] flex flex-col min-h-0">
          {tabBar}
          {tabContent}
        </aside>
      </div>
      <section className="h-[clamp(230px,36vh,330px)] shrink-0 border-t border-white/[0.06] bg-[#0b0b0e]">
        <Timeline />
      </section>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function useShortcuts() {
  const { project, selectedId, commit, select, undo, redo, togglePlay, seek, playhead } = useEditor();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable=true]")) return;
      const time = playhead.getFrame() / project.fps;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "s" && !mod) {
        commit(splitAt(project, time, selectedId ?? undefined));
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        commit(removeClip(project, selectedId, e.shiftKey));
        select(null);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = (e.shiftKey ? 1 : 1 / project.fps) * (e.key === "ArrowLeft" ? -1 : 1);
        seek(time + delta);
      } else if (e.key === "Home") {
        seek(0);
      } else if (e.key === "End") {
        seek(projectDuration(project));
      } else if (e.key === "Escape") {
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, selectedId, commit, select, undo, redo, togglePlay, seek, playhead]);
}
