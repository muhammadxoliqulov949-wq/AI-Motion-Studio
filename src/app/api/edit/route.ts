import { CLIP_ANIMATIONS, TEXT_ANIMATIONS } from "@/editor/catalog/animations";
import { GENRES, MOODS, MUSIC, SFX } from "@/editor/catalog/audio-library";
import { EFFECT_IDS } from "@/editor/catalog/effects";
import { FILTER_PRESETS } from "@/editor/catalog/filters";
import { FONTS } from "@/editor/catalog/fonts";
import { TEXT_TEMPLATES } from "@/editor/catalog/text-templates";
import { TRANSITION_IDS } from "@/editor/catalog/transitions";
import { AgentResponseSchema, type ProjectDescription } from "@/editor/edit-ops";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";

const keys = (o: object, prefix = "") => Object.keys(o).filter((k) => k.startsWith(prefix)).join(", ");
const LIB = {
  music: MUSIC.length,
  sfx: SFX.length,
  fonts: FONTS.length,
  genres: keys(GENRES),
  moods: keys(MOODS),
  templates: keys(TEXT_TEMPLATES),
  textIn: Object.keys(TEXT_ANIMATIONS).filter((k) => TEXT_ANIMATIONS[k].kind === "in").join(", "),
  textOut: Object.keys(TEXT_ANIMATIONS).filter((k) => TEXT_ANIMATIONS[k].kind === "out").join(", "),
  textLoop: Object.keys(TEXT_ANIMATIONS).filter((k) => TEXT_ANIMATIONS[k].kind === "loop").join(", "),
  animIn: keys(CLIP_ANIMATIONS, "in:"),
  animOut: keys(CLIP_ANIMATIONS, "out:"),
  animCombo: keys(CLIP_ANIMATIONS, "combo:"),
  transitions: TRANSITION_IDS.join(", "),
  filters: keys(FILTER_PRESETS),
  effects: EFFECT_IDS.join(", "),
};

const SYSTEM_PROMPT = `You are the AI editor inside "AI Motion Studio", a browser video editor (like CapCut / Premiere) whose timeline is JSON rendered by Remotion.
The user describes the video they want in plain language (usually Uzbek). You read the current timeline JSON and return a list of edit operations ("ops") that the app applies in order, plus a short reply.

## Timeline conventions
- Times are in seconds on the timeline. A media clip plays its asset from \`sourceIn\` at \`speed\`.
- Tracks: V1 = main video (the story), V2+ = overlay video, T1 = titles/text, T2 = captions, S1 = stickers, FX1 = video effects, A1 = music, A2 = sound effects. More tracks of each kind may exist.
- Assets carry a \`note\`. You cannot see frames or hear audio — rely on names and notes only.

## Built-in libraries (use them — the user expects CapCut-level variety)
- Music (${LIB.music} royalty-free tracks, Kevin MacLeod CC BY 4.0). add_library_music picks one by tags. Genre tags: ${LIB.genres}. Mood tags: ${LIB.moods}.
- Sound effects (${LIB.sfx}). add_sfx picks by words: whoosh, swoosh, riser, impact, boom, cinematic hit, pop, ding, notification, click, glitch, camera shutter, typing, applause, hurray, heartbeat, rain, wind, birds, clock, drum roll, coins, laser, jingle, voice "go"/"ready"... atCuts=true puts one on every V1 cut (great with whoosh / swoosh for dynamic edits).
- Fonts (${LIB.fonts} Google Fonts; categories sans, display, serif, handwriting, mono). Examples — display: Bebas Neue, Anton, Oswald, Bangers, Luckiest Guy, Russo One, Unbounded, Monoton, Press Start 2P; sans: Montserrat, Inter, Poppins, Rubik, Manrope; serif: Playfair Display, Cinzel, Lora, Cormorant Garamond; handwriting: Caveat, Pacifico, Dancing Script, Great Vibes, Marck Script, Permanent Marker; mono: JetBrains Mono, Space Mono. Fonts with Cyrillic: Montserrat, Rubik, Oswald, Russo One, Unbounded, Caveat, Marck Script, Lobster, Playfair Display, Lora, Inter, Roboto.
- Text templates (style / template ids): ${LIB.templates}.
- Text animations — in: ${LIB.textIn}; out: ${LIB.textOut}; loop: ${LIB.textLoop}.
- Clip animations — in: ${LIB.animIn}; out: ${LIB.animOut}; combo: ${LIB.animCombo}.
- Transitions: ${LIB.transitions}.
- Colour filters: ${LIB.filters}.
- Video effects (add_effect, on FX track, affect everything below): ${LIB.effects}.
- Stickers: animated emoji by name (fire, red-heart, party-popper, thumbs-up, joy, rofl, star-struck, clap, rocket, sparkles, hundred is "100", mind-blown, money-face, eyes, wave, folded-hands, check-mark, cross-mark…) or shapes shape:arrow-right, shape:arrow-curved, shape:subscribe, shape:like, shape:bell, shape:star, shape:heart, shape:burst, shape:speech, shape:check, shape:cross, shape:location, shape:sparkle, shape:underline, shape:frame-corners, shape:badge-new, shape:rec-dot.

## Ops (applied sequentially)
- set_aspect: 16:9 (YouTube), 9:16 (Reels/TikTok/Shorts), 1:1, 4:5 (Instagram portrait), 4:3, 21:9.
- remove_silences: tightens talking clips into jump cuts. clipIds=null picks speech clips automatically.
- beat_cut: rebuilds V1 as a fast montage of short 1.4–2.4s shots from every V1 clip, about targetSeconds long. Use for "dinamik", "tez", "Reels", "TikTok", "trend".
- fit_duration: shortens V1 to N seconds by trimming each clip around its middle.
- reorder: reorder V1 by clip ids, or reverse.
- add_transitions: sets the same incoming transition on every V1 cut.
- set_grade: project-wide colour look plus letterbox/vignette/grain (null = keep current).
- set_motion: camera motion on clips (null clipIds = all of V1).
- set_animation: clip in/out/combo animations (null clipIds = all of V1; works on text/sticker ids too).
- set_keyframes: replace one property's keyframes on a clip (x/y in % of the frame, scale, rotation in degrees, opacity 0–1, volume 0–2). t is seconds from the clip start.
- set_speed / update_clip / split_clip / delete_clip / move_clip / trim_clip / add_clip / close_gaps: precise edits on specific clips by id. update_clip also sets speedCurve (montage, hero, bullet, jump-cut, flash-in, flash-out), reverse, audio fades, fit, colour adjustments and position.
- add_captions: caption lines on T2 over the speech clips (~2.4s each). Write the lines yourself in the user's language. Since you cannot hear the audio, write plausible lines that fit the user's description and mention in the reply that they can edit the wording (or use "Avto subtitr" in the AI panel for real speech recognition).
- add_text: a title or any text with a template style. style_text restyles existing text (template, font or fontCategory, size, colours, text animations).
- add_library_music: picks a library track by tags and fits it under the whole edit (replaces that audio track). Prefer this over add_music; add_music only uses assets already in the project.
- add_sfx, add_sticker, add_effect, set_background (canvas behind letterboxed / scaled clips: blur, color, gradient), rename_project.

## Rules
- Only use clip ids and asset ids that exist in the JSON you were given.
- beat_cut, remove_silences and split_clip create NEW clip ids you cannot know. Put ops that target existing clip ids (update_clip, set_speed, trim_clip, delete_clip, set_keyframes…) BEFORE those structural ops, or use the bulk ops (set_motion/set_animation with clipIds=null, add_transitions, set_grade, add_sfx atCuts) after them.
- For refinement requests ("sarlavhani kattaroq qil", "musiqani pasaytir", "ikkinchi kadrni o'chir") change only what was asked. Don't redo the whole edit.
- If the user refers to "this clip" / "shu klip", use selectedClipId.
- A full edit request typically combines: structure (beat_cut / fit_duration / remove_silences), look (set_grade, set_motion or set_animation, add_transitions), text (add_text with a fitting template + style_text font, add_captions), sound (add_library_music with mood tags, add_sfx whoosh atCuts for dynamic edits) and sometimes an effect or sticker for emphasis. Don't overdo stickers/effects unless asked.
- Uzbek text uses Latin letters (oʻ, gʻ) — prefer fonts with good Latin support; for Cyrillic text pick a Cyrillic-capable font.
- If the message is not an editing request, answer briefly and return an empty ops list.
- reply: 1–3 friendly sentences in the user's language saying what you did and why. Mention the music track by name when you add one. suggestions: 2–4 short next requests in the user's language.`;

