"use client";

import { type LucideIcon, Clapperboard, Loader2, Music2, Palette, Plus, Shuffle, Type, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { importFile } from "../import-media";
import { appendAsset, makeTextClip, updateClip } from "../ops";
import { FILTERS, TEXT_STYLES, TRANSITIONS } from "../presets";
import { useEditor } from "../store";
import type { FilterId, MediaAsset, ProjectGrade, TextStyleId, TransitionId } from "../types";
import { formatShort } from "../utils";
import { DND } from "./Timeline";

type Tab = "media" | "text" | "filters" | "transitions" | "audio";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "media", label: "Media", icon: Clapperboard },
  { id: "audio", label: "Audio", icon: Music2 },
  { id: "text", label: "Matn", icon: Type },
  { id: "filters", label: "Rang", icon: Palette },
  { id: "transitions", label: "O'tish", icon: Shuffle },
];

export function LibraryPanel() {
  const [tab, setTab] = useState<Tab>("media");
  return (
    <div className="flex h-full min-h-0">
      <nav className="w-16 shrink-0 flex flex-col items-center gap-1 py-3 border-r border-white/[0.06] bg-[#0b0b0e]">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "w-12 py-2 rounded-lg flex flex-col items-center gap-1 text-[10px] transition-colors",
              tab === id ? "bg-white/10 text-white" : "text-white/45 hover:text-white hover:bg-white/5",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-w-0 overflow-y-auto p-3 panel-scroll">
        {tab === "media" && <MediaTab kind="visual" />}
        {tab === "audio" && <MediaTab kind="audio" />}
        {tab === "text" && <TextTab />}
        {tab === "filters" && <FiltersTab />}
        {tab === "transitions" && <TransitionsTab />}
      </div>
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-2 mt-1">
      <h3 className="text-xs font-semibold text-white/80">{children}</h3>
      {hint && <span className="text-[10px] text-white/35">{hint}</span>}
    </div>
  );
}

