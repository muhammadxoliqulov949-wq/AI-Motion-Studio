import { migrateProject } from "./ops";
import type { MediaAsset, Project } from "./types";

const STORAGE_KEY = "ams-editor-v2";

interface Saved {
  project: Project;
  assets: MediaAsset[];
}

/** Restores the last session (library + demo media only; uploads live in object URLs and can't survive a reload). */
export const loadSaved = (demo: MediaAsset[]): Saved | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    const assets = [...demo, ...saved.assets.filter((a) => !demo.some((d) => d.id === a.id))];
    const known = new Set([...assets.map((a) => a.id), "asset_music"]);
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


/** Saves the project + library assets (object URLs from uploads are not persisted). */
export const saveProject = (project: Project, assets: MediaAsset[]) => {
  try {
    const keep = assets.filter((a) => a.origin === "music" || a.origin === "sfx");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, assets: keep }));
    return true;
  } catch {
    return false;
  }
};
