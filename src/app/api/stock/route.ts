import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Pexels stock search (free for commercial use, attribution appreciated).
 * GET /api/stock?type=videos|photos&q=...&orientation=landscape|portrait|square&page=1
 */

const RATE_LIMIT = { name: "stock", limit: 60, windowMs: 10 * 60 * 1000 };

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

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  image: string;
  url: string;
  user: { name: string; url: string };
  video_files: { quality: string | null; width: number | null; height: number | null; link: string; file_type: string }[];
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: { large2x: string; large: string; medium: string };
}

export async function GET(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    return Response.json({ error: 'Serverda "PEXELS_API_KEY" sozlanmagan.', code: "no_api_key" }, { status: 503 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "photos" ? "photos" : "videos";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(20, Number(url.searchParams.get("page")) || 1));
  const orientation = ["landscape", "portrait", "square"].includes(url.searchParams.get("orientation") ?? "") ? url.searchParams.get("orientation")! : "";

  const params = new URLSearchParams({ per_page: "24", page: String(page) });
  if (q) params.set("query", q);
  if (q && orientation) params.set("orientation", orientation);
  const endpoint =
    type === "videos"
      ? `https://api.pexels.com/videos/${q ? "search" : "popular"}?${params}`
      : `https://api.pexels.com/v1/${q ? "search" : "curated"}?${params}`;

  let data: { videos?: PexelsVideo[]; photos?: PexelsPhoto[]; total_results?: number };
  try {
    const res = await fetch(endpoint, { headers: { Authorization: key } });
    if (!res.ok) return Response.json({ error: `Pexels xatosi (${res.status})`, code: "upstream" }, { status: 502 });
    data = await res.json();
  } catch {
    return Response.json({ error: "Pexels bilan bog'lanib bo'lmadi", code: "upstream" }, { status: 502 });
  }

  const items: StockItem[] =
    type === "videos"
      ? (data.videos ?? []).flatMap((v) => {
          const files = v.video_files
            .filter((f) => f.file_type === "video/mp4" && f.height && f.width)
            .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
          const best = files.find((f) => Math.min(f.width!, f.height!) <= 1080) ?? files[files.length - 1];
          const small = [...files].reverse().find((f) => Math.min(f.width!, f.height!) >= 360) ?? best;
          if (!best) return [];
          return [
            {
              id: `pexels_v_${v.id}`,
              kind: "video" as const,
              width: best.width ?? v.width,
              height: best.height ?? v.height,
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
          width: p.width,
          height: p.height,
          duration: 4,
          thumb: p.src.medium,
          src: p.src.large2x,
          author: p.photographer,
          authorUrl: p.photographer_url,
          pageUrl: p.url,
        }));

  return Response.json(
    { items, total: data.total_results ?? items.length, page },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
