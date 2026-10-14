import { computePeaks } from "./sample-media";
import type { MediaAsset } from "./types";
import { uid } from "./utils";

const loadVideo = (src: string) =>
  new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = src;
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error("Videoni o'qib bo'lmadi"));
  });

const seek = (video: HTMLVideoElement, time: number) =>
  new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = time;
  });

const captureFilmstrip = async (video: HTMLVideoElement, count: number) => {
  const canvas = document.createElement("canvas");
  const h = 72;
  canvas.height = h;
  canvas.width = Math.round((video.videoWidth / video.videoHeight) * h) || 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    await seek(video, (video.duration * (i + 0.5)) / count);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.6));
  }
  return frames;
};

const GRADIENTS = [
  "linear-gradient(135deg,#312e81,#6366f1)",
  "linear-gradient(135deg,#7c2d12,#fb923c)",
  "linear-gradient(135deg,#134e4a,#2dd4bf)",
  "linear-gradient(135deg,#701a75,#e879f9)",
];

export const importFile = async (file: File): Promise<MediaAsset | null> => {
  const src = URL.createObjectURL(file);
  const gradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];

  if (file.type.startsWith("video/")) {
    const video = await loadVideo(src);
    const thumbs = await captureFilmstrip(video, 6).catch(() => []);
    return {
      id: uid("asset"),
      name: file.name,
      kind: "video",
      duration: video.duration || 5,
      src,
      thumbs,
      gradient,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  }

  if (file.type.startsWith("audio/")) {
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    void ctx.close();
    return {
      id: uid("asset"),
      name: file.name,
      kind: "audio",
      duration: decoded.duration,
      src,
      gradient: "linear-gradient(135deg,#065f46,#34d399)",
      peaks: computePeaks(decoded.getChannelData(0), 400),
    };
  }

  if (file.type.startsWith("image/")) {
    return {
      id: uid("asset"),
      name: file.name,
      kind: "image",
      duration: 4,
      src,
      thumbs: [src],
      gradient,
    };
  }

  URL.revokeObjectURL(src);
  return null;
};
