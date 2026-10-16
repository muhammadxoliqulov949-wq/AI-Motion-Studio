/**
 * Ready-made project templates. They are built from the demo footage so they play instantly;
 * the user swaps in their own media with "Almashtirish" in the inspector.
 */
import { musicToAsset, pickMusic } from "./catalog/audio-library";
import { DEFAULT_TRACKS, makeEffectClip, makeMediaClip, makeStickerClip, makeTextClip, migrateProject, templatePatch } from "./ops";
import type { AspectRatio, Clip, MediaAsset, Project, TransitionId } from "./types";
import { round } from "./utils";

export interface ProjectTemplate {
  id: string;
  label: string;
  description: string;
  aspect: AspectRatio;
  emoji: string;
  build: (assets: MediaAsset[]) => { project: Project; assets: MediaAsset[] };
}

const base = (name: string, aspect: AspectRatio): Project => ({
  name,
  aspect,
  fps: 30,
  tracks: DEFAULT_TRACKS,
  clips: [],
  grade: { filter: "none", letterbox: false, vignette: false, grain: false },
  background: { type: "blur", color: "#000000", blur: 40 },
});

/** Lays demo scenes on V1 as shots of `len` seconds. */
const shots = (assets: MediaAsset[], ids: string[], len: number[], transition: TransitionId = "none", tDur = 0.4) => {
  const clips: Clip[] = [];
  let at = 0;
  ids.forEach((id, i) => {
    const asset = assets.find((a) => a.id === `asset_${id}`);
    if (!asset) return;
    const d = len[i % len.length];
    clips.push(
      makeMediaClip(asset, "V1", round(at, 3), {
        duration: d,
        in: round(Math.max(0, asset.duration / 2 - d / 2), 3),
        transitionIn: i ? transition : "none",
        transitionDuration: tDur,
        motion: i % 2 ? "punch-in" : "ken-burns",
      }),
    );
    at += d;
  });
  return { clips, end: at };
};

const music = (tags: string[], end: number, volume = 0.6) => {
  const t = pickMusic(tags, end);
  if (!t) return { clips: [] as Clip[], assets: [] as MediaAsset[] };
  const asset = musicToAsset(t);
  return { clips: [makeMediaClip(asset, "A1", 0, { duration: round(Math.min(asset.duration, end), 3), volume, fadeIn: 0.3, fadeOut: 1 })], assets: [asset] };
};

const text = (style: string, t: string, start: number, duration: number, extra: Partial<Parameters<typeof makeTextClip>[1]> = {}) =>
  makeTextClip(start, { ...templatePatch(style), text: t, duration, trackId: style.includes("caption") ? "T2" : "T1", ...extra });

