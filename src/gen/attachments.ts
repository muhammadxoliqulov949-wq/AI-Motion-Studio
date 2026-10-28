"use client";

/**
 * Reference materials for AI Studio ("+" next to the prompt): pictures, videos and documents.
 * Everything is prepared in the browser (a frame from a video, text from a document) and sent to
 * /api/gen/describe, which turns it into one English image prompt.
 */
import { unzipSync, strFromU8 } from "fflate";
import { GenError, toJpegDataUrl } from "./client";

export type AttachmentKind = "image" | "video" | "document";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  /** Picture (or the frame grabbed from a video). */
  blob?: Blob;
  /** Object URL of `blob`, for the chip and the hand-over to the Video tab. */
  thumb?: string;
  /** Document text extracted in the browser. */
  text?: string;
  /** PDF bytes as base64 (text is extracted on the server). */
  pdf?: string;
}

export const ACCEPT: Record<AttachmentKind, string> = {
  image: "image/*",
  video: "video/*",
  document: ".txt,.md,.csv,.json,.srt,.vtt,.html,.htm,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const MAX_ATTACHMENTS = 6;
const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

const id = () => Math.random().toString(36).slice(2, 10);

/** A JPEG frame from the middle of the first seconds of a video. */
const videoFrame = (file: File) =>
  new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`«${file.name}» videosini o'qib bo'lmadi`));
    };
    v.onerror = fail;
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1.5, (v.duration || 2) / 2);
    };
    v.onseeked = () => {
      const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * k);
      c.height = Math.round(v.videoHeight * k);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : fail()), "image/jpeg", 0.9);
    };
    v.src = url;
  });

const docxText = async (file: File) => {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error();
  return strFromU8(xml)
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
};

const base64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** File → attachment. Throws an Error with an Uzbek message for unsupported or broken files. */
export const fileToAttachment = async (file: File): Promise<Attachment> => {
  if (file.size > MAX_FILE_BYTES) throw new Error(`«${file.name}» juda katta (200 MB gacha)`);
  const lower = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return { id: id(), kind: "image", name: file.name, blob: file, thumb: URL.createObjectURL(file) };
  if (file.type.startsWith("video/")) {
    const frame = await videoFrame(file);
    return { id: id(), kind: "video", name: file.name, blob: frame, thumb: URL.createObjectURL(frame) };
  }
  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    if (file.size > MAX_PDF_BYTES) throw new Error(`«${file.name}»: PDF 4 MB dan oshmasin`);
    return { id: id(), kind: "document", name: file.name, pdf: await base64(file) };
  }
  if (lower.endsWith(".docx")) {
    try {
      return { id: id(), kind: "document", name: file.name, text: (await docxText(file)).slice(0, 20000) };
    } catch {
      throw new Error(`«${file.name}» Word faylini o'qib bo'lmadi`);
    }
  }
  if (file.type.startsWith("text/") || /\.(txt|md|csv|json|srt|vtt|html?)$/.test(lower)) {
    const raw = (await file.text()).slice(0, 40000);
    const text = /\.html?$/.test(lower) ? raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ") : raw;
    return { id: id(), kind: "document", name: file.name, text };
  }
  throw new Error(`«${file.name}»: bu turdagi fayl qo'llab-quvvatlanmaydi (rasm, video, PDF, Word, TXT)`);
};

export const releaseAttachment = (a: Attachment) => {
  if (a.thumb) URL.revokeObjectURL(a.thumb);
};

const HUES: [number, string][] = [
  [15, "red"],
  [40, "orange"],
  [65, "golden yellow"],
  [160, "green"],
  [195, "teal"],
  [250, "blue"],
  [290, "purple"],
  [335, "pink"],
  [360, "red"],
];
const hueName = (h: number) => HUES.find(([max]) => h <= max)![1];

/**
 * What the browser can tell about a picture on its own (used when the server has no vision model):
 * orientation, brightness, colourfulness and the main colours.
 */
export const imageHint = async (blob: Blob) => {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, 48, 48);
  const orientation = bmp.width > bmp.height * 1.15 ? "landscape" : bmp.height > bmp.width * 1.15 ? "portrait" : "square";
  bmp.close();
  const data = ctx.getImageData(0, 0, 48, 48).data;
  let light = 0;
  let sat = 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    light += l;
    sat += s;
    let name: string;
    if (s < 0.18 || l < 0.08 || l > 0.94) name = l < 0.2 ? "black" : l > 0.8 ? "white" : "grey";
    else {
      const d = max - min;
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      name = hueName(h);
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const n = data.length / 4;
  const avgL = light / n;
  const avgS = sat / n;
  const colours = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  return [`${orientation} picture`, avgL < 0.3 ? "dark, low-key, moody lighting" : avgL > 0.65 ? "bright, high-key lighting" : "balanced natural lighting", avgS > 0.45 ? "vivid saturated colours" : avgS < 0.18 ? "muted, desaturated colours" : "soft colours", `dominant colours: ${colours.join(", ")}`].join("; ");
};

/** Attachments (+ the user's own words) → an English prompt written by AI. */
export const describeMaterials = async (idea: string, items: Attachment[], visionAvailable: boolean, signal?: AbortSignal): Promise<string> => {
  const pictures = items.filter((a) => a.blob);
  const images = visionAvailable ? await Promise.all(pictures.map((a) => toJpegDataUrl(a.blob!, 768))) : [];
  const imageHints = visionAvailable ? [] : await Promise.all(pictures.map((a) => imageHint(a.blob!)));
  const documents = items.filter((a) => a.kind === "document").map((a) => ({ name: a.name, text: a.text, pdf: a.pdf }));
  const res = await fetch("/api/gen/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, images, imageHints, documents }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as { prompt?: string; error?: string; code?: string; retryAfter?: number };
  if (!res.ok || !data.prompt) throw new GenError(data.error ?? `HTTP ${res.status}`, data.code ?? "upstream", data.retryAfter);
  return data.prompt;
};
