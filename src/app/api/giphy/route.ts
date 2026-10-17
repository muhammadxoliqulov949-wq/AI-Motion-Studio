import { cached, cdnCache, fetchJson, noKey, upstreamFailed } from "@/lib/api-cache";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * GIPHY search proxy: transparent stickers or GIFs. GIPHY_API_KEY stays on the server.
 * GIPHY's terms require its own media URLs (no re-hosting) and "Powered by GIPHY" attribution in the UI.
 */

interface Rendition {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
  size?: string;
}

interface GiphyItem {
  id: string;
  title: string;
  username?: string;
  url: string;
  images: Record<string, Rendition | undefined>;
}

const LIMIT = 24;
/** Larger originals slow down preview and export; GIPHY's "downsized" rendition stays under ~2 MB. */
const MAX_ORIGINAL_BYTES = 4_000_000;

export async function GET(req: Request) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return noKey("GIPHY_API_KEY", "developers.giphy.com — bepul kalit oling.");

  const rl = await rateLimit(req, { name: "giphy", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return rateLimitedResponse(rl);

  const params = new URL(req.url).searchParams;
  const type = params.get("type") === "gifs" ? "gifs" : "stickers";
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const offset = Math.max(0, Math.min(4900, Number(params.get("offset")) || 0));

  const endpoint = q ? "search" : "trending";
  const qs = new URLSearchParams({ api_key: key, limit: String(LIMIT), offset: String(offset), rating: "pg-13", bundle: "messaging_non_clips" });
  if (q) qs.set("q", q);

  try {
    const data = await cached(`giphy:${type}:${q.toLowerCase()}:${offset}`, 60 * 60_000, () =>
      fetchJson<{ data: GiphyItem[]; pagination?: { total_count?: number } }>(`https://api.giphy.com/v1/${type}/${endpoint}?${qs}`),
    );
    const items = data.data
      .map((g) => {
        const original = g.images.original;
        const big = original?.url && Number(original.size ?? 0) <= MAX_ORIGINAL_BYTES ? original : (g.images.downsized ?? original);
        const thumb = g.images.fixed_width ?? g.images.fixed_height_small ?? big;
        if (!big?.url) return null;
        return {
          id: g.id,
          title: g.title || "GIPHY",
          author: g.username || "GIPHY",
          pageUrl: g.url,
          src: big.url,
          width: Number(big.width) || 200,
          height: Number(big.height) || 200,
          thumb: thumb?.webp || thumb?.url || big.url,
        };
      })
      .filter(Boolean);
    return Response.json({ items, total: data.pagination?.total_count ?? items.length, offset }, { headers: cdnCache(3600) });
  } catch (err) {
    return upstreamFailed(err);
  }
}
