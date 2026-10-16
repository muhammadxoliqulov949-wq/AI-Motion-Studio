import type { MontageAspect, SceneFootage } from "../types";

interface PexelsVideoFile {
  link: string;
  width: number | null;
  height: number | null;
  file_type: string;
  quality: string | null;
}

interface PexelsVideo {
  url: string;
  duration: number;
  width: number;
  height: number;
  user: { name: string };
  video_files: PexelsVideoFile[];
}

const SEARCH_URL = "https://api.pexels.com/videos/search";
const TIMEOUT_MS = 8000;

/** Pick a rendition close to the target size: big enough to look sharp, small enough to stream. */
const pickFile = (video: PexelsVideo) => {
  const target = 1920; // long edge of the rendition we want
  const mp4 = video.video_files.filter((f) => f.file_type === "video/mp4" && f.width && f.height);
  const scored = mp4
    .map((f) => ({ f, longEdge: Math.max(f.width!, f.height!) }))
    .sort((a, b) => Math.abs(a.longEdge - target) - Math.abs(b.longEdge - target));
  return scored[0]?.f ?? null;
};

/**
 * Finds one stock clip per query. Returns null instead of throwing so a single
 * failed search never breaks the whole montage (the scene falls back to a gradient).
 */
export async function findFootage(
  query: string,
  aspect: MontageAspect,
  apiKey: string,
  exclude: Set<string>,
): Promise<SceneFootage | null> {
  const params = new URLSearchParams({
    query,
    orientation: aspect === "9:16" ? "portrait" : "landscape",
    size: "medium",
    per_page: "8",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`Pexels search failed (${res.status}) for "${query}"`);
      return null;
    }
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    // Prefer clips we have not used yet so consecutive scenes don't repeat.
    const videos = (data.videos ?? []).filter((v) => v.duration >= 3);
    const video = videos.find((v) => !exclude.has(v.url)) ?? videos[0];
    if (!video) return null;
    const file = pickFile(video);
    if (!file) return null;
    exclude.add(video.url);
    return {
      url: file.link,
      width: file.width!,
      height: file.height!,
      duration: video.duration,
      author: video.user.name,
      pexelsUrl: video.url,
    };
  } catch (err) {
    console.warn(`Pexels search error for "${query}":`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface PixabayFile {
  url: string;
  width: number;
  height: number;
}

interface PixabayVideo {
  pageURL: string;
  duration: number;
  user: string;
  videos: Partial<Record<"large" | "medium" | "small" | "tiny", PixabayFile>>;
}

/** Same contract as findFootage, backed by Pixabay (PIXABAY_API_KEY). */
export async function findPixabayFootage(
  query: string,
  aspect: MontageAspect,
  apiKey: string,
  exclude: Set<string>,
): Promise<SceneFootage | null> {
  const params = new URLSearchParams({ key: apiKey, q: query.slice(0, 100), per_page: "12", safesearch: "true" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://pixabay.com/api/videos/?${params}`, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      console.warn(`Pixabay search failed (${res.status}) for "${query}"`);
      return null;
    }
    const data = (await res.json()) as { hits?: PixabayVideo[] };
    const portrait = aspect === "9:16";
    const pick = (v: PixabayVideo) => {
      const files = (["large", "medium", "small"] as const).map((k) => v.videos[k]).filter((f): f is PixabayFile => !!f?.url);
      return files.find((f) => Math.max(f.width, f.height) <= 1920) ?? files[files.length - 1] ?? null;
    };
    // Prefer clips matching the frame shape, then ones not used yet.
    const videos = (data.hits ?? [])
      .filter((v) => v.duration >= 3 && pick(v))
      .sort((a, b) => {
        const fa = pick(a)!;
        const fb = pick(b)!;
        return Number(portrait ? fb.height > fb.width : fb.width >= fb.height) - Number(portrait ? fa.height > fa.width : fa.width >= fa.height);
      });
    const video = videos.find((v) => !exclude.has(v.pageURL)) ?? videos[0];
    if (!video) return null;
    const file = pick(video)!;
    exclude.add(video.pageURL);
    return { url: file.url, width: file.width, height: file.height, duration: video.duration, author: video.user, pexelsUrl: video.pageURL };
  } catch (err) {
    console.warn(`Pixabay search error for "${query}":`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
