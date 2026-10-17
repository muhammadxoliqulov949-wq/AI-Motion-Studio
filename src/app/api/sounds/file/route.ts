/**
 * Same-origin access to Freesound preview MP3s (for the preview player, waveform decoding and export).
 * Only cdn.freesound.org preview files are allowed, so this is not an open proxy.
 */

const ALLOWED = /^https:\/\/cdn\.freesound\.org\/previews\/\d+\/[\w.-]+\.(mp3|ogg)$/;

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("u") ?? "";
  if (!ALLOWED.test(url)) return Response.json({ error: "Ruxsat etilmagan manzil" }, { status: 400 });

  const range = req.headers.get("range");
  const upstream = await fetch(url, { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!upstream || (upstream.status !== 200 && upstream.status !== 206)) {
    return Response.json({ error: "Tovush yuklanmadi" }, { status: 502 });
  }
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
