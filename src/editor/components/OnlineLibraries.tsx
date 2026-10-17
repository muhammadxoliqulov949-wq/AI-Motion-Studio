"use client";

import { Loader2, Pause, Play, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ICON_TOPICS } from "../catalog/icons";
import { MOTION_PRESETS, POPULAR_EMOJI } from "../catalog/motion-presets";
import { emojiByName } from "../catalog/stickers";
import type { MediaAsset } from "../types";
import { formatShort } from "../utils";
import { useAudioPreview, useInsert } from "./assets/use-insert";
import { DND } from "./dnd";
import { CategoryBar, Empty, SearchBox, Segmented } from "./ui";

/**
 * Online libraries reached through our own /api routes (keys stay on the server):
 * GIPHY stickers & GIFs, Iconify icons and Freesound sound effects, plus the "popular" sticker pack.
 * Used by the desktop library panel and the phone bottom sheet alike.
 */

interface Page<T> {
  items: T[];
  total: number;
  next?: number | null;
}

/** Debounced search with "load more"; `build(query, cursor)` returns the API URL. */
function useRemoteSearch<T>(query: string, build: (q: string, cursor: number) => string, cursorOf: (page: Page<T>, loaded: number) => number | null) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const req = useRef(0);
  const buildRef = useRef(build);
  buildRef.current = build;

  const load = async (q: string, from: number, append: boolean) => {
    const id = ++req.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildRef.current(q, from));
      const data = await res.json().catch(() => ({}));
      if (id !== req.current) return;
      if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { code: data.code });
      const page = data as Page<T>;
      setItems((prev) => {
        const next = append ? [...prev, ...page.items] : page.items;
        setCursor(cursorOf(page, next.length));
        return next;
      });
    } catch (err) {
      if (id === req.current) setError({ text: (err as Error).message, code: (err as { code?: string }).code });
    } finally {
      if (id === req.current) setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(query, 0, false), 350);
    return () => clearTimeout(t);
    // Only the query triggers a new search; `load` reads the latest URL builder through a ref.
  }, [query]);

  return { items, loading, error, more: cursor !== null ? () => void load(query, cursor, true) : null };
}

function ErrorNote({ error, keyHint }: { error: { text: string; code?: string }; keyHint: string }) {
  return (
    <div className="flex gap-2 rounded-lg px-3 py-2 text-[11px] bg-amber-500/10 text-amber-200/90 ring-1 ring-amber-400/20 leading-relaxed">
      <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
      {error.code === "no_api_key" ? keyHint : error.text}
    </div>
  );
}

function MoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full mt-2 h-8 rounded-lg bg-white/[0.05] text-[11px] text-white/70 hover:bg-white/10">
      Yana yuklash
    </button>
  );
}

const Spinner = () => (
  <div className="py-4 grid place-items-center">
    <Loader2 className="size-4 animate-spin text-cyan-300" />
  </div>
);

// ---------------- Popular pack ----------------

