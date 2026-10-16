import { migrateProject } from "./ops";
import type { MediaAsset, Project } from "./types";

const STORAGE_KEY = "ams-editor-v2";

interface Saved {
  project: Project;
  assets: MediaAsset[];
  /** Uploaded / generated files kept in IndexedDB (see media-store.ts). */
  storedIds?: string[];
}

/** Assets that live as files in IndexedDB rather than as URLs. */
export const isStoredAsset = (a: MediaAsset) => a.origin === "upload" || a.origin === "voice";

/** Restores the last session; uploaded files are re-attached asynchronously from IndexedDB. */
export const loadSaved = (demo: MediaAsset[]): Saved | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    const assets = [...demo, ...saved.assets.filter((a) => !demo.some((d) => d.id === a.id))];
    const known = new Set([...assets.map((a) => a.id), "asset_music", ...(saved.storedIds ?? [])]);
    const clips = saved.project.clips.filter((c) => c.type !== "media" || known.has(c.assetId));
    return { project: migrateProject({ ...saved.project, clips }), assets };
  } catch {
    return null;
  }
};

export const clearSavedProject = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
};

/** Saves the project + URL-based library assets; files are stored separately in IndexedDB. */
export const saveProject = (project: Project, assets: MediaAsset[]) => {
  try {
    const keep = assets.filter((a) => a.origin === "music" || a.origin === "sfx" || a.origin === "stock");
    const storedIds = assets.filter(isStoredAsset).map((a) => a.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, assets: keep, storedIds }));
    return true;
  } catch {
    return false;
  }
};
