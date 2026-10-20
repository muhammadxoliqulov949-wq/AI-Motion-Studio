"use client";

/** Rendering and hand-off of studio projects: MP4 in the browser, or into the full editor. */
import { TimelineComposition } from "@/editor/composition/TimelineComposition";
import { saveMedia } from "@/editor/media-store";
import { DEFAULT_TRACKS, makeMediaClip } from "@/editor/ops";
import { saveProject } from "@/editor/persist";
import { ASPECTS } from "@/editor/presets";
import type { AspectRatio, MediaAsset, Project } from "@/editor/types";
import { projectDuration, uid } from "@/editor/utils";

/** Renders the project to an MP4 (H.264) in the browser with WebCodecs. `shortSide` = 720 or 1080. */
export const renderToMp4 = async (project: Project, assets: MediaAsset[], shortSide: number, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<Blob> => {
  const { renderMediaOnWeb, canRenderMediaOnWeb } = await import("@remotion/web-renderer");
  const { width, height } = ASPECTS[project.aspect];
  const scale = shortSide / Math.min(width, height);
  const check = await canRenderMediaOnWeb({ container: "mp4", videoCodec: "h264", width, height, scale, videoBitrate: "high" });
  const fatal = check.issues.find((i) => i.severity === "error");
  if (!check.canRender && fatal) throw new Error(fatal.message);
  const props = { project, assets };
  const result = await renderMediaOnWeb({
    composition: { component: TimelineComposition, id: "studio", width, height, fps: project.fps, durationInFrames: Math.max(1, Math.ceil(projectDuration(project) * project.fps)), defaultProps: props },
    inputProps: props,
    container: "mp4",
    videoCodec: "h264",
    videoBitrate: "high",
    scale,
    signal,
    onProgress: (p) => onProgress(Math.min(0.99, p.progress)),
    delayRenderTimeoutInMilliseconds: 60000,
  });
  return result.getBlob();
};

/**
 * Saves the project (and the picture it uses) the way the editor reloads its last session, so
 * opening /editor continues with it. `blobs` maps asset ids of uploaded files to their data.
 */
export const stageForEditor = async (project: Project, assets: MediaAsset[], blobs: Record<string, Blob>) => {
  for (const a of assets) {
    const blob = blobs[a.id];
    if (blob) await saveMedia({ ...a, origin: "upload" }, blob);
  }
  const ok = saveProject(
    project,
    assets.map((a) => (blobs[a.id] ? { ...a, origin: "upload" as const } : a)),
  );
  if (!ok) throw new Error("Loyihani saqlab bo'lmadi (brauzer xotirasi to'la bo'lishi mumkin).");
};

export const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const nearestAspect = (w: number, h: number): AspectRatio => {
  const r = w / h;
  let best: AspectRatio = "9:16";
  let dist = Infinity;
  for (const id of ["9:16", "16:9", "1:1", "4:5"] as AspectRatio[]) {
    const a = ASPECTS[id];
    const d = Math.abs(Math.log(r / (a.width / a.height)));
    if (d < dist) {
      dist = d;
      best = id;
    }
  }
  return best;
};

/** Reads duration and size of a video blob. */
const videoMeta = (blob: Blob) =>
  new Promise<{ duration: number; width: number; height: number; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => resolve({ duration: v.duration || 5, width: v.videoWidth, height: v.videoHeight, url });
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Videoni o'qib bo'lmadi"));
    };
    v.src = url;
  });

/** Puts a generated video on the main track of a fresh editor project and stages it for /editor. */
export const stageVideoForEditor = async (blob: Blob, name: string) => {
  const meta = await videoMeta(blob);
  const asset: MediaAsset = {
    id: uid("asset"),
    name: name.slice(0, 40) || "AI video",
    kind: "video",
    duration: meta.duration,
    src: meta.url,
    gradient: "linear-gradient(135deg,#312e81,#6366f1)",
    width: meta.width,
    height: meta.height,
    origin: "upload",
  };
  const project: Project = {
    name: asset.name,
    aspect: nearestAspect(meta.width || 9, meta.height || 16),
    fps: 30,
    tracks: DEFAULT_TRACKS,
    clips: [makeMediaClip(asset, "V1", 0, { duration: meta.duration, fit: "cover", volume: 1 })],
    grade: { filter: "none", letterbox: false, vignette: false, grain: false },
    background: { type: "blur", color: "#000000", blur: 40 },
  };
  await stageForEditor(project, [asset], { [asset.id]: blob });
};
