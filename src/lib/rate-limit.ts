/**
 * Per-IP rate limiting for the public AI endpoints.
 *
 * With KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV / Upstash Redis REST,
 * UPSTASH_REDIS_REST_URL / _TOKEN also work) the counters are shared by every
 * serverless instance. Without them we fall back to an in-memory sliding
 * window: best effort only, because each warm instance keeps its own counts.
 */

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Unix ms when the caller may try again. */
  resetAt: number;
}

interface RateLimitOptions {
  /** Bucket name, e.g. "edit". */
  name: string;
  limit: number;
  windowMs: number;
}

const memoryHits = new Map<string, number[]>();
let lastSweep = 0;

function memoryLimit(key: string, { limit, windowMs }: RateLimitOptions, now: number): RateLimitResult {
  // Drop idle keys now and then so the map can't grow without bound.
  if (now - lastSweep > windowMs) {
    lastSweep = now;
    for (const [k, hits] of memoryHits) {
      if (!hits.length || hits[hits.length - 1] <= now - windowMs) memoryHits.delete(k);
    }
  }

  const hits = (memoryHits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) {
    memoryHits.set(key, hits);
    return { ok: false, limit, remaining: 0, resetAt: hits[0] + windowMs };
  }
  hits.push(now);
  memoryHits.set(key, hits);
  return { ok: true, limit, remaining: limit - hits.length, resetAt: hits[0] + windowMs };
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/** Fixed-window counter in Redis: one INCR + PEXPIRE round trip per request. */
async function kvLimit(
  kv: { url: string; token: string },
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now: number,
): Promise<RateLimitResult> {
  const window = Math.floor(now / windowMs);
  const redisKey = `rl:${key}:${window}`;
  const res = await fetch(`${kv.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["PEXPIRE", redisKey, String(windowMs)],
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
  const [incr] = (await res.json()) as { result?: number; error?: string }[];
  if (typeof incr?.result !== "number") throw new Error(incr?.error ?? "KV javobi noto'g'ri");

  const count = incr.result;
  return {
    ok: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: (window + 1) * windowMs,
  };
}

export function getClientIp(req: Request): string {
  const h = req.headers;
  const forwarded = h.get("x-vercel-forwarded-for") ?? h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  return ip || "unknown";
}

export async function rateLimit(req: Request, opts: RateLimitOptions): Promise<RateLimitResult> {
  const key = `${opts.name}:${getClientIp(req)}`;
  const now = Date.now();
  const kv = kvConfig();
  if (kv) {
    try {
      return await kvLimit(kv, key, opts, now);
    } catch (err) {
      console.error("Rate limit KV failed, using in-memory fallback:", err);
    }
  }
  return memoryLimit(key, opts, now);
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
  };
}

export function rateLimitedResponse(r: RateLimitResult): Response {
  const retryAfter = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000));
  const minutes = Math.ceil(retryAfter / 60);
  return Response.json(
    {
      error: `So'rovlar juda ko'p. Iltimos, ${minutes} daqiqadan keyin qayta urinib ko'ring.`,
      code: "rate_limited",
      retryAfter,
    },
    { status: 429, headers: { ...rateLimitHeaders(r), "Retry-After": String(retryAfter) } },
  );
}
