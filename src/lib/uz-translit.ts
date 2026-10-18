/**
 * Uzbek Cyrillic → Latin (official 1995 alphabet). Speech recognition often returns Uzbek in
 * Cyrillic; the editor's captions are Latin, so segments are converted before they reach the timeline.
 * oʻ / gʻ use U+02BB and the tutuq belgisi U+02BC (both are in the "latin" subset of Google Fonts).
 */

const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh",
  ъ: "ʼ", ь: "", э: "e", ю: "yu", я: "ya", ў: "oʻ", қ: "q", ғ: "gʻ", ҳ: "h",
  // Russian-only letters that show up in loan words
  ы: "i", щ: "sh",
};
const VOWELS = new Set([..."аеёиоуэюяўАЕЁИОУЭЮЯЎ "]);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const hasCyrillic = (text: string) => /[Ѐ-ӿ]/.test(text);

export const uzCyrillicToLatin = (text: string): string => {
  if (!hasCyrillic(text)) return text;
  let out = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const upper = ch !== lower;
    // "е" is "ye" at the start of a word and after a vowel / ъ, otherwise "e".
    if (lower === "е") {
      const prev = chars[i - 1];
      const ye = !prev || !/[\p{L}]/u.test(prev) || VOWELS.has(prev) || prev === "ъ" || prev === "Ъ";
      out += upper ? (ye ? "Ye" : "E") : ye ? "ye" : "e";
      continue;
    }
    const mapped = MAP[lower];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    if (!upper) out += mapped;
    else {
      // Upper-case digraphs stay "Sh" / "Ch" (title case) unless the next letter is upper too (all caps).
      const next = chars[i + 1];
      const allCaps = next && next !== next.toLowerCase();
      out += allCaps ? mapped.toUpperCase() : cap(mapped);
    }
  }
  return out;
};
