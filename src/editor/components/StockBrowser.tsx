"use client";

import { Loader2, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { searchStock, StockError, stockToAsset, type StockItem } from "../stock";
import { useEditor } from "../store";
import { formatShort } from "../utils";
import { useInsert } from "./assets/use-insert";
import { DND } from "./dnd";
import { CategoryBar, Empty, SearchBox } from "./ui";

const TOPICS: [string, string][] = [
  ["city night", "Shahar"],
  ["nature", "Tabiat"],
  ["mountains", "Tog'lar"],
  ["ocean", "Dengiz"],
  ["people", "Odamlar"],
  ["business", "Biznes"],
  ["technology", "Texnologiya"],
  ["food", "Taom"],
  ["travel", "Sayohat"],
  ["sport", "Sport"],
  ["abstract background", "Fon"],
  ["sky clouds", "Osmon"],
];

export function StockBrowser({ type }: { type: "videos" | "photos" }) {
  const { project } = useEditor();
  const insert = useInsert();
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [items, setItems] = useState<StockItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const query = q.trim() || topic || "";
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchStock(type, query, project.aspect, 1)
        .then((r) => {
          if (id !== reqId.current) return;
          setItems(r.items);
          setTotal(r.total);
          setPage(1);
        })
        .catch((err) => id === reqId.current && setError({ text: (err as Error).message, code: err instanceof StockError ? err.code : undefined }))
        .finally(() => id === reqId.current && setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [type, query, project.aspect]);

  const more = () => {
    setLoading(true);
    searchStock(type, query, project.aspect, page + 1)
      .then((r) => {
        setItems((prev) => [...prev, ...r.items]);
        setPage(r.page);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  return (
    <>
      <div className="shrink-0 px-3 pt-2.5 space-y-2">
        <SearchBox value={q} onChange={setQ} placeholder="Inglizcha qidiring: sunset, coffee, city…" />
        <CategoryBar value={topic} onChange={setTopic} options={TOPICS} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto panel-scroll px-3 pb-4 pt-2.5">
        {error ? (
          <div className="flex gap-2 rounded-lg px-3 py-2 text-[11px] bg-amber-500/10 text-amber-200/90 ring-1 ring-amber-400/20 leading-relaxed">
            <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
            {error.code === "no_api_key" ? "Stok kutubxona uchun serverda PIXABAY_API_KEY kerak (pixabay.com/api/docs — bepul)." : error.text}
          </div>
        ) : !loading && !items.length ? (
          <Empty>Hech narsa topilmadi</Empty>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <StockTile key={item.id} item={item} onAdd={() => insert.asset(stockToAsset(item))} />
          ))}
        </div>
        {loading && (
          <div className="py-4 grid place-items-center">
            <Loader2 className="size-4 animate-spin text-cyan-300" />
          </div>
        )}
        {!loading && items.length > 0 && items.length < total && (
          <button onClick={more} className="w-full mt-2 h-8 rounded-lg bg-white/[0.05] text-[11px] text-white/70 hover:bg-white/10">
            Yana yuklash
          </button>
        )}
        <p className="mt-3 text-[10px] text-white/35 leading-relaxed">Pixabay — tijoriy foydalanish bepul, atribut shart emas. Muallif nomi baribir eksportdagi mualliflik ro&apos;yxatiga qo&apos;shiladi.</p>
      </div>
    </>
  );
}

function StockTile({ item, onAdd }: { item: StockItem; onAdd: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DND.libAsset, JSON.stringify(stockToAsset(item)))}
      onDoubleClick={onAdd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-cyan-300/50 cursor-grab bg-[#15151a]"
    >
      <div className="relative aspect-video bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.thumb} alt="" loading="lazy" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
        {hover && item.kind === "video" && item.preview && (
          <video src={item.preview} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" />
        )}
        {item.kind === "video" && <span className="absolute bottom-1 right-1 px-1 rounded bg-black/70 text-[9px] font-mono text-white/90">{formatShort(item.duration)}</span>}
        <button
          onClick={onAdd}
          className="absolute top-1 right-1 size-6 grid place-items-center rounded-md bg-cyan-400 text-black opacity-0 group-hover:opacity-100 transition-opacity"
          title="Timelinega qo'shish"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="px-2 py-1 text-[9.5px] text-white/50 truncate">{item.author}</div>
    </div>
  );
}