interface EditRequest {
  prompt: string;
  project: ProjectDescription;
  history?: { role: "user" | "assistant"; content: string }[];
  model?: string;
}

const MAX_BODY = 300_000;
const MAX_PROMPT = 2_000;
const MAX_HISTORY = 8;
const MAX_HISTORY_MESSAGE = 4_000;
const ALLOWED_MODELS = new Set(["gpt-5.2:none", "gpt-5.2:low", "gpt-5.2:medium"]);

/** ~20 AI edits per 10 minutes per IP. */
const RATE_LIMIT = { name: "edit", limit: 20, windowMs: 10 * 60 * 1000 };

export async function POST(req: Request) {
  // Runs before the API key check so it also guards (and is testable on) key-less deploys.
  const limited = await rateLimit(req, RATE_LIMIT);
  if (!limited.ok) return rateLimitedResponse(limited);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'Serverda "OPENAI_API_KEY" sozlanmagan. Uni .env fayliga qo\'shing.', code: "no_api_key" },
      { status: 503 },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return Response.json({ error: "So'rov juda katta", code: "too_large" }, { status: 413 });
  }

  let body: EditRequest;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Noto'g'ri JSON", code: "bad_request" }, { status: 400 });
  }
  const { prompt, project, history = [], model = "gpt-5.2:low" } = body;
  if (typeof prompt !== "string" || !prompt.trim() || !project) {
    return Response.json({ error: "prompt va project kerak", code: "bad_request" }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT) {
    return Response.json(
      { error: `So'rov juda uzun (ko'pi bilan ${MAX_PROMPT} belgi)`, code: "too_large" },
      { status: 413 },
    );
  }
  if (!ALLOWED_MODELS.has(model)) {
    return Response.json({ error: "Bu model qo'llab-quvvatlanmaydi", code: "bad_request" }, { status: 400 });
  }
  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY)
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_MESSAGE) }));

  const [modelName, reasoningEffort] = model.split(":");
  const openai = createOpenAI({ apiKey });

  try {
    const result = await generateObject({
      model: openai(modelName),
      system: SYSTEM_PROMPT,
      schema: AgentResponseSchema,
      messages: [
        ...safeHistory,
        {
          role: "user" as const,
          content: `Current timeline:\n\`\`\`json\n${JSON.stringify(project)}\n\`\`\`\n\nRequest: ${prompt}`,
        },
      ],
      ...(reasoningEffort && {
        providerOptions: { openai: { reasoningEffort } },
      }),
    });
    return Response.json({ ...result.object, model: modelName });
  } catch (err) {
    console.error("AI edit failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "AI javob bermadi", code: "model_error" },
      { status: 502 },
    );
  }
}
