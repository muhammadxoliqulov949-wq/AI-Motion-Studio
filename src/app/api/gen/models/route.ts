import { loadCatalog, pollinationsKey } from "@/gen/server/pollinations";

/** What the studio can do on this deployment: models, prices and whether a Pollinations key is set. */
export async function GET() {
  const catalog = await loadCatalog();
  const hasKey = !!pollinationsKey();
  return Response.json(
    {
      hasKey,
      // Paid video needs the key, a Supabase account (when configured) and is not switched off.
      videoEnabled: hasKey && process.env.GEN_ALLOW_VIDEO !== "0",
      imageToVideoUpload: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      ...catalog,
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=600" } },
  );
}
