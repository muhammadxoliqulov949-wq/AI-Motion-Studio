import { z } from "zod";

export const MONTAGE_FPS = 30;

export const ANIMATION_TYPES = ["fade", "slide", "pop"] as const;
export const SFX_TYPES = ["whoosh", "pop", "click", "swoosh"] as const;
export const TTS_VOICES = ["alloy", "nova", "onyx", "shimmer", "echo", "fable"] as const;

export type AnimationType = (typeof ANIMATION_TYPES)[number];
export type SfxType = (typeof SFX_TYPES)[number];
export type TtsVoice = (typeof TTS_VOICES)[number];
export type MontageAspect = "9:16" | "16:9";

// ---------- 1. What the controller LLM returns ----------

export const MontageSceneSchema = z.object({
  durationInFrames: z.number().int().describe("Scene length at 30 fps (60–240). Long enough to read the text and speak the narration."),
  text: z.string().describe("Short on-screen subtitle, max ~8 words, in the user's language"),
  narration: z.string().describe("What the voiceover says during this scene (1–2 sentences, user's language)"),
  visual_search_query: z.string().describe("2–4 concrete ENGLISH words for a stock-video search, e.g. 'city traffic night'"),
  animation_type: z.enum(ANIMATION_TYPES),
  sfx_type: z.enum(SFX_TYPES),
});

export const MontageScriptSchema = z.object({
  title: z.string().describe("Catchy video title in the user's language"),
  voice_script: z.string().describe("The complete voiceover = all scene narrations joined in order"),
  scenes: z.array(MontageSceneSchema).describe("4–8 scenes in order"),
});

export type MontageScene = z.infer<typeof MontageSceneSchema>;
export type MontageScript = z.infer<typeof MontageScriptSchema>;

// ---------- 2. After the server attaches stock footage ----------

export interface SceneFootage {
  url: string;
  width: number;
  height: number;
  /** Clip length in seconds (the composition loops shorter clips). */
  duration: number;
  author: string;
  pexelsUrl: string;
}

export interface PlannedScene extends MontageScene {
  footage: SceneFootage | null;
}

export interface MontagePlan extends Omit<MontageScript, "scenes"> {
  topic: string;
  aspect: MontageAspect;
  fps: typeof MONTAGE_FPS;
  scenes: PlannedScene[];
  /** Non-fatal problems (missing footage, no Pexels key…) to show the user. */
  warnings: string[];
}

// ---------- 3. What the Remotion composition renders ----------

export interface ResolvedScene extends PlannedScene {
  /** Voiceover audio for this scene (object URL in the browser), or null if TTS failed. */
  voiceSrc: string | null;
}

export interface ResolvedMontage extends Omit<MontagePlan, "scenes"> {
  scenes: ResolvedScene[];
  /** Background music file inside /public, or null for none. */
  bgm: string | null;
}

// ---------- API contracts ----------

export const GenerateMontageRequestSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  aspect: z.enum(["9:16", "16:9"]).default("9:16"),
  targetSeconds: z.number().int().min(10).max(90).default(30),
  /** Let the director put [emotion] tags into the narration (only the editor's script flow voices them). */
  emotions: z.boolean().default(false),
});

export type GenerateMontageRequest = z.input<typeof GenerateMontageRequestSchema>;

export const VoiceRequestSchema = z.object({
  text: z.string().trim().min(1).max(600),
  voice: z.enum(TTS_VOICES).default("nova"),
});

export interface ApiError {
  error: string;
  code: "no_api_key" | "bad_request" | "model_error" | "tts_error" | "rate_limited";
}
