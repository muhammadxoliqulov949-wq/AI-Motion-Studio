"use client";

import {
  AudioLines,
  Check,
  Clapperboard,
  Globe,
  Loader2,
  Mic,
  Music2,
  Palette,
  Pause,
  Play,
  Plus,
  Shuffle,
  Smile,
  Sparkles,
  Type,
  Upload,
  type LucideIcon,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  GENRES,
  MOODS,
  SFX,
  SFX_CATEGORIES,
  genreGradient,
  musicToAsset,
  searchMusic,
  searchSfx,
  sfxToAsset,
} from "../catalog/audio-library";
import { EFFECT_GROUPS, EFFECTS, type EffectGroup } from "../catalog/effects";
import { FILTER_GROUPS, FILTER_PRESETS, type FilterGroup } from "../catalog/filters";
import { loadFontFamily, isFontReady } from "../catalog/font-loader";
import { FONTS, type FontCategory } from "../catalog/fonts";
import { EMOJI_CATEGORIES, EMOJI_STICKERS, SHAPE_STICKERS } from "../catalog/stickers";
import { TEXT_TEMPLATE_GROUPS, TEXT_TEMPLATES, type TextTemplateGroup } from "../catalog/text-templates";
import { TRANSITION_DEFS, TRANSITION_GROUPS, type TransitionGroup } from "../catalog/transitions";
import { importFile } from "../import-media";
import { saveMedia } from "../media-store";
import { clipsOnTrack, updateClip } from "../ops";
import { useEditor } from "../store";
import type { MediaAsset, TextClip } from "../types";
import { formatShort } from "../utils";
import { useAudioPreview, useInsert, useRealPeaks } from "./assets/use-insert";
import { AutoCaptions } from "./AutoCaptions";
import { GiphyBrowser, IconBrowser, OnlineSounds, PopularStickers } from "./OnlineLibraries";
import { StockBrowser } from "./StockBrowser";
import { VoicePanel } from "./VoicePanel";
import { DND } from "./dnd";
import { CategoryBar, Empty, PanelHeader, SearchBox, Segmented, Slider, Switch } from "./ui";

export type AssetTab = "media" | "audio" | "text" | "stickers" | "effects" | "transitions" | "filters";

export const ASSET_TABS: { id: AssetTab; label: string; icon: LucideIcon }[] = [
  { id: "media", label: "Media", icon: Clapperboard },
  { id: "audio", label: "Audio", icon: Music2 },
  { id: "text", label: "Matn", icon: Type },
  { id: "stickers", label: "Stiker", icon: Smile },
  { id: "effects", label: "Effekt", icon: Sparkles },
  { id: "transitions", label: "O'tish", icon: Shuffle },
  { id: "filters", label: "Filtr", icon: Palette },
];

