/**
 * One-click montage: the user picks footage and a style, we build a fresh timeline from it and let
 * the AI editor (or the offline planner) finish the edit in one pass.
 */
import { planWithSkill } from "./ai-agent";
import { applyOpsAsync } from "./agent-runner";
import { describeProject, type AgentStep, type EditOp } from "./edit-ops";
import { importFile } from "./import-media";
import { saveMedia } from "./media-store";
import { makeMediaClip } from "./ops";
import { analyzeReferenceVideo, frameForModel } from "./reference-analysis";
import type { SkillId } from "./skills";
import { emptyProject } from "./templates";
import type { AspectRatio, MediaAsset, Project } from "./types";
import { round } from "./utils";

export type QuickStyleId = "reels" | "cinematic" | "vlog" | "podcast" | "reference";

export interface QuickStyle {
  id: QuickStyleId;
  emoji: string;
  label: string;
  hint: string;
  aspect: AspectRatio;
  skill: SkillId;
  prompt: (seconds: number | null) => string;
}

const len = (s: number | null) => (s ? `${s} soniyalik ` : "");

export const QUICK_STYLES: QuickStyle[] = [
  {
    id: "reels",
    emoji: "⚡",
    label: "Reels / TikTok",
    hint: "Tez kadrlar, beat, whoosh",
    aspect: "9:16",
    skill: "dynamic",
    prompt: (s) => `Bu kliplardan ${len(s)}dinamik Reels/TikTok qil: musiqaga mos tez kesish, whoosh tovushlari, boshida katta sarlavha, qisqa subtitrlar, oxirida obuna animatsiyasi.`,
  },
  {
    id: "cinematic",
    emoji: "🎞️",
    label: "Sinematik",
    hint: "Silliq o'tish, kino ranglari",
    aspect: "16:9",
    skill: "auto",
    prompt: (s) => `${len(s)}sinematik montaj qil: silliq o'tishlar, kino ranglari, letterbox, epik musiqa va chiroyli sarlavha.`,
  },
  {
    id: "vlog",
    emoji: "☀️",
    label: "Vlog",
    hint: "Yorqin, quvnoq, subtitrli",
    aspect: "9:16",
    skill: "auto",
    prompt: (s) => `${len(s)}yorqin vlog montaj qil: quvnoq musiqa, iliq ranglar, ken burns harakat, sarlavha va subtitrlar.`,
  },
  {
    id: "podcast",
    emoji: "🎙️",
    label: "Podcast / gapirish",
    hint: "Jimliklar kesiladi, katta subtitr",
    aspect: "9:16",
    skill: "podcast",
    prompt: () => "Jimliklarni olib tashla, katta subtitrlar qo'sh, muhim so'zlarni ajrat, sokin fon musiqa qo'y.",
  },
  {
    id: "reference",
    emoji: "🎨",
    label: "Namunadagidek",
    hint: "Yoqqan videongiz uslubida",
    aspect: "9:16",
    skill: "style",
    prompt: (s) => `Shu namunadagidek ${len(s)}montaj qil: kadrlar ritmi, o'tishlar, ranglar va subtitr joylashuvi namunadagidek bo'lsin.`,
  },
];

export interface QuickInput {
  style: QuickStyle;
  seconds: number | null;
  files: File[];
  reference: File | null;
  /** Demo scenes used when the user has no files yet. */
  demoAssets: MediaAsset[];
  onStep: (label: string, progress?: number) => void;
}

export interface QuickResult {
  project: Project;
  /** New assets to add to the editor (uploads + library music / SFX the ops pulled in). */
  assets: MediaAsset[];
  steps: AgentStep[];
  reply: string | null;
  mode: "llm" | "local";
}

const MAX_IMAGES = 10;

