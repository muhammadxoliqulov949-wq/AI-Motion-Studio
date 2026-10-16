import musicData from "@/editor/catalog/music.json";

/**
 * Same-origin proxy for the music library (Kevin MacLeod, incompetech.com, CC BY 4.0).
 * incompetech sends no CORS headers, so the editor could not decode tracks for waveforms or
 * include them in the in-browser export. Only files listed in the catalog are served, so this
 * is not an open proxy; responses are cached by the CDN.
 */
const ALLOWED = new Set((musicData as { file: string }[]).map((t) => t.file));
const ORIGIN = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/";

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const name = decodeURIComponent(file);
  if (!ALLOWED.has(name)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(ORIGIN + encodeURIComponent(name), {
      headers: { "User-Agent": "AIMotionStudio/1.0", ...(range ? { Range: range } : {}) },
    });
  } catch {
    return Response.json({ error: "Upstream unavailable" }, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return Response.json({ error: "Upstream error" }, { status: 502 });
  }
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
