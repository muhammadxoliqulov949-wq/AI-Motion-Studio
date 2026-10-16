/** Client helpers for the Pexels stock library (/api/stock). */
import type { AspectRatio, MediaAsset } from "./types";

export interface StockItem {
  id: string;
  kind: "video" | "image";
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
  aspect === "9:16" || aspect === "4:5" ? "portrait" : aspect === "1:1" ? "square" : "landscape";

export const searchStock = async (type: "videos" | "photos", q: string, aspect: AspectRatio, page = 1) => {
  const params = new URLSearchParams({ type, q, orientation: orientationFor(aspect), page: String(page) });
  const res = await fetch(`/api/stock?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StockError(data.error ?? `HTTP ${res.status}`, data.code);
  return data as { items: StockItem[]; total: number; page: number };
};

export const stockToAsset = (item: StockItem): MediaAsset => ({
  id: item.id,
  name: `${item.kind === "video" ? "Pexels video" : "Pexels rasm"} — ${item.author}`,
  kind: item.kind,
  duration: item.duration,
  src: item.src,
  thumbs: [item.thumb],
  gradient: "linear-gradient(135deg,#065f46,#0ea5e9)",
  width: item.width,
  height: item.height,
  origin: "stock",
  credit: `${item.kind === "video" ? "Video" : "Rasm"}: ${item.author} — Pexels (${item.pageUrl})`,
  license: "Pexels License",
});
