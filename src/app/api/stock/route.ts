import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Stock video / photo search. Uses Pixabay (PIXABAY_API_KEY) and falls back to Pexels
 * (PEXELS_API_KEY). Both licenses allow free commercial use without attribution.
 * GET /api/stock?type=videos|photos&q=...&orientation=landscape|portrait|square&page=1
 */

const RATE_LIMIT = { name: "stock", limit: 60, windowMs: 10 * 60 * 1000 };
const PER_PAGE = 24;

export interface StockItem {
  id: string;
  kind: "video" | "image";
  provider: "pixabay" | "pexels";
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

type Orientation = "landscape" | "portrait" | "square" | "";

// ---------- Pixabay ----------

interface PixabayVideoFile {
  url: string;
  width: number;
  height: number;
  size: number;
  thumbnail?: string;
}

interface PixabayVideo {
  id: number;
  pageURL: string;
  duration: number;
  picture_id?: string;
  user: string;
  user_id: number;
  videos: Partial<Record<"large" | "medium" | "small" | "tiny", PixabayVideoFile>>;
}

interface PixabayImage {
  id: number;
  pageURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  user_id: number;
}

const pixabayUser = (name: string, id: number) => `https://pixabay.com/users/${encodeURIComponent(name)}-${id}/`;

const matchesOrientation = (w: number, h: number, o: Orientation) =>
  !o || (o === "portrait" ? h > w * 1.05 : o === "square" ? Math.abs(w - h) / Math.max(w, h) < 0.15 : w > h * 1.05);

const searchPixabay = async (key: string, type: "videos" | "photos", q: string, page: number, orientation: Orientation) => {
  const params = new URLSearchParams({ key, per_page: String(PER_PAGE), page: String(page), safesearch: "true", order: "popular" });
  if (q) params.set("q", q);
  if (type === "photos") {
    params.set("image_type", "photo");
    if (orientation === "portrait") params.set("orientation", "vertical");
    if (orientation === "landscape") params.set("orientation", "horizontal");
  }
  const res = await fetch(`https://pixabay.com/api/${type === "videos" ? "videos/" : ""}?${params}`);
  if (!res.ok) throw new Error(`Pixabay xatosi (${res.status}): ${(await res.text()).slice(0, 120)}`);
  const data = (await res.json()) as { totalHits: number; hits: (PixabayVideo | PixabayImage)[] };

  const items: StockItem[] =
    type === "videos"
      ? (data.hits as PixabayVideo[]).flatMap((v) => {
          // Prefer ≤1080p for smooth editing; "large" can be 4K.
          const files = (["large", "medium", "small", "tiny"] as const).map((k) => v.videos[k]).filter((f): f is PixabayVideoFile => !!f?.url);
          const best = files.find((f) => Math.min(f.width, f.height) <= 1080) ?? files[0];
          const small = [...files].reverse().find((f) => Math.min(f.width, f.height) >= 360) ?? best;
          if (!best) return [];
          const thumb = files.find((f) => f.thumbnail)?.thumbnail ?? (v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg` : "");
          return [
            {
              id: `pixabay_v_${v.id}`,
              kind: "video" as const,
              provider: "pixabay" as const,
              width: best.width,
              height: best.height,
              duration: v.duration,
              thumb,
              src: best.url,
              preview: small?.url,
              author: v.user,
              authorUrl: pixabayUser(v.user, v.user_id),
              pageUrl: v.pageURL,
            },
          ];
        })
      : (data.hits as PixabayImage[]).map((p) => ({
          id: `pixabay_p_${p.id}`,
          kind: "image" as const,
          provider: "pixabay" as const,
          width: p.imageWidth,
          height: p.imageHeight,
          duration: 4,
          thumb: p.webformatURL,
          src: p.largeImageURL,
          author: p.user,
          authorUrl: pixabayUser(p.user, p.user_id),
          pageUrl: p.pageURL,
        }));

  // Pixabay has no orientation filter for videos: show matching shapes first.
  const sorted = orientation ? [...items].sort((a, b) => Number(matchesOrientation(b.width, b.height, orientation)) - Number(matchesOrientation(a.width, a.height, orientation))) : items;
  return { items: sorted, total: data.totalHits };
};

// ---------- Pexels (fallback) ----------

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  image: string;
  url: string;
  user: { name: string; url: string };
  video_files: { width: number | null; height: number | null; link: string; file_type: string }[];
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: { large2x: string; medium: string };
}

const searchPexels = async (key: string, type: "videos" | "photos", q: string, page: number, orientation: Orientation) => {
  const params = new URLSearchParams({ per_page: String(PER_PAGE), page: String(page) });
  if (q) params.set("query", q);
  if (q && orientation) params.set("orientation", orientation);
  const endpoint =
    type === "videos" ? `https://api.pexels.com/videos/${q ? "search" : "popular"}?${params}` : `https://api.pexels.com/v1/${q ? "search" : "curated"}?${params}`;
  const res = await fetch(endpoint, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels xatosi (${res.status})`);
  const data = (await res.json()) as { videos?: PexelsVideo[]; photos?: PexelsPhoto[]; total_results?: number };
  const items: StockItem[] =
    type === "videos"
      ? (data.videos ?? []).flatMap((v) => {
          const files = v.video_files.filter((f) => f.file_type === "video/mp4" && f.height && f.width).sort((a, b) => b.height! - a.height!);
          const best = files.find((f) => Math.min(f.width!, f.height!) <= 1080) ?? files[files.length - 1];
          const small = [...files].reverse().find((f) => Math.min(f.width!, f.height!) >= 360) ?? best;
          if (!best) return [];
          return [
            {
              id: `pexels_v_${v.id}`,
              kind: "video" as const,
              provider: "pexels" as const,
              width: best.width!,
              height: best.height!,
              duration: v.duration,
              thumb: v.image,
              src: best.link,
              preview: small?.link,
              author: v.user.name,
              authorUrl: v.user.url,
              pageUrl: v.url,
            },
          ];
        })
      : (data.photos ?? []).map((p) => ({
          id: `pexels_p_${p.id}`,
          kind: "image" as const,
          provider: "pexels" as const,
          width: p.width,
          height: p.height,
          duration: 4,
          thumb: p.src.medium,
          src: p.src.large2x,
          author: p.photographer,
          authorUrl: p.photographer_url,
          pageUrl: p.url,
        }));
  return { items, total: data.total_results ?? items.length };
};

export async function GET(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  const pixabayKey = process.env.PIXABAY_API_KEY ?? process.env.PIXABAY_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!pixabayKey && !pexelsKey) {
    return Response.json({ error: 'Serverda "PIXABAY_API_KEY" sozlanmagan.', code: "no_api_key" }, { status: 503 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "photos" ? "photos" : "videos";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(20, Number(url.searchParams.get("page")) || 1));
  const o = url.searchParams.get("orientation") ?? "";
  const orientation: Orientation = o === "landscape" || o === "portrait" || o === "square" ? o : "";

  try {
    const result = pixabayKey ? await searchPixabay(pixabayKey, type, q, page, orientation) : await searchPexels(pexelsKey!, type, q, page, orientation);
    return Response.json(
      { ...result, page, provider: pixabayKey ? "pixabay" : "pexels" },
      // Pixabay asks API users to cache results for 24 hours.
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Stok xizmati javob bermadi", code: "upstream" }, { status: 502 });
  }
}