export const runQuickMontage = async ({ style, seconds, files, reference, demoAssets, onStep }: QuickInput): Promise<QuickResult> => {
  // 1. Footage → assets
  const imported: MediaAsset[] = [];
  for (const [i, file] of files.entries()) {
    onStep(`Fayllar o'qilmoqda (${i + 1}/${files.length})…`, i / Math.max(1, files.length));
    const asset = await importFile(file).catch(() => null);
    if (!asset || asset.kind === "audio") continue;
    const stored: MediaAsset = { ...asset, origin: "upload", chatRole: style.id === "reference" ? "material" : undefined };
    imported.push(stored);
    void saveMedia(stored, file);
  }
  const material = imported.length ? imported : demoAssets.filter((a) => a.scene);
  if (!material.length) throw new Error("Montaj uchun video yoki rasm tanlang");

  // 2. Reference (Style Matcher)
  let ref: MediaAsset | null = null;
  let refFrames: string[] = [];
  if (style.id === "reference") {
    if (!reference) throw new Error("Namuna videoni tanlang");
    onStep("Namuna video tahlil qilinmoqda…", 0);
    const asset = await importFile(reference);
    if (!asset || asset.kind !== "video") throw new Error("Namuna video bo'lishi kerak");
    const analysed = await analyzeReferenceVideo(asset, (p, label) => onStep(label, p));
    ref = { ...asset, origin: "upload", chatRole: "reference", referenceStyle: { ...analysed, frames: [] } };
    refFrames = analysed.frames;
    void saveMedia(ref, reference);
  }

  // 3. Fresh timeline with the footage in order
  onStep("Timeline yig'ilmoqda…");
  let at = 0;
  const clips = material.map((a) => {
    const duration = a.kind === "image" ? 3 : round(Math.min(a.duration, 60), 3);
    const clip = makeMediaClip(a, "V1", round(at, 3), { duration });
    at += duration;
    return clip;
  });
  const base = emptyProject();
  const project: Project = {
    ...base,
    name: `${style.label} montaj`,
    aspect: ref?.referenceStyle?.aspect ?? style.aspect,
    background: { type: "blur", color: "#000000", blur: 40 },
    clips,
  };
  const allAssets = [...demoAssets, ...imported, ...(ref ? [ref] : [])];
  const prompt = style.prompt(seconds);

  // 4. Plan: the AI editor (sees reference frames + one frame per photo/video), else offline rules
  onStep("AI montaj rejasini tuzmoqda…");
  let ops: EditOp[] = [];
  let reply: string | null = null;
  let mode: "llm" | "local" = "llm";
  try {
    let budget = MAX_IMAGES;
    const attachments: { assetId: string; name: string; kind: string; role: string; frames: string[] }[] = [];
    if (ref) {
      const frames = refFrames.slice(0, 6);
      budget -= frames.length;
      attachments.push({ assetId: ref.id, name: ref.name, kind: "video", role: "reference", frames });
    }
    for (const a of imported.slice(0, 8)) {
      const frame = budget > 0 ? await frameForModel(a).catch(() => null) : null;
      if (frame) budget--;
      attachments.push({ assetId: a.id, name: a.name, kind: a.kind, role: "material", frames: frame ? [frame] : [] });
    }
    const res = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        project: describeProject(project, allAssets, null),
        model: "gpt-5.2:low",
        skill: style.skill,
        ...(attachments.length ? { attachments } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { code: data.code });
    ops = data.ops ?? [];
    reply = data.reply ?? null;
  } catch {
    // No key, rate limit or network: the offline planner still produces a full edit.
    mode = "local";
    const local = planWithSkill(prompt, project, allAssets, null, style.skill);
    ops = local.ops;
    reply = local.reply ?? null;
  }

  // 5. Apply (with real audio analysis for beat sync / silence removal)
  onStep("Montaj qo'llanmoqda…");
  const result = await applyOpsAsync(project, allAssets, ops);
  return {
    project: result.project,
    assets: [...imported, ...(ref ? [ref] : []), ...result.newAssets],
    steps: result.steps,
    reply,
    mode,
  };
};
