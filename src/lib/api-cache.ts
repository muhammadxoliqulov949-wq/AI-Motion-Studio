/**
 * Helpers for the third-party library proxies (Giphy, Iconify, Freesound):
 * - an in-memory TTL cache per warm serverless instance, so repeated searches do not hit the
 *   provider (and its rate limits) again;
 * - CDN cache headers, so Vercel's edge serves identical requests without running the function.
 * API keys are only ever added on the server; responses never contain them.
 */

const MAX_ENTRIES = 500;
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

/** Runs `fn` once per `key` within `ttlMs`; failures are not cached. */
export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;
  const value = fn();
  store.set(key, { expires: now + ttlMs, value });
  value.catch(() => store.delete(key));
  if (store.size > MAX_ENTRIES) {
    // Map keeps insertion order: drop the oldest entries.
    for (const k of [...store.keys()].slice(0, store.size - MAX_ENTRIES)) store.delete(k);
  }
  return value;
}

/** Cache-Control for search results: CDN keeps them for `seconds`, then serves stale while refreshing. */
export const cdnCache = (seconds: number) => ({
  "Cache-Control": `public, max-age=60, s-maxage=${seconds}, stale-while-revalidate=${seconds * 24}`,
});

export const noKey = (envName: string, hint: string) =>
  Response.json({ error: `Serverda ${envName} sozlanmagan. ${hint}`, code: "no_api_key" }, { status: 503 });

export class UpstreamError extends Error {
  constructor(public status: number) {
    super(`Upstream HTTP ${status}`);
  }
}

export const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!res.ok) throw new UpstreamError(res.status);
  return (await res.json()) as T;
};

export const upstreamFailed = (err: unknown) => {
  const status = err instanceof UpstreamError ? err.status : 0;
  const message =
    status === 401 || status === 403
      ? "API kaliti noto'g'ri yoki ruxsat yo'q"
      : status === 429
        ? "Manba so'rovlar limitiga yetdi, birozdan keyin urinib ko'ring"
        : "Manba javob bermadi";
  return Response.json({ error: message, code: "upstream" }, { status: 502 });
};
