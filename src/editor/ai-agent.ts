/**
 * Offline fallback planner: turns a request into the same EditOp list the LLM returns,
 * using keyword rules. Used when no API key is configured and for the landing demo.
 */
import { applyOps, type AgentStep, type EditOp } from "./edit-ops";
import { clipsOnTrack } from "./ops";
import type { MediaAsset, MediaClip, Project } from "./types";
import { projectDuration, round } from "./utils";

export type { AgentStep };

export interface AgentResult {
  reply: string;
  steps: AgentStep[];
  code: string;
  project: Project;
  suggestions: string[];
  ops: EditOp[];
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ’‘`]/g, "'")
    .replace(/\s+/g, " ");

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

const CAPTION_LINES = [
  "Bu loyiha bir yil oldin boshlangan",
  "Biz har kuni kichik qadam tashladik",
  "Natija esa kutganimizdan ham zo'r",
  "Endi buni siz bilan bo'lishamiz",
  "Oxirigacha ko'ring",
  "Obuna bo'lishni unutmang",
];

const grade = (filter: Extract<EditOp, { op: "set_grade" }>["filter"], extras: { letterbox?: boolean; vignette?: boolean; grain?: boolean } = {}): EditOp => ({
  op: "set_grade",
  filter,
  letterbox: extras.letterbox ?? null,
  vignette: extras.vignette ?? null,
  grain: extras.grain ?? null,
});

export const planLocally = (prompt: string, project: Project, selectedId: string | null): EditOp[] => {
  const text = normalize(prompt);
  const ops: EditOp[] = [];
  const quoted = prompt.match(/["“«](.+?)["”»]/)?.[1];
  const seconds = Number(text.match(/(\d{1,3})\s*(soniya|sekund|sek|s\b|second)/)?.[1]);
  const v1 = clipsOnTrack(project, "V1").filter((c): c is MediaClip => c.type === "media");
  const rawTotal = v1.reduce((s, c) => s + c.duration, 0);

  const vertical = has(text, ["reels", "tiktok", "shorts", "vertikal", "9:16", "tik tok", "story"]);
  const formatOnly = has(text, ["format", "o'tkaz"]);
  const dynamic =
    (vertical && !formatOnly) || has(text, ["dinamik", "tez ", "tezroq", "energ", "dynamic", "ritm", "beat", "trend"]);
  const cinematic = has(text, ["sinematik", "kino", "cinematic", "film", "epik", "epic"]);
  const polish = has(text, ["yaxshila", "yaxshiroq", "improve", "polish", "zo'r qil", "chiroyli"]);

  if (vertical) ops.push({ op: "set_aspect", aspect: "9:16" });
  if (has(text, ["kvadrat", "1:1", "instagram post"])) ops.push({ op: "set_aspect", aspect: "1:1" });
  if (has(text, ["youtube", "gorizontal", "16:9"])) ops.push({ op: "set_aspect", aspect: "16:9" });

  if (has(text, ["jimlik", "pauza", "silence", "ortiqcha gap", "jump cut"])) ops.push({ op: "remove_silences", clipIds: null });
  if (dynamic) ops.push({ op: "beat_cut", targetSeconds: seconds || 16 });
  else if (seconds) ops.push({ op: "fit_duration", seconds });
  if (has(text, ["teskari", "reverse", "tartibni almashtir"])) ops.push({ op: "reorder", clipIds: null, reverse: true });

  if (cinematic) {
    ops.push(grade("teal-orange", { letterbox: project.aspect === "16:9" && !vertical, vignette: true, grain: true }));
    ops.push({ op: "set_motion", motion: "ken-burns", clipIds: null });
    ops.push({ op: "add_transitions", type: "fade", duration: 0.8 });
  }
  if (has(text, ["qora-oq", "oq-qora", "qora oq", "mono", "b&w", "black and white"])) ops.push(grade("mono", { vignette: true }));
  if (has(text, ["vintaj", "retro", "eski", "vintage", "90"])) ops.push(grade("vintage", { grain: true, vignette: true }));
  if (has(text, ["yorqin", "vivid", "rangli", "jonli"])) ops.push(grade("vivid"));
  if (has(text, ["iliq", "warm"])) ops.push(grade("warm"));
  if (has(text, ["sovuq", "cool", "moviy"])) ops.push(grade("cool"));

  const speedTarget = selectedId ?? v1[1]?.id ?? v1[0]?.id;
  if (speedTarget && has(text, ["sekin", "slow"])) ops.push({ op: "set_speed", clipId: speedTarget, speed: 0.5 });
  if (speedTarget && has(text, ["tezlashtir", "speed up", "2x"])) ops.push({ op: "set_speed", clipId: speedTarget, speed: 2 });
  if (has(text, ["ken burns", "zoom", "harakat"]) && !cinematic && !dynamic) ops.push({ op: "set_motion", motion: "ken-burns", clipIds: null });
  if (has(text, ["o'tish", "otish", "transition", "silliq", "smooth"]) && !cinematic) {
    ops.push({ op: "add_transitions", type: dynamic ? "zoom" : "fade", duration: dynamic ? 0.3 : 0.6 });
  }

  if (has(text, ["subtitr", "caption", "titr", "matn yoz", "yozuv"])) ops.push({ op: "add_captions", lines: CAPTION_LINES });
  if (quoted || has(text, ["sarlavha", "title", "nom qo'y", "intro"])) {
    ops.push({ op: "add_text", text: quoted ?? "Mening hikoyam", style: dynamic ? "pop" : "title", start: 0, duration: 3, position: "center" });
  }
  const wantsMusic = has(text, ["musiqa", "music", "fon", "qo'shiq", "audio"]);

  if (polish || ops.length === 0) {
    if (!polish) ops.push({ op: "fit_duration", seconds: Math.min(30, Math.round(rawTotal * 0.6)) });
    if (!project.clips.some((c) => c.transitionIn !== "none")) ops.push({ op: "add_transitions", type: "fade", duration: 0.5 });
    if (project.grade.filter === "none") ops.push(grade("cinematic", { vignette: true }));
    if (!project.clips.some((c) => c.type === "text")) {
      ops.push({ op: "add_text", text: quoted ?? "Mening hikoyam", style: "title", start: 0, duration: 3, position: "center" });
    }
    if (!project.clips.some((c) => c.trackId === "A1")) ops.push({ op: "add_music", assetId: null, volume: null });
  } else if (wantsMusic || (dynamic && !project.clips.some((c) => c.trackId === "A1"))) {
    ops.push({ op: "add_music", assetId: null, volume: null });
  }
  return ops;
};

export const suggestFor = (p: Project) => {
  const out: string[] = [];
  if (!p.clips.some((c) => c.type === "text" && c.style === "caption")) out.push("Subtitr qo'sh");
  if (!p.clips.some((c) => c.trackId === "A1")) out.push("Fon musiqa qo'y");
  if (p.grade.filter === "none") out.push("Sinematik ranglar ber");
  if (p.aspect !== "9:16") out.push("Reels formatiga o'tkaz");
  out.push("Yanada dinamikroq qil", "Ikkinchi kadrni slow-motion qil");
  return out.slice(0, 4);
};

export const summarize = (stepsCount: number, before: Project, after: Project) => {
  const b = projectDuration(before);
  const a = projectDuration(after);
  return [
    stepsCount ? `Tayyor! ${stepsCount} ta o'zgarish kiritdim.` : "Bu so'rov bo'yicha o'zgartiradigan narsa topmadim.",
    Math.abs(b - a) > 0.5 ? `Davomiylik: ${round(b, 1)}s → ${round(a, 1)}s.` : "",
    stepsCount ? "Previewda ko'ring — yoqmasa, nimani o'zgartirishni ayting." : "Boshqacharoq tushuntirib ko'ring.",
  ]
    .filter(Boolean)
    .join(" ");
};

export const runAgent = (prompt: string, project: Project, assets: MediaAsset[], selectedId: string | null): AgentResult => {
  const ops = planLocally(prompt, project, selectedId);
  const result = applyOps(project, assets, ops);
  return {
    ...result,
    ops,
    reply: summarize(result.steps.filter((s) => !s.warning).length, project, result.project),
    suggestions: suggestFor(result.project),
  };
};