function MediaTab({ kind }: { kind: "visual" | "audio" }) {
  const { assets, addAssets, project, commit, select } = useEditor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(0);
  const [over, setOver] = useState(false);

  const list = assets.filter((a) => (kind === "audio" ? a.kind === "audio" : a.kind !== "audio"));

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    setLoading((n) => n + arr.length);
    for (const file of arr) {
      try {
        const asset = await importFile(file);
        if (asset) addAssets([asset]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading((n) => n - 1);
      }
    }
  };

  const add = (asset: MediaAsset) => {
    const next = appendAsset(project, asset);
    commit(next);
    select(next.clips[next.clips.length - 1].id);
  };

  return (
    <div>
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "w-full rounded-xl border border-dashed p-4 flex flex-col items-center gap-1.5 text-center transition-colors",
          over ? "border-violet-400 bg-violet-500/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]",
        )}
      >
        {loading > 0 ? <Loader2 className="size-5 text-violet-300 animate-spin" /> : <Upload className="size-5 text-white/60" />}
        <span className="text-xs font-medium text-white/85">
          {loading > 0 ? `${loading} ta fayl tahlil qilinmoqda…` : kind === "audio" ? "Audio yuklash" : "Syomkalaringizni yuklang"}
        </span>
        <span className="text-[10px] text-white/40">
          {kind === "audio" ? "MP3, WAV, M4A" : "MP4, MOV, WEBM, JPG, PNG · sudrab tashlang"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={kind === "audio" ? "audio/*" : "video/*,image/*"}
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <SectionTitle hint={`${list.length} ta`}>{kind === "audio" ? "Audio fayllar" : "Loyiha medialari"}</SectionTitle>
      <div className={cn("grid gap-2", kind === "audio" ? "grid-cols-1" : "grid-cols-2")}>
        {list.map((asset) => (
          <div
            key={asset.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND.asset, asset.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => add(asset)}
            className="group relative rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-white/30 cursor-grab bg-[#16161b]"
          >
            <div
              className={cn("relative", kind === "audio" ? "h-12" : "aspect-video")}
              style={{
                background: asset.thumbs?.length ? `center/cover url(${asset.thumbs[Math.floor(asset.thumbs.length / 2)]})` : asset.gradient,
              }}
            >
              {kind === "audio" && asset.peaks && (
                <div className="absolute inset-0 flex items-center gap-[2px] px-2 opacity-70">
                  {asset.peaks.filter((_, i) => i % 8 === 0).map((p, i) => (
                    <div key={i} className="flex-1 bg-white/80 rounded-full" style={{ height: `${Math.max(8, p * 80)}%` }} />
                  ))}
                </div>
              )}
              <span className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-[9px] font-mono text-white/90">
                {formatShort(asset.duration)}
              </span>
              {asset.scene && (
                <span className="absolute top-1 left-1 px-1 rounded bg-black/60 text-[9px] text-white/70">demo</span>
              )}
              <button
                onClick={() => add(asset)}
                className="absolute top-1 right-1 size-6 grid place-items-center rounded-md bg-violet-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Timelinega qo'shish"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="px-2 py-1.5 text-[10px] text-white/70 truncate">{asset.name}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-white/35 leading-relaxed">
        Klipni timelinega sudrang yoki ikki marta bosing. Fayllar faqat brauzeringizda qoladi.
      </p>
    </div>
  );
}

function TextTab() {
  const { project, commit, select, playhead } = useEditor();
  const add = (style: TextStyleId) => {
    const clip = makeTextClip(playhead.getFrame() / project.fps, {
      trackId: style === "caption" ? "T2" : "T1",
      style,
      text: TEXT_STYLES[style].sample,
      position: style === "caption" || style === "lower-third" ? "bottom" : "center",
    });
    commit({ ...project, clips: [...project.clips, clip] });
    select(clip.id);
  };
  return (
    <div>
      <SectionTitle hint="playheadga qo'shiladi">Matn uslublari</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(TEXT_STYLES) as TextStyleId[]).map((style) => (
          <button
            key={style}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.text, style)}
            onClick={() => add(style)}
            className="aspect-[4/3] rounded-lg bg-gradient-to-br from-[#1d1d24] to-[#121216] ring-1 ring-white/10 hover:ring-amber-400/60 flex flex-col items-center justify-center gap-1 p-2"
          >
            <span className={cn("text-sm text-center leading-tight", textPreviewClass[style])}>{TEXT_STYLES[style].sample}</span>
            <span className="text-[10px] text-white/40">{TEXT_STYLES[style].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const textPreviewClass: Record<TextStyleId, string> = {
  title: "font-extrabold text-white text-base font-display",
  caption: "font-extrabold uppercase text-yellow-300 [text-shadow:0_1px_0_#000]",
  "lower-third": "font-semibold text-white border-l-2 border-violet-400 pl-1.5",
  pop: "font-black text-yellow-300 -rotate-3 text-lg [-webkit-text-stroke:1px_#000]",
  typewriter: "font-mono text-white/90 text-xs",
  neon: "font-bold text-white [text-shadow:0_0_8px_#e879f9,0_0_16px_#e879f9]",
};

function FiltersTab() {
  const { project, selectedId, commit } = useEditor();
  const selected = project.clips.find((c) => c.id === selectedId);
  const target = selected?.type === "media" ? selected : null;
  const active = target ? target.filter : project.grade.filter;

  const apply = (filter: FilterId) => {
    if (target) commit(updateClip(project, target.id, { filter }));
    else commit({ ...project, grade: { ...project.grade, filter } });
  };
  const toggle = (key: keyof Omit<ProjectGrade, "filter">) =>
    commit({ ...project, grade: { ...project.grade, [key]: !project.grade[key] } });

  return (
    <div>
      <SectionTitle hint={target ? "tanlangan klipga" : "butun loyihaga"}>Rang presetlari (LUT)</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(FILTERS) as FilterId[]).map((id) => (
          <button
            key={id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.filter, id)}
            onClick={() => apply(id)}
            className="flex flex-col items-center gap-1"
          >
            <span
              className={cn("w-full aspect-square rounded-lg ring-2 transition", active === id ? "ring-violet-400" : "ring-transparent hover:ring-white/30")}
              style={{ background: FILTERS[id].swatch }}
            />
            <span className="text-[10px] text-white/60">{FILTERS[id].label}</span>
          </button>
        ))}
      </div>
      <SectionTitle>Kino effektlari</SectionTitle>
      <div className="space-y-1.5">
        {([
          ["letterbox", "Letterbox 2.39:1"],
          ["vignette", "Vinyetka"],
          ["grain", "Plyonka donasi"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer">
            <span className="text-xs text-white/80">{label}</span>
            <Switch checked={project.grade[key]} onChange={() => toggle(key)} />
          </label>
        ))}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn("w-8 h-[18px] rounded-full relative transition-colors", checked ? "bg-violet-500" : "bg-white/15")}
    >
      <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-white transition-all", checked ? "left-4" : "left-0.5")} />
    </button>
  );
}

function TransitionsTab() {
  const { project, selectedId, commit } = useEditor();
  const selected = project.clips.find((c) => c.id === selectedId);
  return (
    <div>
      <SectionTitle hint={selected ? "tanlangan klipga" : "klipni tanlang"}>O&apos;tishlar</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(TRANSITIONS) as TransitionId[]).map((id) => (
          <button
            key={id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND.transition, id)}
            disabled={!selected}
            onClick={() => selected && commit(updateClip(project, selected.id, { transitionIn: id }))}
            className={cn(
              "group h-16 rounded-lg ring-1 bg-[#16161b] flex flex-col items-center justify-center gap-1.5 disabled:cursor-grab",
              selected?.transitionIn === id ? "ring-violet-400" : "ring-white/10 hover:ring-white/30",
            )}
          >
            <TransitionIcon id={id} />
            <span className="text-[10px] text-white/60">{TRANSITIONS[id].label}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-white/35 leading-relaxed">O&apos;tishni to&apos;g&apos;ridan-to&apos;g&apos;ri timelinedagi klip ustiga sudrab tashlash ham mumkin.</p>
    </div>
  );
}

function TransitionIcon({ id }: { id: TransitionId }) {
  return (
    <div className="relative w-10 h-6 rounded overflow-hidden bg-sky-500/70">
      <div
        className={cn(
          "absolute inset-0 bg-fuchsia-500/90 transition-all duration-500",
          id === "fade" && "opacity-40 group-hover:opacity-100",
          id === "slide" && "translate-x-1/2 group-hover:translate-x-0",
          id === "zoom" && "scale-50 group-hover:scale-100",
          id === "blur" && "blur-[3px] group-hover:blur-0",
          id === "wipe" && "[clip-path:inset(0_50%_0_0)] group-hover:[clip-path:inset(0_0_0_0)]",
          id === "none" && "opacity-0",
        )}
      />
    </div>
  );
}
