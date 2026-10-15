import { DEFAULT_BGM } from "./client";
import { MONTAGE_FPS, type ResolvedMontage } from "./types";

/** Offline example used for Remotion Studio defaults and the "demo" button (no API calls). */
export const SAMPLE_MONTAGE: ResolvedMontage = {
  title: "Ertalabki 5 odat",
  topic: "Muvaffaqiyatli insonlarning ertalabki odatlari",
  aspect: "9:16",
  fps: MONTAGE_FPS,
  voice_script: "",
  warnings: [],
  bgm: DEFAULT_BGM,
  scenes: [
    { text: "Muvaffaqiyat ertalabdan boshlanadi", narration: "", durationInFrames: 75, visual_search_query: "sunrise city", animation_type: "pop", sfx_type: "whoosh", footage: null, voiceSrc: null },
    { text: "1. Telefonni birinchi soat ochmang", narration: "", durationInFrames: 75, visual_search_query: "phone bed morning", animation_type: "slide", sfx_type: "click", footage: null, voiceSrc: null },
    { text: "2. Bir stakan suv iching", narration: "", durationInFrames: 66, visual_search_query: "glass of water", animation_type: "slide", sfx_type: "click", footage: null, voiceSrc: null },
    { text: "3. 10 daqiqa harakat qiling", narration: "", durationInFrames: 66, visual_search_query: "morning workout", animation_type: "pop", sfx_type: "pop", footage: null, voiceSrc: null },
    { text: "Ertaga boshlang — obuna bo'ling!", narration: "", durationInFrames: 84, visual_search_query: "happy person sunrise", animation_type: "fade", sfx_type: "swoosh", footage: null, voiceSrc: null },
  ],
};