export function AssetPanel({ tab, onTab, rail = true }: { tab: AssetTab; onTab: (t: AssetTab) => void; rail?: boolean }) {
  return (
    <div className="flex h-full min-h-0">
      {rail && (
        <nav className="w-[64px] shrink-0 flex flex-col items-center gap-0.5 py-2 border-r border-white/[0.06] bg-[#0c0c0f]">
          {ASSET_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={cn(
                "w-[54px] py-2 rounded-lg flex flex-col items-center gap-1 text-[10px] transition-colors",
                tab === id ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white hover:bg-white/[0.04]",
              )}
            >
              <Icon className={cn("size-[18px]", tab === id && "text-cyan-300")} />
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {tab === "media" && <MediaTab />}
        {tab === "audio" && <AudioTab />}
        {tab === "text" && <TextTab />}
        {tab === "stickers" && <StickersTab />}
        {tab === "effects" && <EffectsTab />}
        {tab === "transitions" && <TransitionsTab />}
        {tab === "filters" && <FiltersTab />}
      </div>
    </div>
  );
}

function Scroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex-1 min-h-0 overflow-y-auto panel-scroll px-3 pb-4", className)}>{children}</div>;
}

function Head({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 px-3 pt-3 pb-2.5 space-y-2.5 border-b border-white/[0.04]">{children}</div>;
}

// ---------------- Media ----------------

function MediaTab() {
  const [mode, setMode] = useState<"mine" | "videos" | "photos">("mine");
  return (
    <>
      <div className="shrink-0 px-3 pt-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            ["mine", "Mening media"],
            ["videos", "Stok video"],
            ["photos", "Stok rasm"],
          ]}
        />
      </div>
      {mode === "mine" ? <MyMedia /> : <StockBrowser key={mode} type={mode} />}
    </>
  );
}

function MyMedia() {
  const { assets, addAssets } = useEditor();
  const insert = useInsert();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(0);
  const [over, setOver] = useState(false);
  const [filter, setFilter] = useState<"all" | "video" | "image" | "audio">("all");

  const list = assets.filter((a) => a.origin !== "music" && a.origin !== "sfx" && (filter === "all" || a.kind === filter));

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    setLoading((n) => n + arr.length);
    for (const file of arr) {
      try {
        const asset = await importFile(file);
        if (asset) {
          const stored = { ...asset, origin: "upload" as const };
          addAssets([stored]);
          void saveMedia(stored, file);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading((n) => n - 1);
      }
    }
  };

  return (
    <>
      <Head>
        <PanelHeader title="Media" hint="sudrab timelinega tashlang" />
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
            "w-full rounded-xl border border-dashed p-3.5 flex items-center gap-3 text-left transition-colors",
            over ? "border-cyan-300 bg-cyan-400/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]",
          )}
        >
          <span className="size-9 rounded-lg bg-cyan-400/15 grid place-items-center shrink-0">
            {loading > 0 ? <Loader2 className="size-4 text-cyan-300 animate-spin" /> : <Upload className="size-4 text-cyan-300" />}
          </span>
          <span>
            <span className="block text-xs font-medium text-white/90">{loading > 0 ? `${loading} ta fayl tahlil qilinmoqda…` : "Fayl import qilish"}</span>
            <span className="block text-[10px] text-white/40">Video, rasm, audio · fayllar faqat brauzeringizda qoladi</span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept="video/*,image/*,audio/*"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            ["all", "Hammasi"],
            ["video", "Video"],
            ["image", "Rasm"],
            ["audio", "Audio"],
          ]}
        />
      </Head>
      <Scroll className="pt-3">
        {list.length === 0 && <Empty>Bu turda media yo&apos;q</Empty>}
        <div className="grid grid-cols-2 gap-2">
          {list.map((asset) => (
            <MediaTile key={asset.id} asset={asset} onAdd={() => insert.asset(asset)} />
          ))}
        </div>
      </Scroll>
    </>
  );
}

function MediaTile({ asset, onAdd }: { asset: MediaAsset; onAdd: () => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND.asset, asset.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDoubleClick={onAdd}
      className="group relative rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-cyan-300/50 cursor-grab bg-[#15151a]"
    >
      <div
        className="relative aspect-video"
        style={{ background: asset.thumbs?.length ? `center/cover url(${asset.thumbs[Math.floor(asset.thumbs.length / 2)]})` : asset.gradient }}
      >
        {asset.kind === "audio" && <AudioLines className="absolute inset-0 m-auto size-6 text-white/70" />}
        <span className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-[9px] font-mono text-white/90">{formatShort(asset.duration)}</span>
        {asset.scene && <span className="absolute top-1 left-1 px-1 rounded bg-black/60 text-[9px] text-white/70">demo</span>}
        <button
          onClick={onAdd}
          className="absolute top-1 right-1 size-6 grid place-items-center rounded-md bg-cyan-400 text-black opacity-0 group-hover:opacity-100 transition-opacity"
          title="Timelinega qo'shish"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="px-2 py-1.5 text-[10px] text-white/70 truncate">{asset.name}</div>
    </div>
  );
}

// ---------------- Audio ----------------

function AudioTab() {
  const [mode, setMode] = useState<"music" | "sfx" | "online" | "voice">("music");
  const preview = useAudioPreview();
  useEffect(() => () => preview.stop(), []);
  return (
    <>
      <Head>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            ["music", <><Music2 className="size-3" /> Musiqa</>],
            ["sfx", <><AudioLines className="size-3" /> Effektlar</>],
            ["online", <><Globe className="size-3" /> Onlayn</>],
            ["voice", <><Mic className="size-3" /> AI ovoz</>],
          ]}
        />
      </Head>
      {mode === "music" && <MusicList />}
      {mode === "sfx" && <SfxList />}
      {mode === "online" && (
        <Scroll className="pt-2.5">
          <OnlineSounds />
        </Scroll>
      )}
      {mode === "voice" && (
        <Scroll className="pt-3">
          <VoicePanel />
        </Scroll>
      )}
    </>
  );
}

