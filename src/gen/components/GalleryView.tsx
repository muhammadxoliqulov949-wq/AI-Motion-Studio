"use client";

import { Clapperboard, Download, ImageIcon, Save, Trash2, Video, X } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { downloadBlob, stageVideoForEditor } from "../export";
import type { GalleryItem } from "../useGallery";
import { Chips, GhostButton, Notice } from "./kit";

const ratio = (aspect: string) => {
  const [w, h] = aspect.split(":").map(Number);
  return w && h ? w / h : 1;
};

const ext = (item: GalleryItem) => (item.kind === "video" ? "mp4" : item.blob.type.includes("png") ? "png" : "jpg");

/** Everything made in the studio, kept in this browser. */
export function GalleryView({ items, ready, onRemove, onToVideo }: { items: GalleryItem[]; ready: boolean; onRemove: (id: string) => void; onToVideo: (item: GalleryItem) => void }) {
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = items.filter((i) => filter === "all" || i.kind === filter);

  const toEditor = async (item: GalleryItem) => {
    try {
      setError(null);
      await stageVideoForEditor(item.blob, item.prompt);
      window.location.href = "/editor";
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-[1400px] mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-[20px] font-bold text-white font-display">Galereya</h2>
          <p className="text-[12px] text-white/40">Yaratilgan hamma narsa shu brauzerda saqlanadi · {items.length} ta</p>
        </div>
        <Chips
          value={filter}
          options={[
            ["all", "Hammasi"],
            ["image", "Rasmlar"],
            ["video", "Videolar"],
          ]}
          onChange={setFilter}
        />
      </div>
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!ready ? (
        <p className="text-[13px] text-white/40">Yuklanmoqda…</p>
      ) : list.length === 0 ? (
        <div className="grid place-items-center py-24 text-center">
          <div className="size-14 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 grid place-items-center mb-3">
            <ImageIcon className="size-6 text-white/50" />
          </div>
          <p className="text-[14px] font-semibold text-white">Hozircha bo&apos;sh</p>
          <p className="text-[12px] text-white/40 mt-1">«Rasm» bo&apos;limida birinchi rasmingizni yarating.</p>
        </div>
      ) : (
        <div className="columns-2 md:columns-3 xl:columns-4 gap-3 [column-fill:_balance]">
          {list.map((item) => (
            <Card key={item.id} item={item} onOpen={() => setOpen(item)} />
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm grid place-items-center p-4" onClick={() => setOpen(null)}>
          <div className="relative max-w-[1000px] w-full max-h-[92dvh] overflow-y-auto rounded-2xl bg-[#111115] ring-1 ring-white/10 p-4 lg:p-5" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(null)} className="absolute top-3 right-3 z-10 size-9 grid place-items-center rounded-lg bg-black/50 text-white/80 hover:text-white">
              <X className="size-5" />
            </button>
            <div className="grid place-items-center rounded-xl bg-black/50 p-2">
              {open.kind === "video" ? (
                <video src={open.url} controls autoPlay loop playsInline className="max-h-[62dvh] rounded-lg" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={open.url} alt={open.prompt} className="max-h-[62dvh] rounded-lg object-contain" />
              )}
            </div>
            <p className="mt-3 text-[13px] text-white/85 leading-relaxed">{open.prompt || "—"}</p>
            <p className="mt-1 text-[11px] text-white/35">
              {open.kind === "video" ? "Video" : "Rasm"} · {open.model} · {open.aspect} · {new Date(open.createdAt).toLocaleString("uz-UZ")}
              {Object.entries(open.meta ?? {})
                .filter(([k, v]) => k !== "seed" && k !== "watermark" && k !== "engine" && typeof v !== "boolean")
                .map(([k, v]) => ` · ${k}: ${v}`)
                .join("")}
              {open.meta?.watermark === true ? " · belgi bor" : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <GhostButton onClick={() => downloadBlob(open.blob, `${open.kind}-${open.id}.${ext(open)}`)} active>
                <Download className="size-4" /> Yuklab olish
              </GhostButton>
              {open.kind === "image" ? (
                <GhostButton
                  onClick={() => {
                    setOpen(null);
                    onToVideo(open);
                  }}
                >
                  <Clapperboard className="size-4" /> Videoga aylantirish
                </GhostButton>
              ) : (
                <GhostButton onClick={() => void toEditor(open)}>
                  <Save className="size-4" /> Editorda ochish
                </GhostButton>
              )}
              <GhostButton
                onClick={() => {
                  onRemove(open.id);
                  setOpen(null);
                }}
              >
                <Trash2 className="size-4" /> O&apos;chirish
              </GhostButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => void video.current?.play().catch(() => {})}
      onMouseLeave={() => video.current?.pause()}
      className="group relative mb-3 block w-full break-inside-avoid rounded-xl overflow-hidden ring-1 ring-white/[0.08] hover:ring-white/30 bg-black text-left"
      style={{ aspectRatio: ratio(item.aspect) }}
    >
      {item.kind === "video" ? (
        <video ref={video} src={`${item.url}#t=0.4`} muted loop playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.prompt} loading="lazy" className="absolute inset-0 size-full object-cover" />
      )}
      <span className={cn("absolute top-2 left-2 px-1.5 h-5 rounded-md bg-black/65 text-[10px] text-white/90 inline-flex items-center gap-1")}>
        {item.kind === "video" ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
        {item.kind === "video" ? "Video" : "Rasm"}
      </span>
      <span className="absolute inset-x-0 bottom-0 p-2.5 pt-8 bg-gradient-to-t from-black/85 to-transparent text-[11px] text-white/85 line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity">{item.prompt}</span>
    </button>
  );
}