const finish = (p: Project, clips: Clip[], assets: MediaAsset[]) => ({ project: migrateProject({ ...p, clips }), assets });

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "reels-intro",
    label: "Reels intro",
    description: "Tez kadrlar, flash, katta sarlavha va energik musiqa",
    aspect: "9:16",
    emoji: "⚡",
    build: (assets) => {
      const v = shots(assets, ["neon", "city", "product", "ocean", "mountains", "neon"], [1.4, 1.2, 1.6], "whip-pan", 0.3);
      const m = music(["electronic", "driving"], v.end, 0.7);
      return finish(base("Reels intro", "9:16"), [
        ...v.clips,
        ...m.clips,
        text("bold-impact", "YANGI VIDEO", 0.2, 2.4),
        text("tiktok-caption", "oxirigacha ko'ring", 3, 3),
        makeStickerClip(4.5, "emoji:fire", { x: 25, y: -28, scale: 0.7, duration: 2.5 }),
        makeEffectClip(0, "flash", { duration: 0.6 }),
        makeEffectClip(v.end - 2, "zoom-pulse", { duration: 2 }),
      ], m.assets);
    },
  },
  {
    id: "product-ad",
    label: "Mahsulot reklamasi",
    description: "Mahsulot yaqin plani, narx, obuna tugmasi",
    aspect: "4:5",
    emoji: "🛍️",
    build: (assets) => {
      const v = shots(assets, ["product", "neon", "product"], [3, 2.5, 3.5], "zoom-in", 0.5);
      const m = music(["pop", "bright", "uplifting"], v.end);
      return finish({ ...base("Mahsulot reklamasi", "4:5"), grade: { filter: "vivid", letterbox: false, vignette: true, grain: false } }, [
        ...v.clips,
        ...m.clips,
        text("elegant-serif", "Yangi kolleksiya", 0.3, 2.6),
        text("price-tag", "-30% CHEGIRMA", 3.2, 2.6),
        text("subscribe", "HOZIROQ BUYURTMA BERING", 6.2, 2.8),
        makeStickerClip(3.4, "emoji:sparkles", { x: -28, y: -30, scale: 0.6, duration: 2.4 }),
        makeEffectClip(5.5, "sparkles", { duration: 3.5 }),
      ], m.assets);
    },
  },
  {
    id: "travel-vlog",
    label: "Sayohat vlogi",
    description: "Kinematografik ranglar, silliq o'tishlar, kino titri",
    aspect: "16:9",
    emoji: "🏔️",
    build: (assets) => {
      const v = shots(assets, ["mountains", "ocean", "city", "neon"], [4, 3.5, 3.5, 3], "cross-zoom", 0.7);
      const m = music(["cinematic", "epic", "uplifting"], v.end);
      return finish({ ...base("Sayohat vlogi", "16:9"), grade: { filter: "golden", letterbox: true, vignette: true, grain: true } }, [
        ...v.clips,
        ...m.clips,
        text("cinema-title", "TOG'LAR ORTIDA", 0.5, 3.2),
        text("minimal-label", "Chimyon · 2026", 4.2, 3),
        makeEffectClip(0, "light-leak", { duration: 3 }),
      ], m.assets);
    },
  },
  {
    id: "birthday",
    label: "Tug'ilgan kun tabrigi",
    description: "Konfetti, oltin yozuv, bayram emojilari",
    aspect: "9:16",
    emoji: "🎂",
    build: (assets) => {
      const v = shots(assets, ["neon", "ocean", "city"], [3, 3, 3], "dip-white", 0.6);
      const m = music(["holiday", "funny", "bouncy"], v.end);
      return finish({ ...base("Tug'ilgan kun tabrigi", "9:16"), grade: { filter: "dreamy", letterbox: false, vignette: false, grain: false } }, [
        ...v.clips,
        ...m.clips,
        text("script-gold", "Tug'ilgan kuning bilan!", 0.4, 4),
        text("wave-fun", "Baxtli bo'l!", 5, 3.5),
        makeStickerClip(1, "emoji:birthday-cake", { y: 25, scale: 0.9, duration: 3.5 }),
        makeStickerClip(5.2, "emoji:party-popper", { x: -25, y: -25, scale: 0.7, duration: 3 }),
        makeEffectClip(0, "confetti", { duration: v.end, intensity: 0.8 }),
      ], m.assets);
    },
  },
  {
    id: "podcast-clip",
    label: "Podkast klip",
    description: "Gapiruvchi kadr, katta subtitrlar, ism yorlig'i",
    aspect: "9:16",
    emoji: "🎙️",
    build: (assets) => {
      const v = shots(assets, ["portrait"], [12]);
      const lines = ["BU G'OYA", "HAMMASINI O'ZGARTIRDI", "BIRINCHI QADAM", "ENG QIYINI EDI"];
      return finish(base("Podkast klip", "9:16"), [
        ...v.clips,
        ...lines.map((l, i) => text("hormozi-caption", l, round(1 + i * 2.6, 3), 2.5)),
        text("lower-third", "Mehmon ismi\nTadbirkor", 0.3, 4),
      ], []);
    },
  },
  {
    id: "news",
    label: "Yangiliklar",
    description: "Tezkor xabar plashkasi, shahar kadrlari",
    aspect: "16:9",
    emoji: "📰",
    build: (assets) => {
      const v = shots(assets, ["city", "neon", "city"], [4, 3, 4], "push-left", 0.5);
      const m = music(["driving", "intense"], v.end, 0.4);
      return finish({ ...base("Yangiliklar", "16:9"), grade: { filter: "clear", letterbox: false, vignette: false, grain: false } }, [
        ...v.clips,
        ...m.clips,
        text("breaking-news", "TEZKOR XABAR", 0.3, v.end - 0.6),
        text("soft-caption", "Toshkentda yangi metro bekati ochildi", 1.5, 5),
        makeEffectClip(0, "rec", { duration: v.end, intensity: 0.6 }),
      ], m.assets);
    },
  },
];

export const emptyProject = () => base("Yangi loyiha", "16:9");
