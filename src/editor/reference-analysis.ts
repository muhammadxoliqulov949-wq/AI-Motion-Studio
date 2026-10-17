/**
 * "Edit it like this video": measures a reference video's editing rhythm and look in the browser.
 * Frames are sampled at a few fps on a tiny canvas; cuts come from frame-to-frame change (hard cuts),
 * runs of moderate change (dissolves), and near-black / near-white frames (dips and flashes).
 * Colour metrics map to the closest preset in catalog/filters.ts. A handful of larger frames is kept
 * for the vision model (caption placement, framing, overall style).
 */
import { decodeAudio, detectBeats } from "./audio-analysis";
import { ASPECTS } from "./presets";
import type { AspectRatio, MediaAsset, ReferenceStyle } from "./types";
import { round } from "./utils";

const SAMPLE_FPS = 5;
const MAX_SECONDS = 45;
const GRID_W = 16;
const GRID_H = 9;
const MODEL_FRAMES = 6;
const MODEL_FRAME_W = 384;

const loadVideo = (src: string) =>
  new Promise<HTMLVideoElement>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    v.src = src;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Namuna videoni o'qib bo'lmadi"));
  });

const seek = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });

const nearestAspect = (w: number, h: number): AspectRatio => {
  const r = w / h;
  let best: AspectRatio = "16:9";
  let dist = Infinity;
  for (const [id, a] of Object.entries(ASPECTS) as [AspectRatio, { width: number; height: number }][]) {
    const d = Math.abs(Math.log(r / (a.width / a.height)));
    if (d < dist) {
      dist = d;
      best = id;
    }
  }
  return best;
};

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Closest colour preset for the measured look. */
export const filterForLook = ({ brightness, saturation, contrast, warmth }: Pick<ReferenceStyle, "brightness" | "saturation" | "contrast" | "warmth">) => {
  if (saturation < 0.07) return contrast > 0.22 ? "bw-high" : "mono";
  if (brightness < 0.28) return warmth < -0.03 ? "night-blue" : "moody";
  if (saturation > 0.5) return warmth > 0.05 ? "sunset" : "vivid";
  if (warmth > 0.09) return saturation < 0.25 ? "vintage" : "golden";
  if (warmth > 0.04 && contrast > 0.18) return "teal-orange";
  if (warmth < -0.05) return "cool";
  if (contrast < 0.13 && brightness > 0.55) return "dreamy";
  if (contrast > 0.24) return "cinematic";
  return "clear";
};

export type AnalysisProgress = (fraction: number, label: string) => void;

