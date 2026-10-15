/**
 * Writes src/editor/catalog/emoji.json from @remotion/animated-emoji's list (Noto Animated Emoji,
 * Google, CC BY 4.0). A static copy keeps the catalogue usable from server routes.
 *
 *   node scripts/build-emoji-catalog.mjs
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getAvailableEmojis } = require("@remotion/animated-emoji");
const list = getAvailableEmojis()
  .filter((e) => !/skin-tone/.test(e.name))
  .map((e) => ({ n: e.name, c: e.codepoint, k: e.categories[0], d: Math.round(e.durationInSeconds * 100) / 100 }));
writeFileSync(new URL("../src/editor/catalog/emoji.json", import.meta.url), JSON.stringify(list).replace(/\},\{/g, "},\n{") + "\n");
console.log(`${list.length} emoji written`);
