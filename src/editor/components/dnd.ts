/** Drag & drop payload types between the library panels and the timeline. */
export const DND = {
  /** Asset id already in the project. */
  asset: "application/x-ams-asset",
  /** JSON MediaAsset from the music / SFX library (added to the project on drop). */
  libAsset: "application/x-ams-lib-asset",
  /** Text template id. */
  text: "application/x-ams-text",
  /** "emoji:<name>" | "shape:<id>". */
  sticker: "application/x-ams-sticker",
  effect: "application/x-ams-effect",
  /** "<id>|<duration>". */
  transition: "application/x-ams-transition",
  filter: "application/x-ams-filter",
};
