/**
 * Iconify icons (searched through /api/icons). The SVG markup is stored in the sticker clip, so it
 * renders offline and on the export server; it is checked before it is ever put into the DOM.
 */

/** Rejects SVG that could run script or load external content. */
export const isSafeSvg = (svg: string) =>
  svg.length < 60_000 && !/<script|<foreignObject|<iframe|<image|\son[a-z]+\s*=|javascript:|href\s*=\s*["']?(?!#)/i.test(svg);

/** Quick picks shown before the user types (English search terms work best with Iconify). */
export const ICON_TOPICS: [string, string][] = [
  ["arrow", "Strelka"],
  ["heart", "Yurak"],
  ["star", "Yulduz"],
  ["check", "Belgi"],
  ["fire", "Olov"],
  ["bell", "Qo'ng'iroq"],
  ["like", "Like"],
  ["play", "Play"],
  ["phone", "Telefon"],
  ["location", "Manzil"],
  ["shopping", "Savdo"],
  ["instagram", "Instagram"],
  ["telegram", "Telegram"],
  ["youtube", "YouTube"],
  ["music", "Musiqa"],
  ["camera", "Kamera"],
];
