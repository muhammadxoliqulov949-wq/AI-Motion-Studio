import { findFootage, findPixabayFootage } from "@/montage/server/pexels";
import { buildUserPrompt, MONTAGE_SYSTEM_PROMPT } from "@/montage/server/prompt";
import {
  GenerateMontageRequestSchema,
  MONTAGE_FPS,
  MontageScriptSchema,
  type ApiError,
  type MontagePlan,
  type PlannedScene,
} from "@/montage/types";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export const maxDuration = 60;

// Each montage = one LLM call + up to 8 stock searches.
const RATE_LIMIT = { name: "montage", limit: 6, windowMs: 10 * 60 * 1000 };

const MIN_FRAMES = 60;
const MAX_FRAMES = 240;

const fail = (status: number, error: string, code: ApiError["code"]) =>
  Response.json({ error, code } satisfies ApiError, { status });

/**
 * Topic → montage plan.
 * 1. The controller LLM writes the script, scenes, search queries and sound cues.
 * 2. Each scene's `visual_search_query` is resolved to a Pexels stock clip (in parallel).
 * Voiceover is generated separately per scene via /api/generate-montage/voice.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fail(503, 'Serverda "OPENAI_API_KEY" sozlanmagan.', "no_api_key");

  let input;
  try {
    input = GenerateMontageRequestSchema.parse(await req.json());
  } catch {
    return fail(400, "Mavzu 3–500 belgidan iborat bo'lishi kerak.", "bad_request");
  }

  const openai = createOpenAI({ apiKey });
  let script;
  try {
    const result = await generateObject({
      model: openai(process.env.MONTAGE_MODEL ?? "gpt-4o-mini"),
      system: MONTAGE_SYSTEM_PROMPT,
      prompt: buildUserPrompt(input.topic, input.aspect, input.targetSeconds, input.emotions),
      schema: MontageScriptSchema,
      maxRetries: 1,
    });
    script = result.object;
  } catch (err) {
    console.error("Montage script generation failed:", err);
    return fail(502, "AI ssenariy yoza olmadi. Birozdan keyin qayta urinib ko'ring.", "model_error");
  }

  const warnings: string[] = [];
  // Guard against out-of-range values the schema can't express.
  const scenes = script.scenes.slice(0, 8).map((s) => ({
    ...s,
    durationInFrames: Math.min(MAX_FRAMES, Math.max(MIN_FRAMES, Math.round(s.durationInFrames))),
  }));
  if (!scenes.length) return fail(502, "AI bitta ham kadr qaytarmadi.", "model_error");

  // Pixabay first (the editor's stock library uses it too), Pexels as a fallback.
  const pixabayKey = process.env.PIXABAY_API_KEY ?? process.env.PIXABAY_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;
  let planned: PlannedScene[];
  if (!pixabayKey && !pexelsKey) {
    warnings.push("PIXABAY_API_KEY sozlanmagan — fon videolar o'rniga gradient ishlatildi.");
    planned = scenes.map((s) => ({ ...s, footage: null }));
  } else {
    // Searches run in parallel; the shared set still prevents duplicates because each
    // search picks its clip synchronously after its own fetch resolves.
    const used = new Set<string>();
    planned = await Promise.all(
      scenes.map(async (scene) => {
        const footage = pixabayKey
          ? await findPixabayFootage(scene.visual_search_query, input.aspect, pixabayKey, used)
          : await findFootage(scene.visual_search_query, input.aspect, pexelsKey!, used);
        if (!footage) warnings.push(`"${scene.visual_search_query}" uchun video topilmadi — gradient ishlatildi.`);
        return { ...scene, footage };
      }),
    );
  }

  const plan: MontagePlan = {
    title: script.title,
    voice_script: scenes.map((s) => s.narration).join(" "),
    topic: input.topic,
    aspect: input.aspect,
    fps: MONTAGE_FPS,
    scenes: planned,
    warnings,
  };
  return Response.json(plan);
}
