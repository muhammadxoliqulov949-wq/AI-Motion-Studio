/**
 * Generates src/editor/catalog/fonts.ts — a curated, categorised list of Google Fonts with lazy
 * loaders from @remotion/google-fonts (all Google Fonts are SIL OFL / Apache 2.0: free for
 * commercial use). Subsets and weights are read from the installed package.
 *
 *   node scripts/build-font-catalog.mjs
 */
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const pkgDir = join(root, "node_modules", "@remotion", "google-fonts", "dist", "cjs");

const CATALOG = {
  sans: [
    "Inter", "Roboto", "Open Sans", "Montserrat", "Poppins", "Lato", "Nunito", "Raleway", "Work Sans", "Rubik",
    "Manrope", "DM Sans", "Outfit", "Plus Jakarta Sans", "Urbanist", "Sora", "Space Grotesk", "Figtree", "Lexend",
    "Barlow", "Mulish", "Quicksand", "Kanit", "Archivo", "Exo 2", "Josefin Sans", "Fira Sans", "IBM Plex Sans",
    "Noto Sans", "PT Sans", "Ubuntu", "Source Sans 3", "Titillium Web", "Heebo", "Karla", "Comfortaa",
    "Varela Round", "Golos Text", "Onest", "Commissioner", "Jost", "Prompt", "Hind", "Cabin", "Asap", "Overpass",
    "Red Hat Display", "Albert Sans", "Be Vietnam Pro", "Wix Madefor Display",
  ],
  display: [
    "Bebas Neue", "Anton", "Oswald", "Bricolage Grotesque", "Archivo Black", "Alfa Slab One", "Bungee", "Righteous",
    "Russo One", "Black Ops One", "Bangers", "Luckiest Guy", "Fredoka", "Lilita One", "Passion One", "Monoton",
    "Audiowide", "Orbitron", "Press Start 2P", "Rubik Mono One", "Teko", "Staatliches", "Big Shoulders Display",
    "Abril Fatface", "Ultra", "Bungee Shade", "Creepster", "Faster One", "Rubik Glitch", "Rubik Wet Paint",
    "Rubik Puddles", "Rubik Beastly", "Rubik Bubbles", "Rubik Microbe", "Rubik Moonrocks", "Shrikhand", "Titan One",
    "Chango", "Climate Crisis", "Dela Gothic One", "Tilt Warp", "Tilt Neon", "Syne", "Krona One", "Michroma",
    "Gravitas One", "Sigmar One", "Bungee Inline", "Londrina Solid", "Paytone One", "Days One", "Unbounded",
    "Neonderthaw", "Bowlby One SC", "Changa One", "Coiny", "Bagel Fat One", "Sixtyfour", "Honk", "Nabla",
  ],
  serif: [
    "Playfair Display", "Merriweather", "Lora", "PT Serif", "Libre Baskerville", "Cormorant Garamond", "EB Garamond",
    "Crimson Text", "DM Serif Display", "Prata", "Cinzel", "Bodoni Moda", "Old Standard TT", "Noto Serif",
    "Roboto Slab", "Zilla Slab", "Arvo", "Spectral", "Fraunces", "Yeseva One", "Rozha One", "Marcellus", "Gloock",
    "Instrument Serif", "Young Serif", "Cinzel Decorative", "Literata", "Alice", "Forum", "Ibarra Real Nova",
  ],
  handwriting: [
    "Dancing Script", "Pacifico", "Caveat", "Lobster", "Great Vibes", "Satisfy", "Sacramento", "Kaushan Script",
    "Amatic SC", "Shadows Into Light", "Indie Flower", "Permanent Marker", "Patrick Hand", "Gochi Hand", "Courgette",
    "Cookie", "Yellowtail", "Allura", "Parisienne", "Alex Brush", "Marck Script", "Bad Script", "Caveat Brush",
    "Rock Salt", "Homemade Apple", "Reenie Beanie", "Nothing You Could Do", "Covered By Your Grace", "Mr Dafoe",
    "Pinyon Script", "Tangerine", "Kalam", "Neucha", "Comforter Brush", "Birthstone", "Lobster Two", "Merienda",
    "Yesteryear", "Damion", "Pangolin", "Sriracha", "Rubik Doodle Shadow", "Playwrite GB S", "Ballet",
  ],
  mono: [
    "JetBrains Mono", "Fira Code", "Space Mono", "IBM Plex Mono", "Roboto Mono", "Source Code Pro", "Courier Prime",
    "VT323", "Share Tech Mono", "Major Mono Display", "Syne Mono", "Silkscreen", "DotGothic16", "Xanh Mono",
  ],
};

const importName = (family) => family.replace(/[^A-Za-z0-9]/g, "");

const pickWeights = (weights) => {
  const nums = weights.map(Number).sort((a, b) => a - b);
  const regular = nums.includes(400) ? 400 : nums[0];
  const bold = [800, 700, 900, 600].find((w) => nums.includes(w));
  return [...new Set([regular, bold].filter(Boolean))].map(String);
};

const entries = [];
const missing = [];
for (const [category, families] of Object.entries(CATALOG)) {
  for (const family of families) {
    const name = importName(family);
    const file = join(pkgDir, `${name}.js`);
    // Both module formats must exist: the bundler resolves the ESM build.
    if (!existsSync(file) || !existsSync(join(pkgDir, "..", "esm", `${name}.mjs`))) {
      missing.push(family);
      continue;
    }
    const info = require(file).getInfo();
    const normal = info.fonts.normal ?? Object.values(info.fonts)[0];
    const weights = pickWeights(Object.keys(normal));
    const subsets = info.subsets.filter((s) => ["latin", "latin-ext", "cyrillic", "cyrillic-ext"].includes(s));
    if (!subsets.includes("latin")) {
      missing.push(`${family} (no latin)`);
      continue;
    }
    entries.push({ family: info.fontFamily, name, category, weights, subsets, cyrillic: subsets.includes("cyrillic") });
  }
}

const lines = [
  "// Auto-generated by scripts/build-font-catalog.mjs — do not edit by hand.",
  "// Google Fonts (SIL Open Font License / Apache 2.0) served through @remotion/google-fonts.",
  "",
  "export type FontCategory = \"sans\" | \"display\" | \"serif\" | \"handwriting\" | \"mono\";",
  "",
  "export interface FontEntry {",
  "  family: string;",
  "  category: FontCategory;",
  "  weights: string[];",
  "  subsets: string[];",
  "  cyrillic: boolean;",
  "  load: () => Promise<{ loadFont: (style?: string, options?: { weights?: string[]; subsets?: string[]; ignoreTooManyRequestsWarning?: boolean }) => { waitUntilDone: () => Promise<unknown> } }>;",
  "}",
  "",
  "/* eslint-disable @typescript-eslint/no-explicit-any */",
  "export const FONTS: FontEntry[] = [",
  ...entries.map(
    (e) =>
      `  { family: ${JSON.stringify(e.family)}, category: "${e.category}", weights: ${JSON.stringify(e.weights)}, subsets: ${JSON.stringify(e.subsets)}, cyrillic: ${e.cyrillic}, load: () => import("@remotion/google-fonts/${e.name}") as Promise<any> },`,
  ),
  "];",
  "",
];
writeFileSync(join(root, "src", "editor", "catalog", "fonts.ts"), lines.join("\n"));
console.log(`${entries.length} fonts written; skipped: ${missing.join(", ") || "none"}`);
