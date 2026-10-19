/**
 * Virtual camera moves for a still image ("rasmdan video", no AI video model needed): each preset is a
 * set of keyframes (x / y in % of the frame, scale, rotation) on an image clip in the editor's own
 * timeline, so the preview, the browser export and "open in the editor" all use the same project.
 *
 * A moving camera needs spare picture around the frame, so presets that pan or rotate start zoomed in
 * (`headroom`) and never move further than that headroom allows.
 */
import { EFFECTS } from "@/editor/catalog/effects";
import { FILTER_PRESETS } from "@/editor/catalog/filters";
import { applyOps } from "@/editor/edit-ops";
import { makeEffectClip, makeMediaClip, makeTextClip, DEFAULT_TRACKS, templatePatch } from "@/editor/ops";
import type { AspectRatio, Clip, Easing, Keyframes, MediaAsset, Project } from "@/editor/types";
import { round } from "@/editor/utils";

export interface CameraPreset {
  id: string;
  label: string;
  hint: string;
  /** Intensity-scaled keyframes for a clip of `d` seconds (k = 0.4 … 1.6, 1 = normal). */
  build: (d: number, k: number) => Keyframes;
}

type Pts = [number, number, Easing?][];
const track = (d: number, pts: Pts, easing: Easing = "ease") => pts.map(([f, value, e]) => ({ t: round(f * d, 3), value: round(value, 3), easing: e ?? easing }));

/** Seeded pseudo-random in [-1, 1] so a handheld move is the same every time it is built. */
const noise = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

/** Largest sideways shift (in % of the frame) that still stays inside an image scaled by `s`. */
const room = (s: number) => ((s - 1) / 2) * 100 * 0.92;

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: "push-in",
    label: "Yaqinlashish",
    hint: "Kamera sekin predmetga yaqinlashadi",
    build: (d, k) => ({ scale: track(d, [[0, 1], [1, 1 + 0.32 * k]]) }),
  },
  {
    id: "pull-out",
    label: "Uzoqlashish",
    hint: "Kadr kengayib, butun manzara ochiladi",
    build: (d, k) => ({ scale: track(d, [[0, 1 + 0.32 * k], [1, 1]]) }),
  },
  {
    id: "drift",
    label: "Sekin surilish",
    hint: "Ken Burns: sekin zoom va yengil siljish",
    build: (d, k) => ({ scale: track(d, [[0, 1.06], [1, 1.06 + 0.14 * k]]), x: track(d, [[0, 1.2 * k], [1, -1.2 * k]]) }),
  },
  {
    id: "crash-zoom",
    label: "Crash zoom",
    hint: "Kutilmaganda tez yaqinlashish",
    build: (d, k) => ({
      scale: track(d, [[0, 1, "hold"], [0.58, 1, "ease-in"], [0.7, 1 + 0.7 * k, "hold"], [1, 1 + 0.78 * k]]),
    }),
  },
  {
    id: "pan-left",
    label: "Chapga surish",
    hint: "Kamera chap tomonga siljiydi",
    build: (d, k) => {
      const s = 1 + 0.22 * k;
      return { scale: track(d, [[0, s], [1, s]], "linear"), x: track(d, [[0, -room(s)], [1, room(s)]]) };
    },
  },
  {
    id: "pan-right",
    label: "O'ngga surish",
    hint: "Kamera o'ng tomonga siljiydi",
    build: (d, k) => {
      const s = 1 + 0.22 * k;
      return { scale: track(d, [[0, s], [1, s]], "linear"), x: track(d, [[0, room(s)], [1, -room(s)]]) };
    },
  },
  {
    id: "tilt-up",
    label: "Tepaga ko'tarilish",
    hint: "Kamera pastdan tepaga qaraydi",
    build: (d, k) => {
      const s = 1 + 0.22 * k;
      return { scale: track(d, [[0, s], [1, s]], "linear"), y: track(d, [[0, -room(s)], [1, room(s)]]) };
    },
  },
  {
    id: "tilt-down",
    label: "Pastga tushish",
    hint: "Kamera tepadan pastga qaraydi",
    build: (d, k) => {
      const s = 1 + 0.22 * k;
      return { scale: track(d, [[0, s], [1, s]], "linear"), y: track(d, [[0, room(s)], [1, -room(s)]]) };
    },
  },
  {
    id: "drone",
    label: "Dron ko'tarilishi",
    hint: "Yuqoriga ko'tarilib uzoqlashish",
    build: (d, k) => {
      const s = 1 + 0.3 * k;
      // Both ends use the room of their own scale, so the shift always stays inside the picture.
      return { scale: track(d, [[0, s], [1, 1.04]]), y: track(d, [[0, -room(s) * 0.8], [1, room(1.04) * 0.8]]) };
    },
  },
  {
    id: "orbit-left",
    label: "Orbit ←",
    hint: "Predmet atrofida aylanib o'tish (taxminiy)",
    build: (d, k) => {
      const s = 1 + 0.3 * k;
      return {
        scale: track(d, [[0, s], [0.5, s - 0.04], [1, s]]),
        x: track(d, [[0, -room(s) * 0.85], [1, room(s) * 0.85]]),
        rotation: track(d, [[0, -1.6 * k], [1, 1.6 * k]]),
      };
    },
  },
  {
    id: "orbit-right",
    label: "Orbit →",
    hint: "Teskari yo'nalishda aylanib o'tish (taxminiy)",
    build: (d, k) => {
      const s = 1 + 0.3 * k;
      return {
        scale: track(d, [[0, s], [0.5, s - 0.04], [1, s]]),
        x: track(d, [[0, room(s) * 0.85], [1, -room(s) * 0.85]]),
        rotation: track(d, [[0, 1.6 * k], [1, -1.6 * k]]),
      };
    },
  },
  {
    id: "handheld",
    label: "Qo'lda suratga olish",
    hint: "Jonli, titroq hujjatli kadr",
    build: (d, k) => {
      const n = Math.max(3, Math.round(d / 0.14));
      const s = 1.08 + 0.02 * k;
      const pts = (salt: number, amp: number) => Array.from({ length: n + 1 }, (_, i) => ({ t: round((i / n) * d, 3), value: round(noise(i, salt) * amp * k, 3), easing: "ease" as Easing }));
      return { scale: track(d, [[0, s], [1, s]], "linear"), x: pts(1, 0.55), y: pts(2, 0.45), rotation: pts(3, 0.35) };
    },
  },
  {
    id: "roll",
    label: "Burilish (Dutch roll)",
    hint: "Kadr yon tomonga burilib ketadi",
    build: (d, k) => ({ scale: track(d, [[0, 1.3 + 0.1 * k], [1, 1.3 + 0.1 * k]], "linear"), rotation: track(d, [[0, 0], [1, 7 * k]]) }),
  },
  {
    id: "spiral",
    label: "Spiral zoom",
    hint: "Aylanib kirib borish",
    build: (d, k) => ({ scale: track(d, [[0, 1.2], [1, 1.2 + 0.5 * k]]), rotation: track(d, [[0, 0], [1, 9 * k]]) }),
  },
  {
    id: "pulse",
    label: "Ritm zarbi",
    hint: "Musiqa ritmiga mos pulsatsiya",
    build: (d, k) => {
      const beats = Math.max(2, Math.round(d / 0.5));
      const pts: Pts = [];
      for (let i = 0; i <= beats; i++) pts.push([i / beats, 1.02 + (i % 2 ? 0 : 0.07 * k), i % 2 ? "ease-out" : "ease-in"]);
      return { scale: track(d, pts) };
    },
  },
];

