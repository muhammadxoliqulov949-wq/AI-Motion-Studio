import { cached, cdnCache, fetchJson, upstreamFailed } from "@/lib/api-cache";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

/**
 * Iconify icon search (free public API, no key): https://iconify.design/docs/api/
 * Only icon sets whose license allows use in videos without share-alike / non-commercial terms are
 * returned; each result carries its set's license so it can be credited.
 */

const ALLOWED_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "ISC",
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-3.0",
  "OFL-1.1",
  "Unlicense",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MPL-2.0",
]);
/** Licenses that require attribution (credit line in the export dialog). */
const NEEDS_CREDIT = new Set(["CC-BY-4.0", "CC-BY-3.0"]);

interface IconifySearch {
  icons: string[];
  total: number;
  collections: Record<string, { name: string; author?: { name: string }; license?: { title: string; spdx?: string; url?: string } }>;
}

export async function GET(req: Request) {
  const rl = await rateLimit(req, { name: "icons", limit: 150, windowMs: 60_000 });
  if (!rl.ok) return rateLimitedResponse(rl);

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().toLowerCase().slice(0, 60) || "arrow";
  const start = Math.max(0, Math.min(900, Number(params.get("start")) || 0));

  try {
    const data = await cached(`icons:${q}:${start}`, 6 * 60 * 60_000, () =>
      fetchJson<IconifySearch>(`https://api.iconify.design/search?${new URLSearchParams({ query: q, limit: "96", start: String(start) })}`),
    );
    const items = data.icons
      .map((icon) => {
        const [prefix, name] = icon.split(":");
        const set = data.collections[prefix];
        const spdx = set?.license?.spdx;
        if (!set || !spdx || !ALLOWED_LICENSES.has(spdx)) return null;
        return {
          icon,
          name,
          set: set.name,
          license: set.license!.title,
          credit: NEEDS_CREDIT.has(spdx) ? `Belgi "${name}" — ${set.name}${set.author ? ` (${set.author.name})` : ""}, ${set.license!.title}` : undefined,
        };
      })
      .filter(Boolean);
    return Response.json({ items, total: data.total, start, next: data.icons.length >= 96 ? start + 96 : null }, { headers: cdnCache(6 * 3600) });
  } catch (err) {
    return upstreamFailed(err);
  }
}
