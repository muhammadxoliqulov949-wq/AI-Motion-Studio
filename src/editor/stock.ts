/** Client helpers for the stock library (/api/stock — Pixabay, Pexels as fallback). */
import type { AspectRatio, MediaAsset } from "./types";

export interface StockItem {
  id: string;
  kind: "video" | "image";
  provider?: "pixabay" | "pexels";
  width: number;
  height: number;
  duration: number;
  thumb: string;
  src: string;
  preview?: string;
  author: string;
  authorUrl: string;
  pageUrl: string;
}

export class StockError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const orientationFor = (aspect: AspectRatio) =>
  aspect === "9:16" || aspect === "4:5"
    ? "portrait"
    : aspect === "1:1"
      ? "square"
      : "landscape";

export const searchStock = async (
  type: "videos" | "photos",
  q: string,
  aspect: AspectRatio,
  page = 1,
) => {
  const params = new URLSearchParams({
    type,
    q,
    orientation: orientationFor(aspect),
    page: String(page),
  });
  const res = await fetch(`/api/stock?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new StockError(data.error ?? `HTTP ${res.status}`, data.code);
  return data as { items: StockItem[]; total: number; page: number };
};

const PROVIDER = {
  pixabay: { name: "Pixabay", license: "Pixabay Content License" },
  pexels: { name: "Pexels", license: "Pexels License" },
};

export const stockToAsset = (item: StockItem): MediaAsset => {
  const p = PROVIDER[item.provider ?? "pixabay"];
  return {
    id: item.id,
    name: `${p.name} ${item.kind === "video" ? "video" : "rasm"} — ${item.author}`,
    kind: item.kind,
    duration: item.duration,
    src: item.src,
    thumbs: [item.thumb],
    gradient: "linear-gradient(135deg,#065f46,#0ea5e9)",
    width: item.width,
    height: item.height,
    origin: "stock",
    credit: `${item.kind === "video" ? "Video" : "Rasm"}: ${item.author} — ${p.name} (${item.pageUrl})`,
    license: p.license,
  };
};