export const analyzeReferenceVideo = async (asset: MediaAsset, onProgress?: AnalysisProgress): Promise<ReferenceStyle> => {
  if (!asset.src) throw new Error("Videoning manbasi yo'q");
  const video = await loadVideo(asset.src);
  const duration = Math.min(video.duration || 0, MAX_SECONDS);
  if (!duration) throw new Error("Video bo'sh");
  // Read now: the element is unloaded at the end, which resets its dimensions.
  const aspect = nearestAspect(video.videoWidth || 16, video.videoHeight || 9);

  const grid = document.createElement("canvas");
  grid.width = GRID_W;
  grid.height = GRID_H;
  const gctx = grid.getContext("2d", { willReadFrequently: true })!;

  const count = Math.max(2, Math.floor(duration * SAMPLE_FPS));
  const cells: Float32Array[] = [];
  const bright: number[] = [];
  let satSum = 0;
  let warmSum = 0;
  let lumaSq = 0;
  let lumaSum = 0;
  let px = 0;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();

  for (let i = 0; i < count; i++) {
    await seek(video, Math.min(duration - 0.01, i / SAMPLE_FPS));
    gctx.drawImage(video, 0, 0, GRID_W, GRID_H);
    const data = gctx.getImageData(0, 0, GRID_W, GRID_H).data;
    const frame = new Float32Array(GRID_W * GRID_H * 3);
    let fb = 0;
    for (let p = 0, c = 0; p < data.length; p += 4, c += 3) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      frame[c] = r / 255;
      frame[c + 1] = g / 255;
      frame[c + 2] = b / 255;
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      fb += l;
      lumaSum += l;
      lumaSq += l * l;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      satSum += max ? (max - min) / max : 0;
      warmSum += (r - b) / 255;
      px++;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bk.n++;
      bk.r += r;
      bk.g += g;
      bk.b += b;
      buckets.set(key, bk);
    }
    cells.push(frame);
    bright.push(fb / (GRID_W * GRID_H));
    if (i % 10 === 0) onProgress?.((i / count) * 0.85, "Kadrlar tahlil qilinmoqda…");
  }

  // ----- cuts -----
  const diff = cells.map((f, i) => {
    if (!i) return 0;
    const prev = cells[i - 1];
    let s = 0;
    for (let k = 0; k < f.length; k++) s += Math.abs(f[k] - prev[k]);
    return s / f.length;
  });
  const sorted = [...diff].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const hard = Math.max(0.1, median * 4);
  const soft = Math.max(0.035, median * 1.8);
  const minGap = 0.3 * SAMPLE_FPS;
  const cuts: { i: number; kind: ReferenceStyle["transitions"][number] }[] = [];
  const push = (i: number, kind: ReferenceStyle["transitions"][number]) => {
    const last = cuts[cuts.length - 1];
    if (last && i - last.i < minGap) {
      // Keep the more telling label for the same boundary (a dip beats a plain cut).
      if (kind !== "cut" && last.kind === "cut") last.kind = kind;
      return;
    }
    cuts.push({ i, kind });
  };
  for (let i = 1; i < count - 1; i++) {
    const b = bright[i];
    if (b < 0.05 && (bright[i - 1] > 0.12 || bright[i + 1] > 0.12)) push(i, "dip-black");
    else if (b > 0.93 && (bright[i - 1] < 0.8 || bright[i + 1] < 0.8)) push(i, "flash");
    else if (diff[i] > hard && diff[i] >= diff[i - 1] && diff[i] >= diff[i + 1]) push(i, "cut");
    else if (i > 1 && diff[i - 1] > soft && diff[i] > soft && diff[i + 1] > soft && diff[i - 1] + diff[i] + diff[i + 1] > hard * 1.4) push(i, "fade");
  }

  const bounds = [0, ...cuts.map((c) => c.i / SAMPLE_FPS), duration];
  const shots: number[] = [];
  const transitions: ReferenceStyle["transitions"] = [];
  for (let k = 1; k < bounds.length; k++) {
    const len = bounds[k] - bounds[k - 1];
    if (len < 0.25 && shots.length) {
      shots[shots.length - 1] += len;
      continue;
    }
    shots.push(len);
    if (k < bounds.length - 1) transitions.push(cuts[k - 1].kind);
  }
  transitions.length = Math.max(0, shots.length - 1);

  // ----- colour -----
  const meanL = lumaSum / px;
  const look = {
    brightness: round(meanL, 3),
    saturation: round(satSum / px, 3),
    contrast: round(Math.sqrt(Math.max(0, lumaSq / px - meanL * meanL)), 3),
    warmth: round(warmSum / px, 3),
  };
  const palette: string[] = [];
  for (const bk of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const c = [bk.r / bk.n, bk.g / bk.n, bk.b / bk.n];
    const h = hex(c[0], c[1], c[2]);
    const close = palette.some((p) => {
      const q = [1, 3, 5].map((o) => parseInt(p.slice(o, o + 2), 16));
      return Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) < 48;
    });
    if (!close) palette.push(h);
    if (palette.length >= 5) break;
  }

  // ----- frames for the vision model: the middle of evenly spread shots -----
  onProgress?.(0.88, "Namuna kadrlari tayyorlanmoqda…");
  const big = document.createElement("canvas");
  big.width = MODEL_FRAME_W;
  big.height = Math.round((MODEL_FRAME_W * video.videoHeight) / video.videoWidth) || 216;
  const bctx = big.getContext("2d")!;
  const mids = bounds.slice(0, -1).map((b, k) => (b + bounds[k + 1]) / 2);
  const pick = mids.length <= MODEL_FRAMES ? mids : Array.from({ length: MODEL_FRAMES }, (_, k) => mids[Math.floor(((k + 0.5) * mids.length) / MODEL_FRAMES)]);
  const frames: string[] = [];
  for (const t of pick) {
    await seek(video, t);
    bctx.drawImage(video, 0, 0, big.width, big.height);
    frames.push(big.toDataURL("image/jpeg", 0.7));
  }

  // ----- tempo -----
  let bpm: number | undefined;
  try {
    onProgress?.(0.95, "Musiqa ritmi o'lchanmoqda…");
    const buffer = await decodeAudio(asset.src);
    const info = detectBeats(buffer, 0, Math.min(buffer.duration, MAX_SECONDS));
    if (info.bpm && Number.isFinite(info.bpm)) bpm = Math.round(info.bpm);
  } catch {
    /* silent or no audio track */
  }
  video.removeAttribute("src");
  video.load();
  onProgress?.(1, "Tayyor");

  return {
    duration: round(duration, 2),
    aspect,
    shots: shots.map((s) => round(s, 2)),
    transitions,
    avgShot: round(duration / Math.max(1, shots.length), 2),
    palette,
    ...look,
    filter: filterForLook(look),
    bpm,
    frames,
  };
};

/** A small JPEG of an image or of a video's middle frame, for the vision model. */
export const frameForModel = async (asset: MediaAsset): Promise<string | null> => {
  if (!asset.src) return asset.thumbs?.[0] ?? null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (asset.kind === "image") {
    const img = new Image();
    img.src = asset.src;
    await img.decode().catch(() => null);
    if (!img.naturalWidth) return null;
    canvas.width = MODEL_FRAME_W;
    canvas.height = Math.round((MODEL_FRAME_W * img.naturalHeight) / img.naturalWidth);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }
  if (asset.kind === "video") {
    const video = await loadVideo(asset.src).catch(() => null);
    if (!video) return null;
    await seek(video, Math.min(video.duration / 2, 3));
    canvas.width = MODEL_FRAME_W;
    canvas.height = Math.round((MODEL_FRAME_W * video.videoHeight) / video.videoWidth) || 216;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }
  return null;
};

/** One-line summary the model reads next to the frames. */
export const describeReference = (s: ReferenceStyle) =>
  `REFERENCE STYLE (measured): ${s.duration}s, aspect ${s.aspect}, ${s.shots.length} shots, average shot ${s.avgShot}s ` +
  `(shortest ${Math.min(...s.shots)}s, longest ${Math.max(...s.shots)}s); transitions: ${summarizeTransitions(s.transitions)}; ` +
  `look: brightness ${s.brightness}, saturation ${s.saturation}, contrast ${s.contrast}, warmth ${s.warmth} → closest filter "${s.filter}"; ` +
  `palette ${s.palette.join(" ")}${s.bpm ? `; music ~${s.bpm} BPM` : ""}.`;

const summarizeTransitions = (t: ReferenceStyle["transitions"]) => {
  if (!t.length) return "single shot";
  const counts = t.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
  return Object.entries(counts)
    .map(([k, n]) => `${n}× ${k}`)
    .join(", ");
};
