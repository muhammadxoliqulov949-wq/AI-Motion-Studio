import { cached, cdnCache, fetchJson, noKey, upstreamFailed } from "@/lib/api-cache";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Online sound-effect search (Freesound, https://freesound.org/docs/api/). FREESOUND_API_KEY stays on
 * the server. Only CC0 and CC BY sounds are returned (no non-commercial / sampling licences), and the
 * HQ MP3 preview is played through /api/sounds/file so it is same-origin for preview and export.
 *
 * Pixabay's public API only covers images and videos (no sound / music endpoint), so it cannot be used here.
 */

interface FreesoundResult {
  id: number;
  name: string;
  username: string;
  duration: number;
  license: string;
  url: string;
  previews: Record<string, string>;
  tags?: string[];
}

const licenseOf = (url: string) => {
  if (/publicdomain\/zero/i.test(url)) return { name: "CC0", credit: false };
  if (/licenses\/by\/(\d\.\d)/i.test(url)) return { name: `CC BY ${url.match(/by\/(\d\.\d)/i)![1]}`, credit: true };
  return null;
};

export async function GET(req: Request) {
  const key = process.env.FREESOUND_API_KEY;
  if (!key) return noKey("FREESOUND_API_KEY", "freesound.org/apiv2/apply — bepul kalit oling.");

  const rl = await rateLimit(req, { name: "sounds", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rateLimitedResponse(rl);

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().toLowerCase().slice(0, 80) || "whoosh";
  const page = Math.max(1, Math.min(50, Number(params.get("page")) || 1));
  const qs = new URLSearchParams({
    query: q,
    token: key,
    page: String(page),
    page_size: "30",
    fields: "id,name,username,duration,license,url,previews,tags",
    // Short effects first; long field recordings are rarely what an editor wants.
    filter: 'duration:[0 TO 30] license:("Creative Commons 0" OR "Attribution")',
    sort: "score",
  });

  try {
    const data = await cached(`sounds:${q}:${page}`, 6 * 60 * 60_000, () =>
      fetchJson<{ count: number; next: string | null; results: FreesoundResult[] }>(`https://freesound.org/apiv2/search/text/?${qs}`),
    );
    const items = data.results
      .map((s) => {
        const lic = licenseOf(s.license);
        const preview = s.previews["preview-hq-mp3"] ?? s.previews["preview-lq-mp3"];
        if (!lic || !preview) return null;
        const title = s.name.replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, "");
        return {
          id: `fs_${s.id}`,
          title,
          author: s.username,
          duration: Math.round(s.duration * 100) / 100,
          license: lic.name,
          pageUrl: s.url,
          src: `/api/sounds/file?u=${encodeURIComponent(preview)}`,
          credit: lic.credit ? `"${title}" — ${s.username} (Freesound, ${s.url}), ${lic.name}` : undefined,
        };
      })
      .filter(Boolean);
    return Response.json({ items, total: data.count, page, next: data.next ? page + 1 : null }, { headers: cdnCache(6 * 3600) });
  } catch (err) {
    return upstreamFailed(err);
  }
}
