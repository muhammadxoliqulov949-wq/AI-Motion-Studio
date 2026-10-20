/**
 * Server-side access to Pollinations (https://gen.pollinations.ai): one API for image and video models.
 * - Image models marked `paid_only: false` work on a free key (POLLINATIONS_API_KEY, get it at enter.pollinations.ai).
 * - Video models are all paid (credits called "pollen", $1 ≈ 1 pollen), priced per generated second.
 * The key never leaves the server.
 */
import { cached } from "@/lib/api-cache";

export const GEN_BASE = "https://gen.pollinations.ai";

export const pollinationsKey = () => process.env.POLLINATIONS_API_KEY || "";

interface RawModel {
  name: string;
  title?: string;
  description?: string;
  publisher?: string;
  community?: boolean;
  paid_only?: boolean;
  per_user_rpm?: number | null;
  category?: string;
  pricing?: { completionVideoSeconds?: string; completionAudioSeconds?: string; completionImageTokens?: string };
  input_modalities?: string[];
  output_modalities?: string[];
  video_capabilities?: string[];
  min_duration?: number;
  max_duration?: number;
  default_duration?: number;
  resolutions?: string[];
  health?: { status?: string };
}

export interface ImageModel {
  id: string;
  title: string;
  publisher: string;
  /** Requests per minute allowed per user on the free tier. */
  rpm: number | null;
}

export interface VideoModel {
  id: string;
  title: string;
  publisher: string;
  description: string;
  /** Pollen (≈ USD) per generated second, without audio. */
  perSecond: number;
  audioPerSecond: number;
  minDuration: number;
  maxDuration: number;
  defaultDuration: number;
  resolutions: string[];
  /** Can start from an image (image-to-video). */
  imageInput: boolean;
  /** Can take an end frame too. */
  endFrame: boolean;
  audio: boolean;
}

export interface GenCatalog {
  image: ImageModel[];
  video: VideoModel[];
}

const FALLBACK: GenCatalog = { image: [{ id: "tongyi-mai/z-image-turbo", title: "Z-Image Turbo", publisher: "Alibaba", rpm: 60 }], video: [] };

const get = async (path: string): Promise<RawModel[]> => {
  const res = await fetch(`${GEN_BASE}${path}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`models HTTP ${res.status}`);
  return (await res.json()) as RawModel[];
};

/** Curated catalogue (cached for an hour): free image models + the cheapest video models. */
export const loadCatalog = (): Promise<GenCatalog> =>
  cached("gen-catalog", 60 * 60_000, async () => {
    try {
      const [images, videos] = await Promise.all([get("/image/models"), get("/video/models")]);
      const image = images
        .filter((m) => m.category === "image" && !m.community && !m.paid_only && (m.per_user_rpm ?? 0) >= 12 && m.health?.status !== "down")
        .sort((a, b) => Number(/z-image/.test(b.name)) - Number(/z-image/.test(a.name)) || (b.per_user_rpm ?? 0) - (a.per_user_rpm ?? 0))
        .slice(0, 6)
        .map<ImageModel>((m) => ({ id: m.name, title: m.title ?? m.name, publisher: m.publisher ?? "", rpm: m.per_user_rpm ?? null }));
      const video = videos
        // Generative text/image → video only: skip sound-effect tools (take a video as input) and talking-avatar tools.
        .filter((m) => m.category === "video" && !m.community && m.input_modalities?.includes("text") && !/sfx|heygen/i.test(m.name) && m.output_modalities?.includes("video") && Number(m.pricing?.completionVideoSeconds) > 0 && m.health?.status !== "down")
        .map<VideoModel>((m) => ({
          id: m.name,
          title: m.title ?? m.name,
          publisher: m.publisher ?? "",
          description: m.description ?? "",
          perSecond: Number(m.pricing?.completionVideoSeconds),
          audioPerSecond: Number(m.pricing?.completionAudioSeconds ?? 0),
          minDuration: m.min_duration ?? 5,
          maxDuration: m.max_duration ?? 5,
          defaultDuration: m.default_duration ?? m.min_duration ?? 5,
          resolutions: m.resolutions ?? [],
          imageInput: !!m.input_modalities?.includes("image"),
          endFrame: !!m.video_capabilities?.includes("end_frame"),
          audio: !!m.output_modalities?.includes("audio"),
        }))
        .sort((a, b) => a.perSecond - b.perSecond)
        .slice(0, 10);
      return image.length ? { image, video } : FALLBACK;
    } catch (err) {
      console.warn("Pollinations catalogue failed:", (err as Error).message);
      return FALLBACK;
    }
  });

/** Maps a provider failure to a message the user can act on. */
export const providerError = (status: number, body: string) => {
  let detail = "";
  try {
    detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    /* not JSON */
  }
  if (status === 401 || status === 403) return { status: 502, error: "Pollinations kaliti noto'g'ri yoki ruxsat yo'q.", code: "bad_key" };
  if (status === 402) return { status: 402, error: detail ? `Pollinations: ${detail}` : "Pollinations hisobida kredit (pollen) yetarli emas.", code: "no_credit" };
  if (status === 429) return { status: 429, error: "Pollinations so'rovlar limitiga yetdi — birozdan keyin urinib ko'ring.", code: "rate_limited" };
  if (status === 400) return { status: 400, error: detail || "So'rov qabul qilinmadi (prompt yoki sozlamalarni tekshiring).", code: "bad_request" };
  return { status: 502, error: "Generatsiya xizmati javob bermadi.", code: "upstream" };
};
