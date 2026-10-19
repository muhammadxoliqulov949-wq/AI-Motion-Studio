"use client";

/**
 * Browser side of the AI Studio: model catalogue, image generation and AI video generation.
 * Images always go through our server: with a Pollinations key (free) there is no watermark and no
 * limit; without one the server uses the keyless public endpoint (1 image per 45 s for everybody,
 * watermarked). Browsers cannot call that endpoint themselves (it asks for a Turnstile token).
 */
import { accessToken } from "@/editor/cloud";
import type { AspectRatio } from "@/editor/types";
import type { ImageModel, VideoModel } from "./server/pollinations";

export type { ImageModel, VideoModel };

export interface GenCaps {
  hasKey: boolean;
  videoEnabled: boolean;
  imageToVideoUpload: boolean;
  image: ImageModel[];
  video: VideoModel[];
}

export class GenError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

let caps: Promise<GenCaps> | null = null;
export const loadCaps = () => {
  caps ??= fetch("/api/gen/models")
    .then((r) => (r.ok ? (r.json() as Promise<GenCaps>) : Promise.reject(new Error(String(r.status)))))
    .catch(() => {
      caps = null;
      return { hasKey: false, videoEnabled: false, imageToVideoUpload: false, image: [], video: [] } satisfies GenCaps;
    });
  return caps;
};

/** Generation sizes per aspect ratio (multiples of 16, ≈ 1 MP). */
export const GEN_SIZES: Partial<Record<AspectRatio, [number, number]>> = {
  "9:16": [768, 1344],
  "16:9": [1344, 768],
  "1:1": [1024, 1024],
  "4:5": [896, 1120],
};

export interface ImageRequest {
  prompt: string;
  model?: string;
  aspect: AspectRatio;
  seed: number;
  signal?: AbortSignal;
}

export interface ImageResult {
  blob: Blob;
  model: string;
  /** The keyless public endpoint stamps a small "pollinations.ai" logo on the picture. */
  watermarked: boolean;
}

const readJson = async (res: Response) => (await res.json().catch(() => ({}))) as { error?: string; code?: string; retryAfter?: number };

export const generateImage = async ({ prompt, model, aspect, seed, signal }: ImageRequest): Promise<ImageResult> => {
  const [width, height] = GEN_SIZES[aspect] ?? [1024, 1024];
  const res = await fetch("/api/gen/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model, width, height, seed }),
    signal,
  });
  if (res.ok) return { blob: await res.blob(), model: res.headers.get("x-gen-model") ?? model ?? "", watermarked: res.headers.get("x-gen-watermark") === "1" };
  const data = await readJson(res);
  throw new GenError(data.error ?? `HTTP ${res.status}`, data.code ?? "upstream", data.retryAfter);
};

export interface VideoRequest {
  prompt: string;
  model: string;
  duration: number;
  aspect: AspectRatio;
  resolution?: string;
  audio?: boolean;
  /** Start frame (image → video). */
  image?: Blob;
  signal?: AbortSignal;
}

/** A JPEG data URL (≤ 1280 px long side) of an image blob: small enough to send to the server. */
export const toJpegDataUrl = async (blob: Blob, longSide = 1280): Promise<string> => {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, longSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.9);
};

/** Real AI video (paid, needs a Pollinations key with credit on the server). */
export const generateVideo = async ({ prompt, model, duration, aspect, resolution, audio, image, signal }: VideoRequest): Promise<Blob> => {
  const token = await accessToken();
  const res = await fetch("/api/gen/video", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ prompt, model, duration, aspectRatio: aspect, resolution, audio, ...(image ? { imageData: await toJpegDataUrl(image) } : {}) }),
    signal,
  });
  if (res.ok) return res.blob();
  const data = await readJson(res);
  throw new GenError(data.error ?? `HTTP ${res.status}`, data.code ?? "upstream", data.retryAfter);
};

/** Natural size of an image blob. */
export const imageSize = async (blob: Blob) => {
  const bmp = await createImageBitmap(blob);
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
};

export const randomSeed = () => Math.floor(Math.random() * 2_000_000_000);
