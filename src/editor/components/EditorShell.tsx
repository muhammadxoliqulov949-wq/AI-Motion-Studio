"use client";

import { Braces, Clapperboard, type LucideIcon, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { createInitialProject, duplicateClip, insertClip, kindsForClip, removeClip, splitAt, trimToPlayhead } from "../ops";
import { createSampleAssets, renderDemoMusic } from "../sample-media";
import { EditorProvider, useEditor } from "../store";
import { loadMedia } from "../media-store";
import { loadSaved, saveProject } from "../persist";
import type { Clip } from "../types";
import { projectDuration, round, uid } from "../utils";
import { AiPanel } from "./AiPanel";
import { AssetPanel, type AssetTab } from "./AssetPanel";
import { CodeView } from "./CodeView";
import { ExportDialog } from "./ExportDialog";
import { Inspector } from "./Inspector";
import { PreviewPanel } from "./PreviewPanel";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";

export default function EditorShell() {
  const initial = useMemo(() => {
    const demo = createSampleAssets().map((a) => ({ ...a, origin: "demo" as const }));
    return loadSaved(demo) ?? { project: createInitialProject(demo), assets: demo };
  }, []);
  return (
    <EditorProvider initialProject={initial.project} initialAssets={initial.assets}>
      <Editor />
    </EditorProvider>
  );
}

type SideTab = "inspector" | "ai" | "code" | "media";

const TAB_META: Record<SideTab, { label: string; short: string; icon: LucideIcon }> = {
  inspector: { label: "Xususiyatlar", short: "Sozlama", icon: SlidersHorizontal },
  ai: { label: "AI montajchi", short: "AI", icon: Sparkles },
  code: { label: "JSON", short: "JSON", icon: Braces },
  media: { label: "Kutubxona", short: "Kutubxona", icon: Clapperboard },
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
  const { addAssets, selectedId, project, assets } = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [tab, setTab] = useState<SideTab>("inspector");
  const [assetTab, setAssetTab] = useState<AssetTab>("media");
  const [saved, setSaved] = useState(true);
  const desktop = useIsDesktop();

  useEffect(() => {
    renderDemoMusic()
      .then((music) => addAssets([{ ...music, origin: "demo" }]))
      .catch(console.error);
    // Re-attach uploaded / generated files saved in IndexedDB.
    void loadMedia().then((media) => media.length && addAssets(media));
  }, []);

  // Autosave (debounced). Object URLs from uploads are not persisted.
  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => {
      if (saveProject(project, assets)) setSaved(true);
    }, 700);
    return () => clearTimeout(t);
  }, [project, assets]);

  useEffect(() => {
    if (desktop && tab === "media") setTab("inspector");
  }, [desktop, tab]);

  useShortcuts();

  const tabs: SideTab[] = desktop ? ["inspector", "ai", "code"] : ["ai", "media", "inspector", "code"];

  const tabBar = (
    <div className="h-10 shrink-0 flex items-end gap-1 px-2 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
      {tabs.map((id) => {
        const { label, short, icon: Icon } = TAB_META[id];
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn("relative h-9 px-3 shrink-0 inline-flex items-center gap-1.5 text-xs font-medium transition-colors", tab === id ? "text-white" : "text-white/45 hover:text-white/80")}
          >
            <Icon className={cn("size-3.5", id === "ai" && "text-fuchsia-300")} />
            {desktop ? label : short}
            {id === "inspector" && selectedId && tab !== "inspector" && <span className="size-1.5 rounded-full bg-cyan-300" />}
            {tab === id && <span className={cn("absolute left-2 right-2 -bottom-px h-0.5 rounded-full", id === "ai" ? "bg-gradient-to-r from-fuchsia-400 to-violet-400" : "bg-cyan-300")} />}
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
      {tab === "media" && (
        <div className="h-full">
          <AssetPanel tab={assetTab} onTab={setAssetTab} />
        </div>
      )}
      {tab === "inspector" && <Inspector />}
      {tab === "code" && <CodeView />}
    </div>
  );

  if (!desktop) {
    return (
      <div className="h-dvh w-screen flex flex-col bg-[#0a0a0c] text-white overflow-hidden">
        <TopBar onExport={() => setExportOpen(true)} compact saved={saved} />
        <div className="h-[30vh] min-h-[190px] shrink-0">
          <PreviewPanel aiBusy={aiBusy} compact />
        </div>
        <div className="flex-1 min-h-0 flex flex-col border-t border-white/[0.06] bg-[#111115]">
          {tabBar}
          {tabContent}
        </div>
        <section className="h-[220px] shrink-0 border-t border-white/[0.06] bg-[#0b0b0e]">
          <Timeline compact />
        </section>
        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0c] text-white overflow-hidden">
      <TopBar onExport={() => setExportOpen(true)} saved={saved} />
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[340px] xl:w-[380px] shrink-0 border-r border-white/[0.06] bg-[#111115]">
          <AssetPanel tab={assetTab} onTab={setAssetTab} />
        </aside>
        <main className="flex-1 min-w-0">
          <PreviewPanel aiBusy={aiBusy} />
        </main>
        <aside className="w-[330px] xl:w-[360px] shrink-0 border-l border-white/[0.06] bg-[#111115] flex flex-col min-h-0">
          {tabBar}
          {tabContent}
        </aside>
      </div>
      <section className="h-[clamp(240px,38vh,380px)] shrink-0 border-t border-white/[0.06] bg-[#0b0b0e]">
        <Timeline />
      </section>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function useShortcuts() {
  const { project, assets, selectedId, commit, select, undo, redo, togglePlay, seek, playhead, clipboard } = useEditor();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest?.("input, textarea, select, [contenteditable=true]")) return;
      const time = playhead.getFrame() / project.fps;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        redo();
      } else if (mod && key === "c" && selectedId) {
        clipboard.current = project.clips.find((c) => c.id === selectedId) ?? null;
      } else if (mod && key === "x" && selectedId) {
        clipboard.current = project.clips.find((c) => c.id === selectedId) ?? null;
        commit(removeClip(project, selectedId));
        select(null);
      } else if (mod && key === "v" && clipboard.current) {
        e.preventDefault();
        const src = clipboard.current;
        const copy = { ...src, id: uid(src.type === "media" ? "clip" : src.type), start: round(time, 3) } as Clip;
        const asset = copy.type === "media" ? assets.find((a) => a.id === copy.assetId) : undefined;
        commit(insertClip(project, copy, kindsForClip(copy, asset), src.trackId));
        select(copy.id);
      } else if (mod && key === "d" && selectedId) {
        e.preventDefault();
        const r = duplicateClip(project, selectedId);
        commit(r.project);
        if (r.id) select(r.id);
      } else if (mod && key === "b") {
        e.preventDefault();
        commit(splitAt(project, time, selectedId ?? undefined));
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (key === "s" && !mod) {
        commit(splitAt(project, time, selectedId ?? undefined));
      } else if (key === "q" && !mod && selectedId) {
        commit(trimToPlayhead(project, selectedId, time, "left"));
      } else if (key === "w" && !mod && selectedId) {
        commit(trimToPlayhead(project, selectedId, time, "right"));
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
  }, [project, assets, selectedId, commit, select, undo, redo, togglePlay, seek, playhead, clipboard]);
}