function MusicList() {
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const list = useMemo(() => searchMusic(q, genre, mood), [q, genre, mood]);
  const insert = useInsert();
  const preview = useAudioPreview();
  useEffect(() => setLimit(60), [q, genre, mood]);

  return (
    <>
      <div className="shrink-0 px-3 pt-2.5 space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="Qidirish: epik, lo-fi, piano, happy…" />
        <CategoryBar value={genre} onChange={setGenre} options={Object.entries(GENRES)} />
        <CategoryBar value={mood} onChange={setMood} options={Object.entries(MOODS)} />
      </div>
      <Scroll className="pt-2">
        <div className="text-[10px] text-white/35 mb-1.5">{list.length} ta trek</div>
        {list.length === 0 && <Empty>Hech narsa topilmadi</Empty>}
        <div className="space-y-1">
          {list.slice(0, limit).map((t) => {
            const asset = musicToAsset(t);
            const playing = preview.playing === t.id;
            return (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DND.libAsset, JSON.stringify(asset))}
                className={cn("group flex items-center gap-2.5 rounded-lg p-1.5 pr-2 hover:bg-white/[0.05] cursor-grab", playing && "bg-white/[0.06]")}
              >
                <button
                  onClick={() => preview.toggle(t.id, asset.src!)}
                  className="size-9 shrink-0 rounded-md grid place-items-center text-white relative overflow-hidden"
                  style={{ background: genreGradient(t.genre) }}
                  title="Tinglash"
                >
                  {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current ml-0.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-white/90 truncate">{t.title}</div>
                  <div className="text-[10px] text-white/40 truncate">
                    {GENRES[t.genre] ?? t.genre}
                    {t.moods.length > 0 && ` · ${t.moods.slice(0, 2).map((m) => MOODS[m] ?? m).join(", ")}`}
                    {t.bpm ? ` · ${t.bpm} BPM` : ""}
                  </div>
                </div>
                <span className="text-[10px] font-mono text-white/40">{formatShort(t.duration)}</span>
                <button
                  onClick={() => insert.asset(asset)}
                  className="size-7 grid place-items-center rounded-md bg-white/[0.06] text-white/70 hover:bg-cyan-400 hover:text-black"
                  title="Timelinega qo'shish"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        {list.length > limit && (
          <button onClick={() => setLimit((l) => l + 80)} className="w-full mt-2 h-8 rounded-lg bg-white/[0.05] text-[11px] text-white/70 hover:bg-white/10">
            Yana ko&apos;rsatish ({list.length - limit})
          </button>
        )}
        <p className="mt-3 text-[10px] text-white/35 leading-relaxed">
          Musiqa: Kevin MacLeod (incompetech.com), CC BY 4.0 — tijoriy foydalanish mumkin. Eksport oynasida mualliflik matni avtomatik tayyorlanadi.
        </p>
      </Scroll>
    </>
  );
}

function SfxList() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const list = useMemo(() => searchSfx(q, cat), [q, cat]);
  const insert = useInsert();
  const preview = useAudioPreview();
  return (
    <>
      <div className="shrink-0 px-3 pt-2.5 space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="Qidirish: whoosh, pop, qarsak, yomg'ir…" />
        <CategoryBar value={cat} onChange={setCat} options={Object.entries(SFX_CATEGORIES).filter(([id]) => SFX.some((s) => s.category === id))} />
      </div>
      <Scroll className="pt-2">
        <div className="text-[10px] text-white/35 mb-1.5">{list.length} ta tovush</div>
        {list.length === 0 && <Empty>Hech narsa topilmadi</Empty>}
        <div className="grid grid-cols-2 gap-1.5">
          {list.map((s) => {
            const asset = sfxToAsset(s);
            const playing = preview.playing === s.id;
            return (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DND.libAsset, JSON.stringify(asset))}
                className={cn(
                  "group relative rounded-lg ring-1 p-2 cursor-grab transition-colors",
                  playing ? "ring-cyan-300/60 bg-cyan-400/10" : "ring-white/[0.07] bg-white/[0.025] hover:ring-white/20",
                )}
                title={`${s.source} · ${s.license}`}
              >
                <div className="flex items-center gap-1.5">
                  <button onClick={() => preview.toggle(s.id, s.file)} className="size-6 shrink-0 rounded-full grid place-items-center bg-white/10 hover:bg-white/20 text-white">
                    {playing ? <Pause className="size-2.5 fill-current" /> : <Play className="size-2.5 fill-current ml-px" />}
                  </button>
                  <span className="text-[11px] text-white/85 truncate flex-1">{s.title}</span>
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[9.5px] text-white/35">
                  <span className="truncate">{SFX_CATEGORIES[s.category] ?? s.category}</span>
                  <span className="font-mono">{s.duration < 1 ? `${Math.round(s.duration * 10) / 10}s` : formatShort(s.duration)}</span>
                </div>
                <button
                  onClick={() => insert.asset(asset)}
                  className="absolute top-1.5 right-1.5 size-6 grid place-items-center rounded-md bg-cyan-400 text-black opacity-0 group-hover:opacity-100"
                  title="Timelinega qo'shish"
                >
                  <Plus className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-white/35 leading-relaxed">
          Manbalar: Kenney.nl (CC0), Wikimedia Commons (public domain / CC0 / CC BY) va studiyada sintez qilingan tovushlar (CC0).
        </p>
      </Scroll>
    </>
  );
}

// ---------------- Text + fonts ----------------

const FONT_CATEGORIES: Record<FontCategory, string> = {
  sans: "Sans",
  display: "Display",
  serif: "Serif",
  handwriting: "Qo'lyozma",
  mono: "Mono",
};

function TextTab() {
  const [mode, setMode] = useState<"templates" | "fonts" | "captions">("templates");
  return (
    <>
      <Head>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            ["templates", `Shablon · ${Object.keys(TEXT_TEMPLATES).length}`],
            ["fonts", `Shrift · ${FONTS.length}`],
            ["captions", "Avto subtitr"],
          ]}
        />
      </Head>
      {mode === "templates" && <TemplateGrid />}
      {mode === "fonts" && <FontList />}
      {mode === "captions" && (
        <Scroll className="pt-3">
          <AutoCaptions />
        </Scroll>
      )}
    </>
  );
}

function TemplateGrid() {
  const [group, setGroup] = useState<string | null>(null);
  const insert = useInsert();
  const list = Object.entries(TEXT_TEMPLATES).filter(([, t]) => !group || t.group === group);
  useEffect(() => {
    for (const [, t] of list) if (t.patch.font) void loadFontFamily(t.patch.font);
  }, [group]);
  return (
    <>
      <div className="shrink-0 px-3 pt-2.5 space-y-2">
        <button
          onClick={() => insert.text("plain")}
          className="w-full h-9 rounded-lg bg-white text-black text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-white/90"
        >
          <Plus className="size-3.5" /> Matn qo&apos;shish
        </button>
        <CategoryBar value={group} onChange={setGroup} options={Object.entries(TEXT_TEMPLATE_GROUPS) as [TextTemplateGroup, string][]} />
      </div>
      <Scroll className="pt-2.5">
        <div className="grid grid-cols-2 gap-2">
          {list.map(([id, t]) => (
            <button
              key={id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DND.text, id)}
              onClick={() => insert.text(id)}
              className="aspect-[4/3] rounded-lg bg-[radial-gradient(circle_at_30%_20%,#26262f,#121216)] ring-1 ring-white/[0.08] hover:ring-cyan-300/60 flex flex-col items-center justify-center gap-1.5 p-2 overflow-hidden"
            >
              <span
                className="text-center leading-tight max-w-full truncate px-1"
                style={{
                  fontFamily: t.patch.font ? `"${t.patch.font}", sans-serif` : "var(--font-display), sans-serif",
                  fontWeight: t.patch.fontWeight ?? 800,
                  fontStyle: t.patch.italic ? "italic" : undefined,
                  textTransform: t.patch.uppercase ? "uppercase" : undefined,
                  fontSize: 15,
                  color: t.patch.color === "transparent" ? "transparent" : (t.patch.color ?? (id === "pop" ? "#facc15" : "#fff")),
                  WebkitTextStroke: t.patch.strokeWidth ? `1px ${t.patch.strokeColor}` : id === "pop" ? "1px #000" : undefined,
                  background: t.patch.bgColor ? t.patch.bgColor : undefined,
                  padding: t.patch.bgColor ? "1px 6px" : undefined,
                  borderRadius: 4,
                  textShadow: id === "neon" ? "0 0 8px #e879f9, 0 0 16px #e879f9" : undefined,
                }}
              >
                {t.sample}
              </span>
              <span className="text-[10px] text-white/40">{t.label}</span>
            </button>
          ))}
        </div>
      </Scroll>
    </>
  );
}

function FontList() {
  const { project, selectedId, commit } = useEditor();
  const insert = useInsert();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [cyr, setCyr] = useState(false);
  const selected = project.clips.find((c) => c.id === selectedId);
  const target = selected?.type === "text" ? (selected as TextClip) : null;
  const list = FONTS.filter((f) => (!cat || f.category === cat) && (!cyr || f.cyrillic) && (!q || f.family.toLowerCase().includes(q.toLowerCase())));
  const apply = (family: string) => {
    void loadFontFamily(family);
    if (target) commit(updateClip(project, target.id, { font: family }));
    else insert.text("plain", undefined, family, { font: family });
  };
  return (
    <>
      <div className="shrink-0 px-3 pt-2.5 space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="Shrift nomi…" />
        <CategoryBar value={cat} onChange={setCat} options={Object.entries(FONT_CATEGORIES)} />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/40">{target ? `"${target.text.slice(0, 18)}" matniga qo'llanadi` : "Bosilsa yangi matn qo'shiladi"}</span>
          <Switch checked={cyr} onChange={() => setCyr(!cyr)} label="Kirill" />
        </div>
      </div>
      <Scroll className="pt-1.5">
        <div className="space-y-1">
          {list.map((f) => (
            <FontRow key={f.family} family={f.family} category={FONT_CATEGORIES[f.category]} cyrillic={f.cyrillic} active={target?.font === f.family} onClick={() => apply(f.family)} />
          ))}
        </div>
        <p className="mt-3 text-[10px] text-white/35">Google Fonts (SIL Open Font License) — tijoriy foydalanish bepul.</p>
      </Scroll>
    </>
  );
}

function FontRow({ family, category, cyrillic, active, onClick }: { family: string; category: string; cyrillic: boolean; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(isFontReady(family));
  useEffect(() => {
    if (ready) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void loadFontFamily(family).then(() => setReady(true));
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [family, ready]);
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn("w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors", active ? "bg-cyan-400/10 ring-1 ring-cyan-300/50" : "hover:bg-white/[0.05]")}
    >
      <span className="flex-1 min-w-0 truncate text-[17px] text-white" style={{ fontFamily: ready ? `"${family}"` : undefined, opacity: ready ? 1 : 0.4 }}>
        {family}
      </span>
      <span className="text-[9.5px] text-white/35 shrink-0">{category}{cyrillic ? " · Кир" : ""}</span>
      {active && <Check className="size-3.5 text-cyan-300" />}
    </button>
  );
}

// ---------------- Stickers ----------------

const STICKER_MODES: [StickerMode, string][] = [
  ["popular", "Mashhur"],
  ["emoji", "Emoji"],
  ["giphy", "GIPHY"],
  ["icons", "Belgilar"],
  ["shapes", "Shakllar"],
];
type StickerMode = "popular" | "emoji" | "giphy" | "icons" | "shapes";

function StickersTab() {
  const [mode, setMode] = useState<StickerMode>("popular");
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const insert = useInsert();
  const emojis = EMOJI_STICKERS.filter((e) => (!cat || e.category === cat) && (!q || e.name.includes(q.toLowerCase())));
  return (
    <>
      <Head>
        <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
          {STICKER_MODES.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={cn("shrink-0 h-7 px-3 rounded-lg text-[11.5px] font-medium transition-colors", mode === id ? "bg-white/[0.14] text-white" : "text-white/50 hover:text-white bg-white/[0.03]")}
            >
              {label}
              {id === "emoji" && <span className="ml-1 text-white/35">{EMOJI_STICKERS.length}</span>}
            </button>
          ))}
        </div>
        {mode === "emoji" && (
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Inglizcha nom: fire, heart, laugh…" />
            <CategoryBar value={cat} onChange={setCat} options={EMOJI_CATEGORIES.map((c) => [c, c])} />
          </>
        )}
      </Head>
      <Scroll className="pt-2.5">
        {mode === "popular" ? (
          <PopularStickers />
        ) : mode === "giphy" ? (
          <GiphyBrowser />
        ) : mode === "icons" ? (
          <IconBrowser />
        ) : mode === "emoji" ? (
          <>
            <div className="grid grid-cols-6 gap-1">
              {emojis.map((e) => (
                <button
                  key={e.name}
                  draggable
                  onDragStart={(ev) => ev.dataTransfer.setData(DND.sticker, `emoji:${e.name}`)}
                  onClick={() => insert.sticker(`emoji:${e.name}`)}
                  title={e.name}
                  className="aspect-square rounded-lg grid place-items-center text-[22px] hover:bg-white/[0.08] hover:scale-110 transition"
                >
                  {e.char}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-white/35">Noto Animated Emoji (Google, CC BY 4.0) — videoda animatsiya bilan chiqadi.</p>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {SHAPE_STICKERS.map((s) => (
              <button
                key={s.id}
                draggable
                onDragStart={(ev) => ev.dataTransfer.setData(DND.sticker, `shape:${s.id}`)}
                onClick={() => insert.sticker(`shape:${s.id}`)}
                className="aspect-square rounded-lg bg-white/[0.03] ring-1 ring-white/[0.07] hover:ring-cyan-300/50 flex flex-col items-center justify-center gap-1 p-2"
              >
                <svg viewBox="0 0 100 100" className="size-10" style={{ color: s.defaultColor }} dangerouslySetInnerHTML={{ __html: s.svg }} />
                <span className="text-[9.5px] text-white/45 truncate max-w-full">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </Scroll>
    </>
  );
}

// ---------------- Effects ----------------

function EffectsTab() {
  const [group, setGroup] = useState<string | null>(null);
  const insert = useInsert();
  const list = Object.entries(EFFECTS).filter(([, e]) => !group || e.group === group);
  return (
    <>
      <Head>
        <PanelHeader title="Video effektlar" hint="playheadga qo'shiladi" />
        <CategoryBar value={group} onChange={setGroup} options={Object.entries(EFFECT_GROUPS) as [EffectGroup, string][]} />
      </Head>
      <Scroll className="pt-2.5">
        <div className="grid grid-cols-3 gap-2">
          {list.map(([id, e]) => (
            <button
              key={id}
              draggable
              onDragStart={(ev) => ev.dataTransfer.setData(DND.effect, id)}
              onClick={() => insert.effect(id)}
              className="group rounded-lg bg-gradient-to-br from-[#1f1f28] to-[#121216] ring-1 ring-white/[0.07] hover:ring-fuchsia-300/50 flex flex-col items-center justify-center gap-1.5 py-3 px-1"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform">{e.icon}</span>
              <span className="text-[10px] text-white/60 text-center leading-tight">{e.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-white/35 leading-relaxed">Effekt alohida trekka tushadi va ostidagi barcha videoga ta&apos;sir qiladi. Uzunligini timelineda o&apos;zgartiring.</p>
      </Scroll>
    </>
  );
}

// ---------------- Transitions ----------------

function TransitionsTab() {
  const { project, selectedId, commit } = useEditor();
  const [group, setGroup] = useState<string | null>(null);
  const [duration, setDuration] = useState(0.5);
  const selected = project.clips.find((c) => c.id === selectedId);
  const list = Object.entries(TRANSITION_DEFS).filter(([id, t]) => id !== "slide" && id !== "zoom" && id !== "wipe" ? !group || t.group === group : false);
  const applyAll = (id: string) => {
    const ids = new Set(clipsOnTrack(project, "V1").slice(1).map((c) => c.id));
    commit({ ...project, clips: project.clips.map((c) => (ids.has(c.id) ? { ...c, transitionIn: id, transitionDuration: duration } : c)) });
  };
  return (
    <>
      <Head>
        <PanelHeader title="O'tishlar" hint={selected ? "tanlangan klipga" : "klipni tanlang yoki sudrang"} />
        <CategoryBar value={group} onChange={setGroup} options={Object.entries(TRANSITION_GROUPS) as [TransitionGroup, string][]} />
        <Slider label="Davomiylik" value={duration} min={0.1} max={2} step={0.05} unit="s" onDown={() => {}} onChange={setDuration} />
      </Head>
      <Scroll className="pt-2.5">
        <div className="grid grid-cols-3 gap-2">
          {list.map(([id, t]) => (
            <div key={id} className="relative group">
              <button
                draggable
                onDragStart={(e) => e.dataTransfer.setData(DND.transition, `${id}|${duration}`)}
                onClick={() => selected && commit(updateClip(project, selected.id, { transitionIn: id, transitionDuration: duration }))}
                className={cn(
                  "w-full rounded-lg ring-1 bg-[#15151a] flex flex-col items-center justify-center gap-1.5 py-2.5 px-1",
                  selected?.transitionIn === id ? "ring-cyan-300" : "ring-white/[0.07] hover:ring-white/25",
                )}
              >
                <TransitionPreview id={id} />
                <span className="text-[10px] text-white/60 text-center leading-tight">{t.label}</span>
              </button>
              {id !== "none" && (
                <button
                  onClick={() => applyAll(id)}
                  className="absolute top-1 right-1 px-1 rounded text-[8.5px] bg-black/70 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-cyan-400 hover:text-black"
                  title="Asosiy videodagi barcha kesishlarga"
                >
                  Hammasi
                </button>
              )}
            </div>
          ))}
        </div>
      </Scroll>
    </>
  );
}

function TransitionPreview({ id }: { id: string }) {
  const [p, setP] = useState(0.35);
  const def = TRANSITION_DEFS[id];
  const raf = useRef<number | null>(null);
  const start = () => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const v = ((now - t0) / 900) % 1.3;
      setP(Math.min(1, v));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    setP(0.35);
  };
  useEffect(() => () => stop(), []);
  const enter = def?.enter(p) ?? {};
  const exit = def?.exit?.(p) ?? {};
  return (
    <div className="relative w-14 h-9 rounded overflow-hidden bg-black" onMouseEnter={start} onMouseLeave={stop}>
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-indigo-600" style={exit} />
      {id !== "none" && <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500 to-orange-400" style={enter} />}
      {def?.flash && <div className="absolute inset-0" style={{ background: def.flash, opacity: 1 - Math.abs(p - 0.5) * 2 }} />}
    </div>
  );
}

// ---------------- Filters ----------------

function FiltersTab() {
  const { project, selectedId, commit, preview, checkpoint } = useEditor();
  const [group, setGroup] = useState<string | null>(null);
  const selected = project.clips.find((c) => c.id === selectedId);
  const target = selected?.type === "media" ? selected : null;
  const active = target ? target.filter : project.grade.filter;
  const intensity = target?.filterIntensity ?? 1;
  const list = Object.entries(FILTER_PRESETS).filter(([, f]) => !group || f.group === group);
  const apply = (filter: string) => {
    if (target) commit(updateClip(project, target.id, { filter }));
    else commit({ ...project, grade: { ...project.grade, filter } });
  };
  return (
    <>
      <Head>
        <PanelHeader title="Filtrlar" hint={target ? "tanlangan klipga" : "butun loyihaga"} />
        <CategoryBar value={group} onChange={setGroup} options={Object.entries(FILTER_GROUPS) as [FilterGroup, string][]} />
        {target && active !== "none" && (
          <Slider label="Kuchi" value={intensity} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => preview(updateClip(project, target.id, { filterIntensity: v }))} />
        )}
      </Head>
      <Scroll className="pt-2.5">
        <div className="grid grid-cols-3 gap-2">
          {list.map(([id, f]) => (
            <button key={id} draggable onDragStart={(e) => e.dataTransfer.setData(DND.filter, id)} onClick={() => apply(id)} className="flex flex-col items-center gap-1">
              <span className={cn("w-full aspect-square rounded-lg ring-2 transition", active === id ? "ring-cyan-300" : "ring-transparent hover:ring-white/30")} style={{ background: f.swatch }} />
              <span className="text-[10px] text-white/60">{f.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Kino effektlari (loyiha)</div>
          {([
            ["letterbox", "Letterbox 2.39:1"],
            ["vignette", "Vinyetka"],
            ["grain", "Plyonka donasi"],
          ] as const).map(([key, label]) => (
            <Switch key={key} label={label} checked={project.grade[key]} onChange={() => commit({ ...project, grade: { ...project.grade, [key]: !project.grade[key] } })} />
          ))}
        </div>
      </Scroll>
    </>
  );
}

export { useRealPeaks };