export const cameraById = (id: string) => CAMERA_PRESETS.find((c) => c.id === id) ?? CAMERA_PRESETS[0];

// ---------- Look: effects and colour ----------

/** Effects offered as "Effekt" chips (ids that exist in the editor catalogue). */
export const FX_CHOICES: [string, string][] = (
  [
    ["zoom-pulse", "Ritm zoom"],
    ["handheld", "Titroq kamera"],
    ["flash", "Chaqnash"],
    ["glitch", "Glitch"],
    ["rgb-split", "RGB ajralish"],
    ["vhs", "VHS"],
    ["old-film", "Eski kino"],
    ["snow", "Qor"],
    ["rain", "Yomg'ir"],
    ["confetti", "Konfetti"],
    ["hearts", "Yuraklar"],
  ] as [string, string][]
).filter(([id]) => id in EFFECTS);

/** Colour looks offered as "Ranglar" chips. */
export const LOOK_CHOICES: [string, string][] = (
  [
    ["none", "Asl"],
    ["cinematic", "Kino"],
    ["teal-orange", "Teal-orange"],
    ["vivid", "Yorqin"],
    ["warm", "Iliq"],
    ["cool", "Sovuq"],
    ["vintage", "Vintaj"],
    ["noir", "Noir"],
    ["cyberpunk", "Cyberpunk"],
    ["dreamy", "Orzuli"],
  ] as [string, string][]
).filter(([id]) => id === "none" || id in FILTER_PRESETS);

// ---------- Project ----------

export interface CameraProjectOptions {
  asset: MediaAsset;
  aspect: AspectRatio;
  duration: number;
  camera: string;
  intensity: number;
  effect: string | null;
  look: string;
  caption: string;
  music: boolean;
  name?: string;
}

/** An editor project: the image on the main track with the camera move, an optional effect, look, caption and music. */
export const buildCameraProject = (o: CameraProjectOptions): { project: Project; assets: MediaAsset[] } => {
  const d = Math.max(1, o.duration);
  const clip = makeMediaClip(o.asset, "V1", 0, {
    duration: d,
    fit: "cover",
    filter: o.look,
    keyframes: cameraById(o.camera).build(d, o.intensity),
    // Mid-move fade-in keeps the first frame from popping.
    transitionIn: "none",
  });
  const clips: Clip[] = [clip];
  if (o.effect && o.effect in EFFECTS) clips.push(makeEffectClip(0, o.effect, { duration: d, intensity: 0.7 }));
  if (o.caption.trim()) {
    clips.push(makeTextClip(0.2, { ...templatePatch("tiktok-caption"), trackId: "T2", text: o.caption.trim().slice(0, 80), duration: Math.max(1, d - 0.4) }));
  }
  let project: Project = {
    name: o.name?.trim().slice(0, 60) || "AI Studio video",
    aspect: o.aspect,
    fps: 30,
    tracks: DEFAULT_TRACKS,
    clips,
    grade: { filter: "none", letterbox: false, vignette: o.camera === "pulse" ? false : true, grain: false },
    background: { type: "blur", color: "#000000", blur: 40 },
  };
  let assets = [o.asset];
  if (o.music) {
    const r = applyOps(project, assets, [{ op: "add_library_music", tags: ["cinematic", "uplifting"], trackId: null, volume: 0.55 }]);
    project = r.project;
    assets = [...assets, ...r.newAssets];
  }
  return { project, assets };
};
