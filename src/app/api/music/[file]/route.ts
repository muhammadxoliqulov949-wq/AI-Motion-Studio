import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import musicData from "@/editor/catalog/music.json";

/**
 * Same-origin access to the music library (Kevin MacLeod, incompetech.com, CC BY 4.0).
 *
 * incompetech sends no CORS headers and can be very slow (TLS handshakes of 20–30 s have been
 * seen), so:
 *  - with SUPABASE_SERVICE_ROLE_KEY set, each track is copied once into the public "music"
 *    bucket and every request is redirected there (fast, CORS-enabled, CDN-cached);
 *  - otherwise the file is streamed from incompetech with a generous timeout.
 * Only files listed in the catalog are served, so this is not an open proxy.
 */
export const maxDuration = 60;

const ALLOWED = new Set((musicData as { file: string }[]).map((t) => t.file));
const ORIGIN = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/";
const BUCKET = "music";
const UPSTREAM_TIMEOUT_MS = 50_000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null;

/** Files known to be in the bucket (per warm instance). */
const cached = new Set<string>();
const inflight = new Map<string, Promise<boolean>>();

const objectPath = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "_");
const publicUrl = (name: string) => `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectPath(name)}`;

interface Upstream {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
}

/** node:https instead of fetch: undici gives up after a 10 s connect timeout. */
const fetchUpstream = (name: string, range: string | null) =>
  new Promise<Upstream>((resolve, reject) => {
    const req = httpsRequest(
      ORIGIN + encodeURIComponent(name),
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; AIMotionStudio/1.0)", ...(range ? { Range: range } : {}) }, timeout: UPSTREAM_TIMEOUT_MS },
      (res) => resolve({ status: res.statusCode ?? 502, headers: res.headers, body: res }),
    );
    req.on("timeout", () => req.destroy(new Error("incompetech timeout")));
    req.on("error", reject);
    req.end();
  });

const readAll = async (stream: Readable) => {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    chunks.push(chunk as Uint8Array);
    size += (chunk as Uint8Array).byteLength;
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
};

/** Makes sure the track is in the bucket (downloads it from incompetech once). */
const ensureCached = (name: string) => {
  if (cached.has(name)) return Promise.resolve(true);
  let job = inflight.get(name);
  if (!job) {
    job = (async () => {
      const head = await fetch(publicUrl(name), { method: "HEAD" }).catch(() => null);
      if (head?.ok) return true;
      const up = await fetchUpstream(name, null);
      if (up.status !== 200) return false;
      const data = await readAll(up.body);
      const { error } = await admin!.storage.from(BUCKET).upload(objectPath(name), data, {
        contentType: "audio/mpeg",
        cacheControl: "31536000",
        upsert: true,
      });
      if (error) {
        console.warn("Music cache upload failed:", error.message);
        return false;
      }
      return true;
    })()
      .then((ok) => {
        if (ok) cached.add(name);
        return ok;
      })
      .catch((err) => {
        console.warn("Music cache failed:", (err as Error).message);
        return false;
      })
      .finally(() => inflight.delete(name));
    inflight.set(name, job);
  }
  return job;
};

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = decodeURIComponent(file);
  if (!ALLOWED.has(name)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (admin && (await ensureCached(name))) {
    return new Response(null, {
      status: 307,
      headers: { Location: publicUrl(name), "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  }

  const range = req.headers.get("range");
  let up: Upstream;
  try {
    up = await fetchUpstream(name, range);
  } catch {
    return Response.json({ error: "Musiqa serveri javob bermadi" }, { status: 504 });
  }
  if (up.status !== 200 && up.status !== 206) {
    up.body.resume();
    return Response.json({ error: "Upstream error" }, { status: 502 });
  }
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = up.headers[h];
    if (typeof v === "string") headers.set(h, v);
  }
  return new Response(Readable.toWeb(up.body) as ReadableStream, { status: up.status, headers });
}
