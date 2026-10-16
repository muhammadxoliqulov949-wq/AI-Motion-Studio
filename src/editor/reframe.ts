/**
 * Smart reframe: finds faces through a clip with MediaPipe's face detector (loaded from a CDN
 * on demand) and writes "focusX" keyframes so a wide shot stays centred on the person when
 * the canvas is vertical or square.
 */
import { setKeyframe } from "./keyframes";
import type { Clip, MediaAsset, MediaClip } from "./types";
import { round } from "./utils";

const VERSION = "0.10.14";
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

interface Detector {
  detect: (image: HTMLCanvasElement) => { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number } }[] };
}

let detectorPromise: Promise<Detector> | null = null;

// Loaded at runtime from the CDN so the editor bundle stays small.
const importFromUrl = new Function("u", "return import(u)") as (u: string) => Promise<{
  FilesetResolver: { forVisionTasks: (p: string) => Promise<unknown> };
  FaceDetector: { createFromOptions: (f: unknown, o: unknown) => Promise<Detector> };
}>;

const getDetector = () => {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await importFromUrl(BUNDLE);
      const files = await vision.FilesetResolver.forVisionTasks(WASM);
      return vision.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
      });
    })();
    detectorPromise.catch(() => (detectorPromise = null));
  }
  return detectorPromise;
};

const loadVideo = (src: string) =>
  new Promise<HTMLVideoElement>((resolve, reject) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = src;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Videoni o'qib bo'lmadi"));
  });

const seek = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((resolve) => {
    v.onseeked = () => resolve();
    v.currentTime = t;
  });

/** Can this clip be reframed? (needs a real video with known dimensions) */
export const canReframe = (asset?: MediaAsset) => !!asset?.src && asset.kind === "video" && !asset.scene;

/**
 * Samples the clip ~2×/s, detects the largest face and returns a smoothed horizontal focus
 * (0 = left edge, 1 = right edge of the source) per sample time (seconds from clip start).
 */
export const trackFaces = async (clip: MediaClip, asset: MediaAsset, onProgress?: (p: number) => void) => {
  const detector = await getDetector();
  const video = await loadVideo(asset.src!);
  const canvas = document.createElement("canvas");
  const w = 320;
  canvas.width = w;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * w) || 180;
  const ctx = canvas.getContext("2d")!;
  const samples = Math.min(80, Math.max(2, Math.ceil(clip.duration * 2)));
  const raw: { t: number; x: number | null }[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (clip.duration * i) / (samples - 1);
    const src = clip.reverse ? clip.in + (clip.duration - t) * clip.speed : clip.in + t * clip.speed;
    await seek(video, Math.min(video.duration - 0.05, src));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const faces = detector.detect(canvas).detections.filter((d) => d.boundingBox);
    const best = faces.sort((a, b) => b.boundingBox!.width * b.boundingBox!.height - a.boundingBox!.width * a.boundingBox!.height)[0];
    raw.push({ t, x: best ? (best.boundingBox!.originX + best.boundingBox!.width / 2) / canvas.width : null });
    onProgress?.((i + 1) / samples);
  }
  video.removeAttribute("src");
  video.load();
  const found = raw.filter((r) => r.x !== null).length;
  // Fill gaps with the nearest detection, then smooth to avoid jittery pans.
  let last = raw.find((r) => r.x !== null)?.x ?? 0.5;
  const filled = raw.map((r) => (r.x === null ? { ...r, x: last } : ((last = r.x), r))) as { t: number; x: number }[];
  const smooth = filled.map((r, i) => {
    const win = filled.slice(Math.max(0, i - 2), i + 3);
    return { t: r.t, x: win.reduce((s, v) => s + v.x, 0) / win.length };
  });
  return { points: smooth, found, samples };
};

/** Writes focusX keyframes (only where the framing actually moves). */
export const applyReframe = (clip: Clip, points: { t: number; x: number }[]): Clip => {
  let next: Clip = { ...clip, keyframes: { ...clip.keyframes, focusX: [] } } as Clip;
  let prev = -1;
  points.forEach((p, i) => {
    if (i === 0 || i === points.length - 1 || Math.abs(p.x - prev) > 0.03) {
      next = setKeyframe(next, "focusX", p.t, round(p.x, 3), "ease");
      prev = p.x;
    }
  });
  return { ...next, fit: "cover" } as Clip;
};
