import type {
  ApiError,
  GenerateMontageRequest,
  MontagePlan,
  ResolvedMontage,
  ResolvedScene,
  TtsVoice,
} from "./types";

export const DEFAULT_BGM = "audio/bgm/lofi-96.wav";

/** Frames between scene start and the voice starting (matches the composition). */
const VOICE_OFFSET_FRAMES = 4;
const VOICE_TAIL_SECONDS = 0.45;

export class MontageApiError extends Error {
  constructor(
    message: string,
    public code: ApiError["code"] | "network",
  ) {
    super(message);
  }
}

const readError = async (res: Response): Promise<MontageApiError> => {
  try {
    const data = (await res.json()) as ApiError;
    return new MontageApiError(data.error ?? `HTTP ${res.status}`, data.code ?? "model_error");
  } catch {
    return new MontageApiError(`HTTP ${res.status}`, "model_error");
  }
};

export async function requestPlan(input: GenerateMontageRequest): Promise<MontagePlan> {
  let res: Response;
  try {
    res = await fetch("/api/generate-montage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new MontageApiError("Serverga ulanib bo'lmadi.", "network");
  }
  if (!res.ok) throw await readError(res);
  return res.json();
}

const audioDuration = async (blob: Blob) => {
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buffer.duration;
  } finally {
    void ctx.close();
  }
};

/** TTS for one scene. Returns null on failure so the video still renders with subtitles. */
async function requestVoice(text: string, voice: TtsVoice): Promise<{ src: string; seconds: number } | null> {
  try {
    const res = await fetch("/api/generate-montage/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return { src: URL.createObjectURL(blob), seconds: await audioDuration(blob) };
  } catch {
    return null;
  }
}

/**
 * Attaches a voiceover to every scene and stretches scenes that are shorter than
 * their narration, so subtitles and voice stay in sync.
 */
export async function resolveMontage(
  plan: MontagePlan,
  voice: TtsVoice,
  onProgress?: (done: number, total: number) => void,
): Promise<ResolvedMontage> {
  let done = 0;
  const voices = await Promise.all(
    plan.scenes.map(async (scene) => {
      const result = await requestVoice(scene.narration, voice);
      onProgress?.(++done, plan.scenes.length);
      return result;
    }),
  );

  const warnings = [...plan.warnings];
  const failed = voices.filter((v) => !v).length;
  if (failed) warnings.push(`${failed} ta kadr uchun ovoz yaratilmadi — ular faqat subtitr bilan.`);

  const scenes: ResolvedScene[] = plan.scenes.map((scene, i) => {
    const v = voices[i];
    const needed = v ? Math.ceil((v.seconds + VOICE_TAIL_SECONDS) * plan.fps) + VOICE_OFFSET_FRAMES : 0;
    return { ...scene, voiceSrc: v?.src ?? null, durationInFrames: Math.max(scene.durationInFrames, needed) };
  });

  return { ...plan, scenes, warnings, bgm: DEFAULT_BGM };
}

export const releaseMontage = (m: ResolvedMontage | null) =>
  m?.scenes.forEach((s) => s.voiceSrc?.startsWith("blob:") && URL.revokeObjectURL(s.voiceSrc));