export function PopularStickers() {
  const insert = useInsert();
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/40 mb-2">Chaqiruv animatsiyalari</div>
        <div className="grid grid-cols-2 gap-2">
          {MOTION_PRESETS.map((m) => (
            <button
              key={m.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DND.sticker, `motion:${m.id}`)}
              onClick={() => insert.sticker(`motion:${m.id}`, undefined, { duration: m.duration, animIn: undefined })}
              className="h-14 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.07] hover:ring-cyan-300/50 flex items-center gap-2.5 px-3 text-left"
            >
              <span className="text-[22px]">{m.icon}</span>
              <span className="text-[11.5px] text-white/85 leading-tight">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/40 mb-2">Mashhur animatsion emoji</div>
        <div className="grid grid-cols-6 gap-1">
          {POPULAR_EMOJI.map((name) => {
            const e = emojiByName(name);
            if (!e) return null;
            return (
              <button
                key={name}
                draggable
                onDragStart={(ev) => ev.dataTransfer.setData(DND.sticker, `emoji:${name}`)}
                onClick={() => insert.sticker(`emoji:${name}`)}
                title={name}
                className="aspect-square rounded-lg grid place-items-center text-[22px] hover:bg-white/[0.08] hover:scale-110 transition"
              >
                {e.char}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-white/35 leading-relaxed">Chaqiruv animatsiyalari studiyada chizilgan (litsenziya shart emas). Emoji: Noto Animated Emoji (Google, CC BY 4.0).</p>
    </div>
  );
}

// ---------------- GIPHY ----------------

interface GiphyItem {
  id: string;
  title: string;
  author: string;
  pageUrl: string;
  src: string;
  width: number;
  height: number;
  thumb: string;
}

const GIPHY_TOPICS: [string, string][] = [
  ["wow", "Wow"],
  ["love", "Sevgi"],
  ["laugh", "Kulgi"],
  ["fire", "Olov"],
  ["thank you", "Rahmat"],
  ["subscribe", "Obuna"],
  ["sale", "Chegirma"],
  ["happy birthday", "Tug'ilgan kun"],
  ["arrow", "Strelka"],
  ["sparkle", "Uchqun"],
];

export function GiphyBrowser() {
  const insert = useInsert();
  const [type, setType] = useState<"stickers" | "gifs">("stickers");
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const query = `${type}|${q.trim() || topic || ""}`;
  const { items, loading, error, more } = useRemoteSearch<GiphyItem>(
    query,
    (key, offset) => {
      const [t, text] = key.split("|");
      return `/api/giphy?${new URLSearchParams({ type: t, q: text, offset: String(offset) })}`;
    },
    (page, loaded) => (loaded < page.total && page.items.length ? loaded : null),
  );

  const add = (g: GiphyItem) =>
    insert.sticker(`gif:${g.id}`, undefined, {
      src: g.src,
      aspect: g.width / g.height,
      credit: `GIF: ${g.author} — GIPHY (${g.pageUrl})`,
      license: "GIPHY Terms of Service",
      animIn: undefined,
    });

  return (
    <div className="space-y-2.5">
      <Segmented
        value={type}
        onChange={setType}
        options={[
          ["stickers", "Stikerlar (shaffof)"],
          ["gifs", "GIF / mem"],
        ]}
      />
      <SearchBox value={q} onChange={setQ} placeholder="Inglizcha qidiring: wow, love, sale…" />
      <CategoryBar value={topic} onChange={setTopic} options={GIPHY_TOPICS} />
      {error && <ErrorNote error={error} keyHint="GIPHY uchun serverda GIPHY_API_KEY kerak (developers.giphy.com — bepul)." />}
      {!error && !loading && !items.length && <Empty>Hech narsa topilmadi</Empty>}
      <div className="grid grid-cols-3 gap-1.5">
        {items.map((g) => (
          <button
            key={g.id}
            onClick={() => add(g)}
            title={g.title}
            className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-white/[0.07] hover:ring-cyan-300/60 bg-[repeating-conic-gradient(#1c1c22_0%_25%,#141418_0%_50%)] [background-size:14px_14px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.thumb} alt={g.title} loading="lazy" className="absolute inset-0 w-full h-full object-contain" />
          </button>
        ))}
      </div>
      {loading && <Spinner />}
      {!loading && more && <MoreButton onClick={more} />}
      <p className="text-[10px] text-white/45 font-semibold tracking-wide">Powered by GIPHY</p>
    </div>
  );
}

// ---------------- Iconify ----------------

interface IconItem {
  icon: string;
  name: string;
  set: string;
  license: string;
  credit?: string;
}

export function IconBrowser() {
  const insert = useInsert();
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string | null>("arrow");
  const [adding, setAdding] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const query = q.trim() || topic || "arrow";
  const { items, loading, error, more } = useRemoteSearch<IconItem>(
    query,
    (text, start) => `/api/icons?${new URLSearchParams({ q: text, start: String(start) })}`,
    (page) => page.next ?? null,
  );

  const add = async (it: IconItem) => {
    setAdding(it.icon);
    setFailed(null);
    try {
      const res = await fetch(`/api/icons/svg?icon=${encodeURIComponent(it.icon)}`);
      if (!res.ok) throw new Error();
      const svg = await res.text();
      insert.sticker(`icon:${it.icon}`, undefined, { src: svg, color: "#ffffff", credit: it.credit, license: `${it.set} — ${it.license}` });
    } catch {
      setFailed(it.icon);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="space-y-2.5">
      <SearchBox value={q} onChange={setQ} placeholder="Inglizcha qidiring: home, star, phone…" />
      <CategoryBar value={topic} onChange={setTopic} options={ICON_TOPICS} />
      {error && <ErrorNote error={error} keyHint="" />}
      {failed && <ErrorNote error={{ text: "Belgini yuklab bo'lmadi, qayta urinib ko'ring." }} keyHint="" />}
      {!error && !loading && !items.length && <Empty>Hech narsa topilmadi</Empty>}
      <div className="grid grid-cols-6 gap-1">
        {items.map((it) => (
          <button
            key={it.icon}
            onClick={() => void add(it)}
            title={`${it.name} · ${it.set} · ${it.license}`}
            className="relative aspect-square rounded-lg grid place-items-center hover:bg-white/[0.08] ring-1 ring-transparent hover:ring-white/15"
          >
            {adding === it.icon ? (
              <Loader2 className="size-4 animate-spin text-cyan-300" />
            ) : (
              // Icons are drawn in currentColor (black in an <img>): invert so they show on the dark panel.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/icons/svg?icon=${encodeURIComponent(it.icon)}`} alt={it.name} loading="lazy" className="size-6 invert" />
            )}
          </button>
        ))}
      </div>
      {loading && <Spinner />}
      {!loading && more && <MoreButton onClick={more} />}
      <p className="text-[10px] text-white/35 leading-relaxed">Iconify — 200 000+ ochiq belgi. Faqat erkin litsenziyali to&apos;plamlar ko&apos;rsatiladi; rangini Xususiyatlar panelida o&apos;zgartiring.</p>
    </div>
  );
}

// ---------------- Freesound ----------------

interface SoundItem {
  id: string;
  title: string;
  author: string;
  duration: number;
  license: string;
  pageUrl: string;
  src: string;
  credit?: string;
}

const SOUND_TOPICS: [string, string][] = [
  ["whoosh", "Whoosh"],
  ["pop", "Pop"],
  ["glitch", "Glitch"],
  ["click", "Klik"],
  ["swoosh transition", "O'tish"],
  ["boom impact", "Zarba"],
  ["ding notification", "Bildirishnoma"],
  ["typing keyboard", "Klaviatura"],
  ["camera shutter", "Kamera"],
  ["applause", "Qarsak"],
  ["laugh", "Kulgi"],
  ["cash register", "Kassa"],
];

const soundToAsset = (s: SoundItem): MediaAsset => ({
  id: `lib_${s.id}`,
  name: s.title,
  kind: "audio",
  duration: s.duration,
  src: s.src,
  gradient: "linear-gradient(135deg,#0c4a6e,#38bdf8)",
  // Placeholder until the real waveform is decoded on insert.
  peaks: Array.from({ length: 120 }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 1.7 + s.duration))),
  origin: "sfx",
  libraryId: s.id,
  credit: s.credit,
  license: `${s.license} (Freesound)`,
});

export function OnlineSounds() {
  const insert = useInsert();
  const preview = useAudioPreview();
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string | null>("whoosh");
  const query = q.trim() || topic || "whoosh";
  const { items, loading, error, more } = useRemoteSearch<SoundItem>(
    query,
    (text, page) => `/api/sounds?${new URLSearchParams({ q: text, page: String(page || 1) })}`,
    (page) => page.next ?? null,
  );

  return (
    <div className="space-y-2.5">
      <SearchBox value={q} onChange={setQ} placeholder="Inglizcha qidiring: whoosh, pop, glitch, click…" />
      <CategoryBar value={topic} onChange={setTopic} options={SOUND_TOPICS} />
      {error && <ErrorNote error={error} keyHint="Onlayn tovushlar uchun serverda FREESOUND_API_KEY kerak (freesound.org/apiv2/apply — bepul)." />}
      {!error && !loading && !items.length && <Empty>Hech narsa topilmadi</Empty>}
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((s) => {
          const asset = soundToAsset(s);
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
              title={`${s.author} · ${s.license}`}
            >
              <div className="flex items-center gap-1.5 pr-6">
                <button onClick={() => preview.toggle(s.id, s.src)} className="size-6 shrink-0 rounded-full grid place-items-center bg-white/10 hover:bg-white/20 text-white" title="Tinglash">
                  {playing ? <Pause className="size-2.5 fill-current" /> : <Play className="size-2.5 fill-current ml-px" />}
                </button>
                <span className="text-[11px] text-white/85 truncate flex-1">{s.title}</span>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[9.5px] text-white/35">
                <span className="truncate">{s.license} · {s.author}</span>
                <span className="font-mono shrink-0 pl-1">{s.duration < 1 ? `${Math.round(s.duration * 10) / 10}s` : formatShort(s.duration)}</span>
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
      {loading && <Spinner />}
      {!loading && more && <MoreButton onClick={more} />}
      <p className="text-[10px] text-white/35 leading-relaxed">Freesound — faqat CC0 va CC BY tovushlar. CC BY mualliflari eksport oynasidagi mualliflik ro&apos;yxatiga avtomatik qo&apos;shiladi.</p>
    </div>
  );
}
