import { type AwsRegion, renderMediaOnLambda, speculateFunctionName } from "@remotion/lambda/client";
import { DISK, RAM, REGION, SITE_NAME, TIMEOUT } from "../../../../../config.mjs";
import type { MediaAsset, Project } from "@/editor/types";
import { projectDuration } from "@/editor/utils";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { getUserFromRequest, supabaseEnabled } from "@/lib/supabase";

/**
 * Server-side export of an editor timeline on Remotion Lambda (composition "Timeline").
 * Poll progress with POST /api/lambda/progress { id, bucketName }.
 */

// Lambda renders cost money: keep a tight per-IP limit.
const RATE_LIMIT = { name: "lambda-render", limit: 6, windowMs: 60 * 60 * 1000 };
const MAX_BODY = 2_000_000;
const MAX_SECONDS = 10 * 60;

const FORMATS = {
  mp4: { codec: "h264", ext: "mp4" },
  webm: { codec: "vp8", ext: "webm" },
  gif: { codec: "gif", ext: "gif" },
  mp3: { codec: "mp3", ext: "mp3" },
} as const;

const lambdaConfigured = () =>
  !!(process.env.AWS_ACCESS_KEY_ID || process.env.REMOTION_AWS_ACCESS_KEY_ID) && !!(process.env.AWS_SECRET_ACCESS_KEY || process.env.REMOTION_AWS_SECRET_ACCESS_KEY);

/** Lets the export dialog pick server rendering by default on phones when it is available. */
export function GET() {
  return Response.json({ available: lambdaConfigured(), authRequired: supabaseEnabled }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  if (!lambdaConfigured()) {
    return Response.json({ error: "Serverda Remotion Lambda (AWS kalitlari) sozlanmagan.", code: "no_lambda" }, { status: 503 });
  }
  if (supabaseEnabled && !(await getUserFromRequest(req))) {
    return Response.json({ error: "Server eksporti uchun tizimga kiring.", code: "auth_required" }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Loyiha juda katta", code: "too_large" }, { status: 413 });
  let body: { project?: Project; assets?: MediaAsset[]; scale?: number; format?: keyof typeof FORMATS; name?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Noto'g'ri JSON", code: "bad_request" }, { status: 400 });
  }
  const { project, assets = [] } = body;
  if (!project || !Array.isArray(project.clips) || !Array.isArray(assets)) {
    return Response.json({ error: "project va assets kerak", code: "bad_request" }, { status: 400 });
  }
  if (projectDuration(project) > MAX_SECONDS) {
    return Response.json({ error: "Server eksporti 10 daqiqagacha bo'lgan videolar uchun", code: "too_long" }, { status: 413 });
  }

  // Lambda fetches media itself: relative paths become absolute, local-only URLs are rejected.
  const origin = new URL(req.url).origin;
  const used = new Set(project.clips.map((c) => (c.type === "media" ? c.assetId : "")));
  const local: string[] = [];
  const cleanAssets = assets
    .filter((a) => used.has(a.id))
    .map((a) => {
      let src = a.src;
      if (src?.startsWith("blob:") || src?.startsWith("data:")) {
        local.push(a.name);
        src = undefined;
      } else if (src?.startsWith("/")) src = origin + src;
      return { ...a, src, thumbs: undefined, peaks: undefined };
    });
  if (local.length) {
    return Response.json(
      { error: `Bu fayllar faqat brauzeringizda: ${local.slice(0, 3).join(", ")}. Tizimga kiring (fayllar bulutga yuklanadi) yoki brauzerda eksport qiling.`, code: "local_media" },
      { status: 400 },
    );
  }

  const format = FORMATS[body.format ?? "mp4"] ?? FORMATS.mp4;
  const frames = Math.ceil(projectDuration(project) * project.fps);
  const scale = Math.min(2, Math.max(0.25, Number(body.scale) || 1));
  const fileName = `${(body.name ?? project.name).replace(/[^\p{L}\p{N}_ -]+/gu, "").trim() || "video"}.${format.ext}`;

  try {
    const result = await renderMediaOnLambda({
      codec: format.codec,
      functionName: speculateFunctionName({ diskSizeInMb: DISK, memorySizeInMb: RAM, timeoutInSeconds: TIMEOUT }),
      region: REGION as AwsRegion,
      serveUrl: SITE_NAME,
      composition: "Timeline",
      inputProps: { project, assets: cleanAssets },
      scale,
      framesPerLambda: Math.max(40, Math.ceil(frames / 150)),
      downloadBehavior: { type: "download", fileName },
    });
    return Response.json({ renderId: result.renderId, bucketName: result.bucketName });
  } catch (err) {
    console.error("Lambda render failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Render boshlanmadi", code: "lambda_error" }, { status: 502 });
  }
}
