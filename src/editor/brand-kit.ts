"use client";

/**
 * Brand kit: logo, colours and font saved once (in this browser) and applied to videos — to a
 * freshly generated script video automatically, or to any project with "Brendni qo'llash".
 */
import { useSyncExternalStore } from "react";
import { makeMediaClip, migrateProject } from "./ops";
import { ASPECTS } from "./presets";
import type { Clip, MediaAsset, Project, TextClip } from "./types";
import { projectDuration, round } from "./utils";

export type LogoCorner = "tl" | "tr" | "bl" | "br";

export interface BrandKit {
  name: string;
  /** PNG data URL (downscaled to ≤ 512 px, transparency kept). */
  logo?: string;
  logoAspect?: number;
  showLogo: boolean;
  logoCorner: LogoCorner;
  /** Logo height as a share of the frame (0.08–0.4). */
  logoSize: number;
  logoOpacity: number;
  primary: string;
  accent: string;
  font: string;
}

export const DEFAULT_BRAND: BrandKit = {
  name: "",
  showLogo: true,
  logoCorner: "tr",
  logoSize: 0.16,
  logoOpacity: 1,
  primary: "#8b5cf6",
  accent: "#facc15",
  font: "Montserrat",
};

const KEY = "ams-brand-kit";
const EVENT = "ams-brand-kit-change";

let cache: { raw: string | null; kit: BrandKit | null } = { raw: null, kit: null };

/** The saved kit, or null when the user never set one up. */
export const loadBrandKit = (): BrandKit | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cache.raw) return cache.kit;
    cache = { raw, kit: raw ? { ...DEFAULT_BRAND, ...(JSON.parse(raw) as Partial<BrandKit>) } : null };
    return cache.kit;
  } catch {
    return null;
  }
};

export const saveBrandKit = (kit: BrandKit | null) => {
  try {
    if (kit) localStorage.setItem(KEY, JSON.stringify(kit));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: the kit then only lives for this session */
  }
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export const useBrandKit = () => useSyncExternalStore(subscribe, loadBrandKit, () => null);

/** Reads a logo file and returns a ≤ 512 px PNG data URL (transparency kept) with its aspect ratio. */
export const prepareLogo = async (file: File): Promise<{ logo: string; aspect: number }> => {
  if (!file.type.startsWith("image/")) throw new Error("Logo rasm bo'lishi kerak (PNG, JPG, SVG, WebP)");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("Rasmni o'qib bo'lmadi");
    });
    const w0 = img.naturalWidth || 512;
    const h0 = img.naturalHeight || 512;
    const k = Math.min(1, 512 / Math.max(w0, h0));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w0 * k));
    canvas.height = Math.max(1, Math.round(h0 * k));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { logo: canvas.toDataURL("image/png"), aspect: canvas.width / canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const luminance = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Stable asset id per logo image, so replacing the logo adds a new asset instead of keeping the old one. */
const logoId = (logo: string) => {
  let h = 0;
  for (let i = 0; i < logo.length; i += 97) h = (h * 31 + logo.charCodeAt(i)) | 0;
  return `asset_brandlogo_${(h >>> 0).toString(36)}`;
};

export const logoAsset = (kit: BrandKit): MediaAsset | null =>
  kit.logo
    ? {
        id: logoId(kit.logo),
        name: `Logo${kit.name ? ` — ${kit.name}` : ""}`,
        kind: "image",
        duration: 4,
        src: kit.logo,
        thumbs: [kit.logo],
        gradient: "linear-gradient(135deg,#1e1b4b,#6d28d9)",
        origin: "upload",
        width: kit.logoAspect && kit.logoAspect >= 1 ? 512 : Math.round(512 * (kit.logoAspect ?? 1)),
        height: kit.logoAspect && kit.logoAspect < 1 ? 512 : Math.round(512 / (kit.logoAspect ?? 1)),
      }
    : null;

const isBrandLogo = (c: Clip) => c.type === "media" && c.assetId.startsWith("asset_brandlogo");

export interface BrandApplyResult {
  project: Project;
  /** The logo asset to add to the editor (not yet in `assets`). */
  newAssets: MediaAsset[];
  changes: string[];
}

/**
 * Applies the kit: brand font on every text, accent colour on captions' highlight, primary colour on
 * titles (as the text colour when it is light enough, otherwise as a box behind white text) and the
 * logo as a corner overlay for the whole video. Re-applying replaces the previous logo.
 */
export const applyBrandKit = (project: Project, assets: MediaAsset[], kit: BrandKit): BrandApplyResult => {
  const changes: string[] = [];
  let p = migrateProject(project);
  const texts = p.clips.filter((c): c is TextClip => c.type === "text");
  if (texts.length) {
    const light = luminance(kit.primary) > 0.4;
    p = {
      ...p,
      clips: p.clips.map((c) => {
        if (c.type !== "text") return c;
        if (c.trackId === "T2") return { ...c, font: kit.font, highlightColor: kit.accent } as Clip;
        return {
          ...c,
          font: kit.font,
          ...(light ? { color: kit.primary } : { color: "#ffffff", bgColor: kit.primary, bgOpacity: 0.92 }),
        } as Clip;
      }),
    };
    changes.push(`${kit.font} shrifti va brend ranglari ${texts.length} ta matnga qo'llandi`);
  }

  const asset = kit.showLogo ? logoAsset(kit) : null;
  p = { ...p, clips: p.clips.filter((c) => !isBrandLogo(c)) };
  const newAssets: MediaAsset[] = [];
  const total = projectDuration(p);
  if (asset && total > 0) {
    if (!assets.some((a) => a.id === asset.id)) newAssets.push(asset);
    const { width: W, height: H } = ASPECTS[p.aspect];
    const a = kit.logoAspect ?? 1;
    const s = kit.logoSize;
    // `contain` fit inside a box of s × frame: the drawn logo is the smaller of the two fits.
    const wImg = Math.min(s * W, s * H * a);
    const hImg = wImg / a;
    const margin = 0.035 * Math.min(W, H);
    const dx = (W / 2 - margin - wImg / 2) / W * 100;
    const dy = (H / 2 - margin - hImg / 2) / H * 100;
    const x = kit.logoCorner.endsWith("l") ? -dx : dx;
    const y = kit.logoCorner.startsWith("t") ? -dy : dy;
    const clip = makeMediaClip(asset, "V2", 0, {
      duration: round(total, 3),
      fit: "contain",
      scale: s,
      x: round(x, 2),
      y: round(y, 2),
      opacity: kit.logoOpacity,
      volume: 0,
    });
    // The overlay track ("V2") may already hold clips; put the logo on its own overlay track then.
    const busy = p.clips.some((c) => c.trackId === "V2");
    let tracks = p.tracks;
    let trackId = "V2";
    if (busy) {
      let n = 3;
      while (tracks.some((t) => t.id === `V${n}`)) n++;
      trackId = `V${n}`;
      tracks = [...tracks, { id: trackId, kind: "overlay", name: "Logo", muted: true, hidden: false, locked: false }];
    }
    p = { ...p, tracks, clips: [...p.clips, { ...clip, trackId } as Clip] };
    changes.push(`Logo ${kit.logoCorner === "tl" ? "yuqori chap" : kit.logoCorner === "tr" ? "yuqori o'ng" : kit.logoCorner === "bl" ? "pastki chap" : "pastki o'ng"} burchakka qo'yildi`);
  }
  return { project: p, newAssets, changes };
};
