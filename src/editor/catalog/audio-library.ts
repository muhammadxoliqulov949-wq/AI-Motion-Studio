/**
 * Music + sound-effect libraries. Every entry records its source and license:
 * - Music: Kevin MacLeod (incompetech.com), CC BY 4.0 — commercial use OK with attribution.
 * - SFX: Kenney.nl (CC0), Wikimedia Commons (public domain / CC0 / CC BY) and sounds
 *   synthesised by scripts/build-sfx-synth.mjs (CC0).
 */
import { fakePeaks } from "../sample-media";
import type { MediaAsset } from "../types";
import musicData from "./music.json";
import sfxData from "./sfx.json";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  moods: string[];
  bpm: number | null;
  duration: number;
  instruments: string;
  file: string;
}

export interface SfxItem {
  id: string;
  title: string;
  category: string;
  tags: string[];
  duration: number;
  file: string;
  source: string;
  sourceUrl: string;
  license: string;
  author: string;
}

export const MUSIC: MusicTrack[] = musicData as MusicTrack[];
export const SFX: SfxItem[] = sfxData as SfxItem[];

export const MUSIC_LICENSE = "CC BY 4.0";
/** Original location of the track (incompetech.com). */
export const musicSourceUrl = (t: MusicTrack) => `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(t.file)}`;
/** Same-origin proxy (src/app/api/music) so the browser can decode it for waveforms and in-browser export. */
export const musicUrl = (t: MusicTrack) => `/api/music/${encodeURIComponent(t.file)}`;
export const musicCredit = (t: MusicTrack) =>
  `"${t.title}" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/`;

export const GENRES: Record<string, string> = {
  cinematic: "Kino / Epik",
  electronic: "Elektron",
  chill: "Chill / Lo-fi",
  pop: "Pop",
  rock: "Rok",
  jazz: "Jaz",
  funk: "Fank",
  world: "Etno / Dunyo",
  classical: "Klassika",
  horror: "Qo'rqinchli",
  latin: "Lotin",
  disco: "Disko",
  modern: "Zamonaviy",
  blues: "Blyuz",
  reggae: "Regga",
  ragtime: "Regtaym",
  polka: "Polka",
  holiday: "Bayram",
  sting: "Qisqa jingl",
  mixed: "Turli",
};

export const MOODS: Record<string, string> = {
  bright: "Yorqin",
  uplifting: "Ko'tarinki",
  relaxed: "Xotirjam",
  calm: "Tinch",
  epic: "Epik",
  action: "Ekshn",
  dark: "Qorong'u",
  mysterious: "Sirli",
  mystical: "Mistik",
  funny: "Kulgili",
  groovy: "Groove",
  driving: "Shiddatli",
  bouncy: "Sakrovchi",
  intense: "Keskin",
  suspense: "Taranglik",
  sad: "G'amgin",
  eerie: "Vahimali",
  tense: "Asabiy",
  aggressive: "Agressiv",
};

export const SFX_CATEGORIES: Record<string, string> = {
  transition: "O'tish / Whoosh",
  cinematic: "Kino",
  impact: "Zarba",
  pop: "Pop",
  notify: "Bildirishnoma",
  ui: "Klik / UI",
  funny: "Kulgili",
  glitch: "Glitch",
  foley: "Kundalik",
  human: "Odamlar",
  ambience: "Muhit",
  drum: "Baraban",
  jingle: "Jingl",
  game: "O'yin",
  scifi: "Sci-fi",
  money: "Pul",
  voice: "Ovoz",
};

const GENRE_GRADIENTS: Record<string, string> = {
  cinematic: "linear-gradient(135deg,#1e1b4b,#7c3aed)",
  electronic: "linear-gradient(135deg,#0e7490,#a855f7)",
  chill: "linear-gradient(135deg,#065f46,#5eead4)",
  pop: "linear-gradient(135deg,#be185d,#fb7185)",
  rock: "linear-gradient(135deg,#450a0a,#ef4444)",
  jazz: "linear-gradient(135deg,#713f12,#f59e0b)",
  funk: "linear-gradient(135deg,#9d174d,#f97316)",
  horror: "linear-gradient(135deg,#020617,#7f1d1d)",
};

export const genreGradient = (genre: string) => GENRE_GRADIENTS[genre] ?? "linear-gradient(135deg,#065f46,#34d399)";

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const musicToAsset = (t: MusicTrack): MediaAsset => ({
  id: `lib_${t.id}`,
  name: `${t.title} — ${t.artist}`,
  kind: "audio",
  duration: t.duration,
  src: musicUrl(t),
  gradient: genreGradient(t.genre),
  peaks: fakePeaks(400, hash(t.id) % 1000),
  origin: "music",
  libraryId: t.id,
  credit: musicCredit(t),
  license: MUSIC_LICENSE,
});

export const sfxToAsset = (s: SfxItem): MediaAsset => ({
  id: `lib_${s.id}`,
  name: s.title,
  kind: "audio",
  duration: s.duration,
  src: s.file,
  gradient: "linear-gradient(135deg,#0c4a6e,#38bdf8)",
  peaks: fakePeaks(120, hash(s.id) % 1000),
  origin: "sfx",
  libraryId: s.id,
  credit: s.license.startsWith("CC BY") ? `"${s.title}" — ${s.author} (${s.source}), ${s.license}` : undefined,
  license: s.license,
});

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ’‘`]/g, "'");

export const searchMusic = (query: string, genre: string | null, mood: string | null) => {
  const q = norm(query.trim());
  return MUSIC.filter(
    (t) =>
      (!genre || t.genre === genre) &&
      (!mood || t.moods.includes(mood)) &&
      (!q ||
        norm(`${t.title} ${t.instruments} ${t.genre} ${GENRES[t.genre] ?? ""} ${t.moods.map((m) => `${m} ${MOODS[m] ?? ""}`).join(" ")}`).includes(q)),
  );
};

export const searchSfx = (query: string, category: string | null) => {
  const q = norm(query.trim());
  return SFX.filter(
    (s) => (!category || s.category === category) && (!q || norm(`${s.title} ${s.tags.join(" ")} ${s.category} ${SFX_CATEGORIES[s.category] ?? ""}`).includes(q)),
  );
};

/** Picks the best music track for a set of tags (genre, moods, words). Used by the AI agent. */
export const pickMusic = (tags: string[], minDuration = 0, exclude: string[] = []) => {
  const want = tags.map(norm);
  let best: MusicTrack | null = null;
  let bestScore = -1;
  for (const t of MUSIC) {
    if (exclude.includes(t.id) || t.genre === "sting") continue;
    let score = 0;
    for (const w of want) {
      if (t.genre === w || norm(GENRES[t.genre] ?? "").includes(w)) score += 3;
      if (t.moods.some((m) => m === w || norm(MOODS[m] ?? "").includes(w))) score += 2;
      if (norm(t.title).includes(w) || norm(t.instruments).includes(w)) score += 1;
    }
    if (t.duration >= minDuration) score += 0.5;
    score += (hash(t.id + want.join()) % 100) / 1000; // stable tie-break
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
};

export const pickSfx = (tags: string[]) => {
  const want = tags.map(norm);
  let best: SfxItem | null = null;
  let bestScore = 0;
  for (const s of SFX) {
    let score = 0;
    for (const w of want) {
      if (s.category === w) score += 3;
      if (s.tags.some((t) => norm(t) === w)) score += 2;
      else if (norm(`${s.title} ${s.tags.join(" ")}`).includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
};
