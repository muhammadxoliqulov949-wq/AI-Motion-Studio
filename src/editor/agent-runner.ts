/**
 * Applies AI ops in order, pausing before ops that need real audio analysis
 * (remove_silences, beat_sync) to decode and analyse the current timeline.
 */
import { beatsOnTimeline, decodeAudio, detectBeats, detectSpeech } from "./audio-analysis";
import { applyOps, isSpeechAsset, type AgentStep, type EditOp, type OpAnalysis } from "./edit-ops";
import { clipsOnTrack } from "./ops";
import { searchStock, StockError, stockToAsset } from "./stock";
import type { MediaAsset, MediaClip, Project } from "./types";

const ANALYSED = new Set(["remove_silences", "beat_sync", "add_stock"]);

const analyse = async (op: EditOp, project: Project, assets: MediaAsset[]): Promise<OpAnalysis | undefined> => {
  const find = (c: MediaClip) => assets.find((a) => a.id === c.assetId);
  if (op.op === "remove_silences") {
    const clips = clipsOnTrack(project, "V1").filter(
      (c): c is MediaClip => c.type === "media" && (op.clipIds ? op.clipIds.includes(c.id) : isSpeechAsset(find(c))),
    );
    const speech = new Map<string, { start: number; end: number }[]>();
    for (const clip of clips) {
      const asset = find(clip);
      if (!asset?.src || asset.scene) continue;
      try {
        const buffer = await decodeAudio(asset.src);
        speech.set(clip.id, detectSpeech(buffer, clip.in, Math.min(buffer.duration, clip.in + clip.duration * clip.speed)));
      } catch {
        /* no audio track — the op falls back to its simple version */
      }
    }
    return { speech };
  }
  if (op.op === "add_stock") {
    try {
      const r = await searchStock("videos", op.query, project.aspect);
      return { stock: r.items.slice(0, Math.max(1, Math.min(8, Math.round(op.count)))).map(stockToAsset) };
    } catch (err) {
      return { stockError: err instanceof StockError && err.code === "no_api_key" ? "Stok video uchun serverda PEXELS_API_KEY kerak" : (err as Error).message };
    }
  }
  if (op.op === "beat_sync") {
    const music = project.tracks
      .filter((t) => t.kind === "audio")
      .flatMap((t) => clipsOnTrack(project, t.id))
      .find((c): c is MediaClip => c.type === "media" && find(c as MediaClip)?.origin !== "sfx" && !!find(c as MediaClip)?.src);
    if (!music) return undefined;
    const buffer = await decodeAudio(find(music)!.src!);
    const info = detectBeats(buffer);
    return { beats: beatsOnTimeline(music, info), bpm: info.bpm };
  }
  return undefined;
};

export const applyOpsAsync = async (project: Project, assets: MediaAsset[], ops: EditOp[]) => {
  let p = project;
  let a = assets;
  const steps: AgentStep[] = [];
  const code: string[] = [];
  const newAssets: MediaAsset[] = [];
  let batch: EditOp[] = [];
  const flush = (analysis?: OpAnalysis) => {
    if (!batch.length) return;
    const r = applyOps(p, a, batch, analysis);
    p = r.project;
    steps.push(...r.steps);
    if (r.code) code.push(r.code);
    newAssets.push(...r.newAssets);
    a = [...a, ...r.newAssets];
    batch = [];
  };
  for (const op of ops) {
    if (!ANALYSED.has(op.op)) {
      batch.push(op);
      continue;
    }
    flush();
    const analysis = await analyse(op, p, a).catch(() => undefined);
    batch = [op];
    flush(analysis);
  }
  flush();
  return { project: p, steps, code: code.join("\n"), newAssets };
};
