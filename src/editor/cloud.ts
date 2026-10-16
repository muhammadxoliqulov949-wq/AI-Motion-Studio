/**
 * Cloud projects on Supabase: auth session, project rows (jsonb) and private media files.
 * See supabase/migrations for the schema and storage policies.
 */
import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabase, supabaseEnabled } from "@/lib/supabase";
import { migrateProject } from "./ops";
import type { MediaAsset, Project } from "./types";
import { projectDuration, round } from "./utils";

export { supabaseEnabled };

const BUCKET = "media";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

export interface CloudProjectRow {
  id: string;
  name: string;
  aspect: string;
  duration: number;
  updated_at: string;
}

/** Current Supabase user (null when signed out or Supabase is not configured). */
export const useCloudUser = () => {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabaseEnabled);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, session: Session | null) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, ready };
};

export const accessToken = async () => (await getSupabase()?.auth.getSession())?.data.session?.access_token ?? null;

export const signInWithEmail = async (email: string) => {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase sozlanmagan");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/editor` } });
  if (error) throw error;
};

export const signInWithGoogle = async () => {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase sozlanmagan");
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/editor` } });
  if (error) throw error;
};

export const signOut = async () => {
  await getSupabase()?.auth.signOut();
};

const isFileAsset = (a: MediaAsset) => a.origin === "upload" || a.origin === "voice";
/** Stock clips are copied into the user's storage too: Pixabay does not allow permanent hotlinking. */
const shouldStore = (a: MediaAsset) => isFileAsset(a) || a.origin === "stock";

/** Uploads local files (uploads / voiceovers) that are not in storage yet; returns updated assets. */
export const ensureUploaded = async (assets: MediaAsset[], userId: string, onProgress?: (done: number, total: number) => void) => {
  const sb = getSupabase();
  if (!sb) return assets;
  const pending = assets.filter((a) => shouldStore(a) && !a.storagePath && a.src);
  let done = 0;
  const updated = new Map<string, MediaAsset>();
  for (const a of pending) {
    const res = await fetch(a.src!);
    if (!res.ok) continue;
    const blob = await res.blob();
    const ext = (a.origin === "stock" ? (a.kind === "image" ? "jpg" : "mp4") : a.name.split(".").pop() ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 5) || (a.kind === "audio" ? "mp3" : "mp4");
    const path = `${userId}/${a.id}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || undefined });
    if (error) throw error;
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    updated.set(a.id, { ...a, storagePath: path, src: signed?.signedUrl ?? a.src });
    onProgress?.(++done, pending.length);
  }
  return assets.map((a) => updated.get(a.id) ?? a);
};

/** Assets worth saving with a project (demo assets are rebuilt in code). */
const serializableAssets = (project: Project, assets: MediaAsset[]) => {
  const used = new Set(project.clips.map((c) => (c.type === "media" ? c.assetId : "")));
  return assets
    .filter((a) => !a.scene && a.id !== "asset_music" && (used.has(a.id) || isFileAsset(a) || a.origin === "stock"))
    .filter((a) => !isFileAsset(a) || a.storagePath)
    .map((a) => (a.storagePath ? { ...a, src: undefined } : a));
};

export const saveCloudProject = async (id: string | null, project: Project, assets: MediaAsset[]) => {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase sozlanmagan");
  const row = {
    name: project.name,
    aspect: project.aspect,
    duration: round(projectDuration(project), 2),
    data: { version: 2, project, assets: serializableAssets(project, assets) },
  };
  if (id) {
    const { error } = await sb.from("projects").update(row).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await sb.from("projects").insert(row).select("id").single();
  if (error) throw error;
  return data.id as string;
};

export const listCloudProjects = async (): Promise<CloudProjectRow[]> => {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("projects").select("id,name,aspect,duration,updated_at").order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data as CloudProjectRow[];
};

export const deleteCloudProject = async (id: string) => {
  const { error } = (await getSupabase()?.from("projects").delete().eq("id", id)) ?? { error: null };
  if (error) throw error;
};

/** Loads a project and gives its stored files fresh signed URLs. */
export const loadCloudProject = async (id: string) => {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase sozlanmagan");
  const { data, error } = await sb.from("projects").select("data").eq("id", id).single();
  if (error) throw error;
  const saved = data.data as { project: Project; assets: MediaAsset[] };
  const paths = saved.assets.filter((a) => a.storagePath).map((a) => a.storagePath!);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const assets = saved.assets.map((a) => (a.storagePath ? { ...a, src: urls.get(a.storagePath) } : a)).filter((a) => a.src || a.scene);
  return { project: migrateProject(saved.project), assets };
};
