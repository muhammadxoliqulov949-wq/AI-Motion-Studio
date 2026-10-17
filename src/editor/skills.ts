/**
 * Agent skills: specialised modes for the AI editor. Each skill adds its own instructions to the
 * system prompt and narrows the timeline tools (ops) the model may use, so it plans like a
 * specialist instead of a generalist. Shared by the chat UI and /api/edit.
 */
import type { EditOp } from "./edit-ops";

export type SkillId = "auto" | "dynamic" | "style" | "podcast";

export interface Skill {
  id: SkillId;
  emoji: string;
  label: string;
  hint: string;
  /** Allowed ops; null = every op. */
  ops: EditOp["op"][] | null;
  /** Extra system-prompt section for the model. */
  prompt: string;
  starters: string[];
}

export const SKILLS: Skill[] = [
  {
    id: "auto",
    emoji: "✨",
    label: "Avto",
    hint: "Umumiy montajchi — so'rovga qarab o'zi tanlaydi",
    ops: null,
    prompt: "",
    starters: [
      "Buni dinamik Reels qil, 15 soniya, musiqa bilan",
      'Sinematik uslubda montaj qil, sarlavha: "Toshkent tunlari"',
      "Intervyudagi jimliklarni olib tashla va subtitr qo'sh",
      "Vintaj 90-lar uslubi ber, o'tishlar silliq bo'lsin",
    ],
  },
  {
    id: "dynamic",
    emoji: "🎬",
    label: "Dynamic Reels / TikTok",
    hint: "Tez almashinuvchi kadrlar, beat-sync, stikerlar",
    ops: [
      "set_aspect",
      "add_library_music",
      "add_music",
      "beat_sync",
      "beat_cut",
      "fit_duration",
      "add_sfx",
      "add_transitions",
      "set_motion",
      "set_animation",
      "set_speed",
      "update_clip",
      "add_text",
      "style_text",
      "add_captions",
      "add_sticker",
      "add_effect",
      "set_grade",
      "add_stock",
      "reorder",
      "delete_clip",
    ],
    prompt: `## Active skill: Dynamic Reels / TikTok
You are a short-form editor. Default to 9:16 and 10–30 s unless the user says otherwise.
- Hook in the first 1.5 s: open on the most striking shot with a bold pop/tiktok-caption title (text animation pop-words or bounce-in).
- Rhythm: add_library_music first (energetic tags such as electronic, driving, uplifting, hip-hop), then beat_sync with every=1 or 2 so cuts land on beats (0.4–1.5 s shots). Use beat_cut only when there is no music.
- Energy: punch-in / drift motion or zoom-in clip animations on V1, quick transitions (zoom, whip-pan, glitch, flash) of 0.2–0.3 s, add_sfx whoosh atCuts.
- Polish: a vivid or fresh grade, 1–2 animated stickers or motion:* call-to-action presets (motion:subscribe / motion:like near the end), maybe one effect (flash, shake) on the drop.
- Captions: tiktok-caption or hormozi-caption style, short punchy lines.`,
    starters: [
      "15 soniyalik TikTok qil, musiqaga mos kesib",
      "Reels uchun dinamik montaj, oxirida obuna tugmasi",
      "Har bitda kadr almashsin, whoosh tovushlari bilan",
    ],
  },
  {
    id: "style",
    emoji: "🎨",
    label: "Style Matcher",
    hint: "Biriktirilgan video/rasm uslubini ko'chiradi",
    ops: [
      "match_reference",
      "set_aspect",
      "set_grade",
      "add_library_music",
      "beat_sync",
      "add_sfx",
      "add_transitions",
      "set_motion",
      "set_animation",
      "update_clip",
      "add_text",
      "style_text",
      "add_captions",
      "add_sticker",
      "add_effect",
      "set_background",
    ],
    prompt: `## Active skill: Style Matcher
The user attached a reference (its asset note starts with REFERENCE and includes the measured rhythm and look) and wants their own footage edited the same way. You also see frames of the reference.
- Start with match_reference (referenceAssetId = the REFERENCE asset, applyLook and applyTransitions true unless the user says otherwise; assetIds = the user's material in a sensible order, or null). It rebuilds V1 on the reference's exact shot lengths and transition types and copies its aspect ratio and colour look.
- Then copy what the frames show: caption / title placement (top, center, bottom), size, font category, colours, outline or box (add_text / add_captions + style_text); letterbox or vignette (set_grade with the same filter); stickers or effects if the reference uses them.
- If the reference has music (BPM given), add_library_music with tags matching its energy; do NOT use beat_sync after match_reference (it would replace the reference rhythm).
- Never place the reference video itself on the timeline.
- If no REFERENCE asset exists, explain in the reply that they should attach a sample video with the 📎 button and return no ops.`,
    starters: ["Shu videodagidek montaj qil", "Rasmlarimni shu uslubda terib ber", "Namunaning ranglari va subtitrini ko'chir"],
  },
  {
    id: "podcast",
    emoji: "🎙️",
    label: "Talking Head / Podcast",
    hint: "Jimliklarni kesadi, subtitrga urg'u, sokin fon",
    ops: [
      "remove_silences",
      "add_captions",
      "style_text",
      "add_text",
      "set_grade",
      "set_motion",
      "set_keyframes",
      "add_library_music",
      "update_clip",
      "set_aspect",
      "set_background",
      "trim_clip",
      "split_clip",
      "delete_clip",
      "close_gaps",
      "fit_duration",
      "add_transitions",
      "add_sticker",
    ],
    prompt: `## Active skill: Talking Head / Podcast
The footage is people speaking. Clarity first, nothing flashy.
- remove_silences on the speech clips first (jump cuts), close_gaps if needed.
- Captions are the star: add_captions with short lines (3–6 words), then style_text with hormozi-caption or tiktok-caption, a highlight colour for key words, position bottom (or center for 9:16).
- Calm background: add_library_music with calm / relaxed / chill tags at volume 0.08–0.15 so speech stays clear.
- Gentle movement only: subtle punch-in zooms (set_motion punch-in, or set_keyframes scale 1 → 1.08) every few cuts to hide jump cuts; natural grade (clear, soft or warm).
- At most a lower-third name title (add_text style lower-third). No glitch, shake or flashy transitions; only plain cuts or a short dissolve.`,
    starters: ["Jimliklarni olib tashla, subtitr qo'sh", "Podkastni 9:16 qisqa klipga aylantir", "Subtitrlarda muhim so'zlarni ajratib ko'rsat"],
  },
];

export const skillById = (id: string | undefined | null) => SKILLS.find((s) => s.id === id) ?? SKILLS[0];
