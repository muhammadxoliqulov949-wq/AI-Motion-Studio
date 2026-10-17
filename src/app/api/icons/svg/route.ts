import { cached } from "@/lib/api-cache";
import { isSafeSvg } from "@/editor/catalog/icons";

/** Returns one Iconify icon as SVG markup (stored inside the sticker clip, so export needs no network). */

const ICON_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(req: Request) {
  const icon = new URL(req.url).searchParams.get("icon") ?? "";
  if (!ICON_RE.test(icon)) return Response.json({ error: "Noto'g'ri belgi nomi" }, { status: 400 });
  const [prefix, name] = icon.split(":");
  try {
    const svg = await cached(`svg:${icon}`, 24 * 60 * 60_000, async () => {
      const res = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    });
    if (!svg.startsWith("<svg") || !isSafeSvg(svg)) return Response.json({ error: "Belgi topilmadi" }, { status: 404 });
    return new Response(svg, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400, s-maxage=2592000, immutable" },
    });
  } catch {
    return Response.json({ error: "Belgi topilmadi" }, { status: 404 });
  }
}
