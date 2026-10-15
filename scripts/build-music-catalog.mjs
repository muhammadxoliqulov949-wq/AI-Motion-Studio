/**
 * Builds src/editor/catalog/music.json from Kevin MacLeod's public catalog (incompetech.com).
 * All tracks are licensed CC BY 4.0: free for commercial use with attribution
 * ("<title>" Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0).
 *
 *   node scripts/build-music-catalog.mjs [path/to/pieces.json]
 *
 * Without an argument the catalog is downloaded from incompetech.com.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";

const SOURCE = "https://incompetech.com/music/royalty-free/pieces.json";
const OUT = new URL("../src/editor/catalog/music.json", import.meta.url);

// incompetech genre ids → editor genre slugs
const GENRES = {
  2: "world",
  3: "blues",
  4: "classical",
  5: "chill",
  6: "disco",
  7: "electronic",
  8: "funk",
  9: "holiday",
  10: "horror",
  11: "jazz",
  12: "latin",
  13: "modern",
  15: "polka",
  16: "pop",
  18: "reggae",
  19: "rock",
  20: "ragtime",
  21: "reggae",
  22: "cinematic",
  23: "sting",
  24: "mixed",
  25: "world",
};

// How many tracks to keep per genre (spread evenly over the catalog).
const QUOTA = {
  cinematic: 46,
  electronic: 40,
  chill: 34,
  pop: 16,
  rock: 22,
  jazz: 20,
  funk: 16,
  world: 22,
  classical: 16,
  horror: 14,
  latin: 12,
  disco: 10,
  modern: 10,
  blues: 8,
  reggae: 10,
  ragtime: 6,
  polka: 4,
  holiday: 8,
  sting: 16,
  mixed: 22,
};

const MOODS = {
  Bright: "bright",
  Uplifting: "uplifting",
  Relaxed: "relaxed",
  Calming: "calm",
  Epic: "epic",
  Action: "action",
  Dark: "dark",
  Mysterious: "mysterious",
  Mystical: "mystical",
  Humorous: "funny",
  Grooving: "groovy",
  Driving: "driving",
  Bouncy: "bouncy",
  Intense: "intense",
  Suspenseful: "suspense",
  Somber: "sad",
  Eerie: "eerie",
  Unnerving: "tense",
  Aggressive: "aggressive",
};

const seconds = (len) => {
  const [h, m, s] = String(len).split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

const baseTitle = (t) =>
  t
    .replace(/\(.*?\)/g, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\b(v\d|instrumental|no percussion|loop|faster|slower|short|shorter|full|version)\b/gi, "")
    .trim()
    .toLowerCase();

const slug = (t) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const main = async () => {
  const raw = process.argv[2] ? await readFile(process.argv[2], "utf8") : await (await fetch(SOURCE)).text();
  const pieces = JSON.parse(raw);
  const byGenre = new Map();
  const seen = new Set();
  for (const p of pieces) {
    const genre = GENRES[p.genre];
    if (!genre || !p.filename?.endsWith(".mp3")) continue;
    const duration = seconds(p.length);
    const max = genre === "sting" ? 40 : 270;
    const min = genre === "sting" ? 3 : 45;
    if (duration < min || duration > max) continue;
    const key = baseTitle(p.title);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byGenre.has(genre)) byGenre.set(genre, []);
    byGenre.get(genre).push(p);
  }

  const tracks = [];
  for (const [genre, quota] of Object.entries(QUOTA)) {
    const list = (byGenre.get(genre) ?? []).sort((a, b) => String(a.uploaded).localeCompare(String(b.uploaded)));
    const step = Math.max(1, list.length / quota);
    for (let i = 0; i < Math.min(quota, list.length); i++) {
      const p = list[Math.floor(i * step)];
      const moods = String(p.feel ?? "")
        .split(",")
        .map((s) => MOODS[s.trim()])
        .filter(Boolean);
      tracks.push({
        id: `km-${slug(p.title)}`,
        title: p.title,
        artist: "Kevin MacLeod",
        genre,
        moods,
        bpm: Number(p.bpm) || null,
        duration: seconds(p.length),
        instruments: p.instruments ?? "",
        file: p.filename,
      });
    }
  }
  await mkdir(new URL("../src/editor/catalog/", import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(tracks, null, 0).replace(/\},\{/g, "},\n{") + "\n");
  console.log(`Wrote ${tracks.length} tracks to ${OUT.pathname}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
