"use client";

import { Camera, Check, Clapperboard, Download, ImagePlus, Loader2, Lock, Save, Sparkles, Wand2, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ASPECTS } from "@/editor/presets";
import type { AspectRatio, MediaAsset } from "@/editor/types";
import { uid } from "@/editor/utils";
import { buildCameraProject, CAMERA_PRESETS, cameraById, FX_CHOICES, LOOK_CHOICES } from "../camera";
import { type GenCaps, generateImage, generateVideo, imageSize, randomSeed, type VideoModel } from "../client";
import { downloadBlob, renderToMp4, stageForEditor, stageVideoForEditor } from "../export";
import type { GenItem } from "../store";
import type { GalleryItem } from "../useGallery";
import { exampleImage, type GenExample } from "../examples";
import { CameraGrid } from "./CameraGrid";
import { ExampleStrip, RandomIdea } from "./Examples";
import { FitPlayer } from "./FitPlayer";
import { Chips, Field, fmtUsd, GhostButton, Notice, PrimaryButton, Range } from "./kit";
import { ModeLayout } from "./ModeLayout";

interface Source {
  id: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  name: string;
  /** Object URL created here (revoked on change); gallery URLs belong to the gallery. */
  owned: boolean;
}

const ASPECT_CHOICES: [AspectRatio, string][] = [
  ["9:16", "9:16"],
  ["16:9", "16:9"],
  ["1:1", "1:1"],
  ["4:5", "4:5"],
];

const nearestAspect = (w: number, h: number): AspectRatio => {
  const r = w / h;
  let best: AspectRatio = "9:16";
  let dist = Infinity;
  for (const [id] of ASPECT_CHOICES) {
    const a = ASPECTS[id];
    const d = Math.abs(Math.log(r / (a.width / a.height)));
    if (d < dist) {
      dist = d;
      best = id;
    }
  }
  return best;
};

const sourceAsset = (s: Source): MediaAsset => ({
  id: `src_${s.id}`,
  name: s.name.slice(0, 40),
  kind: "image",
  duration: 4,
  src: s.url,
  thumbs: [s.url],
  gradient: "linear-gradient(135deg,#1e1b4b,#6d28d9)",
  width: s.width,
  height: s.height,
  origin: "upload",
});

/**
 * Image / text → video. Two engines:
 *  - "camera" (free, in the browser): a virtual camera move over a picture, with effects, colour look,
 *    caption and music; previewed live and rendered to MP4 in the browser;
 *  - AI video models (paid, through the server's Pollinations credits): real generated motion.
 */
export function VideoStudio({
  caps,
  items,
  onAdd,
  initial,
}: {
  caps: GenCaps | null;
  items: GalleryItem[];
  onAdd: (item: GenItem) => Promise<GalleryItem>;
  /** Image handed over from the image studio / gallery. */
  initial: GalleryItem | null;
}) {
  const [inputMode, setInputMode] = useState<"image" | "text">("image");
  const [source, setSource] = useState<Source | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [engine, setEngine] = useState<string>("camera");
  // Camera engine
  const [camera, setCamera] = useState(CAMERA_PRESETS[0].id);
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(5);
  const [look, setLook] = useState("none");
  const [fx, setFx] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [music, setMusic] = useState(false);
  const [quality, setQuality] = useState("720");
  // AI engine
  const [aiDuration, setAiDuration] = useState(5);
  const [resolution, setResolution] = useState<string | undefined>(undefined);
  const [audio, setAudio] = useState(false);
  const [useImage, setUseImage] = useState(true);
  // Run state
  const [busy, setBusy] = useState<"image" | "render" | "ai" | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ id: string; url: string; blob: Blob } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const sourceRef = useRef<Source | null>(null);
  sourceRef.current = source;

  const model: VideoModel | null = caps?.video.find((m) => m.id === engine) ?? null;
  const aiEnabled = !!caps?.videoEnabled;
  const imageList = items.filter((i) => i.kind === "image").slice(0, 14);

  // Picture handed over from the image studio.
  useEffect(() => {
    if (!initial) return;
    void imageSize(initial.blob).then(({ width, height }) => {
      replaceSource({ id: initial.id, blob: initial.blob, url: initial.url, width, height, name: initial.prompt || "Rasm", owned: false });
      setAspect(nearestAspect(width, height));
      setInputMode("image");
      setDone(null);
    });
    // Only react to a new hand-over, not to every render.
  }, [initial?.id]);

  useEffect(
    () => () => {
      abort.current?.abort();
      const s = sourceRef.current;
      if (s?.owned) URL.revokeObjectURL(s.url);
    },
    [],
  );

  // Seconds counter while an AI video is being made (it can take a minute or two).
  useEffect(() => {
    if (busy !== "ai") return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const replaceSource = (next: Source) => {
    const prev = sourceRef.current;
    if (prev?.owned && prev.url !== next.url) URL.revokeObjectURL(prev.url);
    setSource(next);
  };

  const pickGallery = async (item: GalleryItem) => {
    const { width, height } = await imageSize(item.blob);
    replaceSource({ id: item.id, blob: item.blob, url: item.url, width, height, name: item.prompt || "Rasm", owned: false });
    setAspect(nearestAspect(width, height));
    setDone(null);
    setError(null);
  };

  /** A ready-made picture from the idea list: becomes the source, with a fitting camera move and motion text. */
  const pickExample = async (e: GenExample) => {
    setError(null);
    try {
      const res = await fetch(exampleImage(e));
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const { width, height } = await imageSize(blob);
      replaceSource({ id: `ex-${e.id}`, blob, url: URL.createObjectURL(blob), width, height, name: e.title, owned: true });
      setAspect(nearestAspect(width, height));
      if (CAMERA_PRESETS.some((c) => c.id === e.camera)) setCamera(e.camera);
      setPrompt(e.motion);
      setDone(null);
    } catch {
      setError("Namuna rasmni yuklab bo'lmadi");
    }
  };

  /** Text mode: an idea fills the scene description. */
  const pickIdea = (e: GenExample) => setPrompt(e.prompt);

  const upload = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const { width, height } = await imageSize(file);
    replaceSource({ id: uid("up"), blob: file, url: URL.createObjectURL(file), width, height, name: file.name, owned: true });
    setAspect(nearestAspect(width, height));
    setDone(null);
    setError(null);
  };

  // ----- camera engine project -----
  const built = useMemo(() => {
    if (!source || engine !== "camera") return null;
    return buildCameraProject({ asset: sourceAsset(source), aspect, duration, camera, intensity, effect: fx, look, caption, music, name: prompt.trim().slice(0, 40) || source.name });
  }, [source, engine, aspect, duration, camera, intensity, fx, look, caption, music, prompt]);

  const fail = (err: unknown) => {
    if ((err as Error).name === "AbortError") return;
    setError((err as Error).message || "Xatolik yuz berdi");
  };

  /** Text mode, camera engine: make the picture first (free), then it becomes the source. */
  const makePicture = async () => {
    setBusy("image");
    setError(null);
    abort.current = new AbortController();
    try {
      const styled = `${prompt.trim()}, cinematic still, dramatic lighting, high detail`;
      const r = await generateImage({ prompt: styled, aspect, seed: randomSeed(), signal: abort.current.signal });
      const item = await onAdd({ id: uid("img"), kind: "image", createdAt: Date.now(), prompt: prompt.trim(), model: r.model, aspect, blob: r.blob, meta: { watermark: r.watermarked } });
      await pickGallery(item);
      setInputMode("image");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const exportMp4 = async () => {
    if (!built || !source) return;
    setBusy("render");
    setProgress(0);
    setError(null);
    abort.current = new AbortController();
    try {
      const blob = await renderToMp4(built.project, built.assets, Number(quality), setProgress, abort.current.signal);
      const item = await onAdd({
        id: uid("vid"),
        kind: "video",
        createdAt: Date.now(),
        prompt: prompt.trim() || source.name,
        model: "kamera",
        aspect,
        blob,
        meta: { camera: cameraById(camera).label, duration, quality: `${quality}p` },
      });
      downloadBlob(blob, `video-${item.id}.mp4`);
      setDone("MP4 yuklab olindi va galereyaga saqlandi.");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const openInEditor = async () => {
    try {
      if (engine === "camera" && built && source) {
        await stageForEditor(built.project, built.assets, { [sourceAsset(source).id]: source.blob });
      } else if (aiResult) {
        await stageVideoForEditor(aiResult.blob, prompt.trim() || "AI video");
      } else return;
      window.location.href = "/editor";
    } catch (err) {
      fail(err);
    }
  };

  const runAi = async () => {
    if (!model) return;
    setBusy("ai");
    setError(null);
    setAiResult(null);
    abort.current = new AbortController();
    try {
      const withImage = useImage && !!source && model.imageInput && !!caps?.imageToVideoUpload;
      const blob = await generateVideo({
        prompt: prompt.trim() || "slow cinematic camera movement",
        model: model.id,
        duration: Math.min(model.maxDuration, Math.max(model.minDuration, aiDuration)),
        aspect,
        resolution,
        audio: model.audio ? audio : undefined,
        image: withImage ? source!.blob : undefined,
        signal: abort.current.signal,
      });
      const id = uid("vid");
      const item = await onAdd({ id, kind: "video", createdAt: Date.now(), prompt: prompt.trim(), model: model.title, aspect, blob, meta: { duration: aiDuration, engine: "ai" } });
      setAiResult({ id, url: item.url, blob });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const estimate = model ? model.perSecond * Math.min(model.maxDuration, Math.max(model.minDuration, aiDuration)) + (model.audio && audio ? model.audioPerSecond * aiDuration : 0) : 0;

  // ----- controls -----
  const sourceBlock = (
    <Field label="Manba">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] mb-3">
        {(
          [
            ["image", "Rasmdan"],
            ["text", "Matndan"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setInputMode(id)} className={cn("h-8 rounded-lg text-[12.5px] font-medium", inputMode === id ? "bg-white text-black" : "text-white/60 hover:text-white")}>
            {label}
          </button>
        ))}
      </div>

      {inputMode === "image" ? (
        <>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0]).then(() => (e.target.value = ""))} />
          <button type="button" onClick={() => fileRef.current?.click()} className="shrink-0 size-[76px] rounded-xl border border-dashed border-white/20 hover:border-violet-400/70 grid place-items-center text-white/55 hover:text-white">
            <span className="text-center text-[10.5px] leading-tight">
              <ImagePlus className="size-5 mx-auto mb-0.5" />
              Yuklash
            </span>
          </button>
          {source && !imageList.some((i) => i.id === source.id) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={source.url} alt="" className="shrink-0 size-[76px] rounded-xl object-cover ring-2 ring-white" />
          )}
          {imageList.map((i) => (
            <button key={i.id} type="button" onClick={() => void pickGallery(i)} className={cn("shrink-0 size-[76px] rounded-xl overflow-hidden ring-2 transition", source?.id === i.id ? "ring-white" : "ring-transparent opacity-75 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-white/45">Tayyor materiallar — bosing, darhol videoga aylantiring</span>
          </div>
          <ExampleStrip onPick={(e) => void pickExample(e)} active={source?.id.startsWith("ex-") ? source.id.slice(3) : null} />
        </div>
        </>
      ) : (
        <>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={700}
          placeholder="Masalan: a lone astronaut walking on a red desert planet at sunset"
          className="w-full rounded-2xl bg-white/[0.04] ring-1 ring-white/10 focus:ring-violet-400/70 outline-none p-3.5 text-[14px] text-white placeholder:text-white/30 resize-none"
        />
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-white/45">G&apos;oyalar — bosing, prompt tayyor</span>
            <RandomIdea onPick={pickIdea} />
          </div>
          <ExampleStrip onPick={pickIdea} />
        </div>
        </>
      )}
    </Field>
  );

  const engineBlock = (
    <Field label="Dvigatel" hint={engine === "camera" ? "Tekin: rasm ustida virtual kamera harakati. Haqiqiy harakatlanuvchi (generativ) video uchun pullik AI modellardan birini tanlang." : undefined}>
      <div className="space-y-1.5">
        <button type="button" onClick={() => setEngine("camera")} className={cn("w-full text-left rounded-xl p-3 ring-1 flex items-center gap-3 transition", engine === "camera" ? "bg-white/10 ring-white" : "bg-white/[0.03] ring-white/10 hover:ring-white/30")}>
          <span className="size-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 grid place-items-center text-black">
            <Camera className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-white">Kamera harakati</span>
            <span className="block text-[11px] text-white/45">15 ta preset · brauzerda · tekin</span>
          </span>
          <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200">TEKIN</span>
        </button>
        {(caps?.video ?? []).map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={!aiEnabled}
            onClick={() => {
              setEngine(m.id);
              setAiDuration(m.defaultDuration);
              setResolution(m.resolutions[0]);
              setAudio(false);
            }}
            className={cn("w-full text-left rounded-xl p-3 ring-1 flex items-center gap-3 transition disabled:opacity-55", engine === m.id ? "bg-white/10 ring-white" : "bg-white/[0.03] ring-white/10 hover:ring-white/30 disabled:hover:ring-white/10")}
          >
            <span className="size-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white">{aiEnabled ? <Zap className="size-[18px]" /> : <Lock className="size-4" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-white truncate">{m.title}</span>
              <span className="block text-[11px] text-white/45 truncate">
                {m.publisher} · {m.minDuration === m.maxDuration ? `${m.minDuration}s` : `${m.minDuration}–${m.maxDuration}s`}
                {m.imageInput ? " · rasmdan" : ""}
                {m.audio ? " · ovozli" : ""}
              </span>
            </span>
            <span className="text-[11px] tabular-nums text-white/70">{fmtUsd(m.perSecond)}/s</span>
          </button>
        ))}
        {!aiEnabled && (
          <Notice tone="info">
            <b>AI video modellari pullik.</b> Yoqish uchun serverga <span className="font-mono">POLLINATIONS_API_KEY</span> va hisobga kredit (pollen) kerak. Narxlar taxminan: 5 soniyalik klip {fmtUsd((caps?.video[0]?.perSecond ?? 0.01) * 5)} dan boshlanadi. Hozircha kamera harakati to&apos;liq tekin ishlaydi.
          </Notice>
        )}
      </div>
    </Field>
  );

  const aspectBlock = (
    <Field label="Format">
      <Chips value={aspect} options={ASPECT_CHOICES} onChange={setAspect} />
    </Field>
  );

  const cameraControls = (
    <>
      <Field label="Kamera harakati" right={<span className="text-[10.5px] text-white/35">{cameraById(camera).hint}</span>}>
        <CameraGrid value={camera} onChange={setCamera} imageUrl={source?.url ?? null} intensity={intensity} />
      </Field>
      <Range label="Kuchi" value={intensity} min={0.4} max={1.6} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={setIntensity} />
      <Range label="Davomiylik" value={duration} min={3} max={12} step={1} format={(v) => `${v} s`} onChange={setDuration} />
      <Field label="Ranglar">
        <Chips value={look} options={LOOK_CHOICES} onChange={setLook} size="sm" />
      </Field>
      <Field label="Effekt">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFx(null)} className={cn("h-7 px-2.5 rounded-lg text-[11.5px] ring-1", fx === null ? "bg-white text-black ring-white font-semibold" : "ring-white/12 text-white/65 hover:ring-white/30")}>
            Yo&apos;q
          </button>
          {FX_CHOICES.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFx(id)} className={cn("h-7 px-2.5 rounded-lg text-[11.5px] ring-1", fx === id ? "bg-white text-black ring-white font-semibold" : "ring-white/12 text-white/65 hover:ring-white/30")}>
              {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Yozuv (ixtiyoriy)">
        <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={80} placeholder="Videoga qisqa matn" className="w-full h-10 rounded-xl bg-white/[0.04] ring-1 ring-white/10 focus:ring-violet-400/70 outline-none px-3 text-[13px] text-white placeholder:text-white/30" />
      </Field>
      <label className="flex items-center gap-2 text-[12.5px] text-white/75">
        <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} className="accent-violet-400" /> Fon musiqa qo&apos;shish
      </label>
      <Field label="MP4 sifati">
        <Chips value={quality} options={[["720", "720p"], ["1080", "1080p"]]} onChange={setQuality} />
      </Field>
    </>
  );

  const aiControls = model && (
    <>
      <Field label={model.imageInput ? "Harakat tavsifi" : "Prompt"} hint={model.description}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={700}
          placeholder={source && useImage ? "Masalan: the fox turns its head and snow falls slowly" : "Sahnani inglizcha tasvirlang"}
          className="w-full rounded-2xl bg-white/[0.04] ring-1 ring-white/10 focus:ring-violet-400/70 outline-none p-3.5 text-[14px] text-white placeholder:text-white/30 resize-none"
        />
      </Field>
      {model.imageInput && (
        <label className="flex items-center gap-2 text-[12.5px] text-white/75">
          <input type="checkbox" checked={useImage && !!caps?.imageToVideoUpload} disabled={!caps?.imageToVideoUpload} onChange={(e) => setUseImage(e.target.checked)} className="accent-violet-400" />
          Tanlangan rasmdan boshlash{!caps?.imageToVideoUpload && " (serverda Supabase kerak)"}
        </label>
      )}
      {model.maxDuration > model.minDuration && <Range label="Davomiylik" value={Math.min(aiDuration, model.maxDuration)} min={model.minDuration} max={model.maxDuration} format={(v) => `${v} s`} onChange={setAiDuration} />}
      {model.resolutions.length > 1 && (
        <Field label="Sifat">
          <Chips value={resolution ?? model.resolutions[0]} options={model.resolutions.map((r) => [r, r] as [string, string])} onChange={setResolution} />
        </Field>
      )}
      {model.audio && (
        <label className="flex items-center gap-2 text-[12.5px] text-white/75">
          <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} className="accent-violet-400" /> Ovoz bilan (qo&apos;shimcha {fmtUsd(model.audioPerSecond)}/s)
        </label>
      )}
      <Notice tone="info">
        Bu so&apos;rov serverdagi Pollinations kreditidan ishlaydi (taxminan {fmtUsd(estimate)}). Yaratish 30 soniyadan 2 daqiqagacha olishi mumkin.
      </Notice>
    </>
  );

  const controls = (
    <>
      {sourceBlock}
      {engineBlock}
      {aspectBlock}
      {engine === "camera" ? cameraControls : aiControls}
    </>
  );

  // ----- CTA -----
  const textCamera = engine === "camera" && inputMode === "text";
  const cta = (
    <div className="space-y-2">
      {error && <Notice tone="error">{error}</Notice>}
      {done && !error && (
        <Notice tone="info">
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-3.5" /> {done}
          </span>
        </Notice>
      )}
      {engine !== "camera" ? (
        <PrimaryButton onClick={() => void runAi()} busy={busy === "ai"} disabled={!aiEnabled || (!prompt.trim() && !(source && useImage))}>
          {busy === "ai" ? `Yaratilmoqda… ${elapsed} s` : (<><Sparkles className="size-4" /> Video yaratish · ≈{fmtUsd(estimate)}</>)}
        </PrimaryButton>
      ) : textCamera ? (
        <PrimaryButton onClick={() => void makePicture()} busy={busy === "image"} disabled={prompt.trim().length < 3}>
          {busy === "image" ? "Rasm yaratilmoqda…" : (<><Wand2 className="size-4" /> Rasm yaratib, kamera qo&apos;shish</>)}
        </PrimaryButton>
      ) : (
        <PrimaryButton onClick={() => void exportMp4()} busy={busy === "render"} disabled={!built}>
          {busy === "render" ? `MP4 tayyorlanmoqda… ${Math.round(progress * 100)}%` : (<><Download className="size-4" /> MP4 yuklab olish</>)}
        </PrimaryButton>
      )}
    </div>
  );

  // ----- canvas -----
  const hasPreview = (engine === "camera" && built) || (engine !== "camera" && (aiResult || busy === "ai"));
  const canvas = (
    <div className="flex flex-col min-h-[50dvh] lg:min-h-full lg:h-full p-4 lg:p-6 gap-3">
      <div className="relative flex-1 min-h-[340px] rounded-2xl bg-[radial-gradient(ellipse_at_center,#17171d,#0b0b0e_70%)] ring-1 ring-white/[0.06] overflow-hidden">
        {engine === "camera" && built ? (
          <FitPlayer project={built.project} assets={built.assets} />
        ) : engine !== "camera" && aiResult ? (
          <div className="absolute inset-0 grid place-items-center p-3">
            <video src={aiResult.url} controls autoPlay loop playsInline className="max-h-full max-w-full rounded-xl shadow-2xl" />
          </div>
        ) : busy === "ai" ? (
          <div className="absolute inset-0 grid place-items-center text-center p-6">
            <div>
              <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-[0_0_60px_-10px_rgba(217,70,239,0.9)]">
                <Loader2 className="size-7 text-white animate-spin" />
              </div>
              <p className="mt-4 text-[14px] font-semibold text-white">{model?.title} video yaratmoqda</p>
              <p className="mt-1 text-[12px] text-white/50 tabular-nums">{elapsed} soniya · odatda 30–120 soniya</p>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-center p-6">
            <div className="max-w-xs">
              <div className="mx-auto mb-3 size-14 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 grid place-items-center">
                <Clapperboard className="size-6 text-white/60" />
              </div>
              <p className="text-[14px] font-semibold text-white">{engine === "camera" ? (inputMode === "text" ? "Matn yozing — avval rasm yaratamiz" : "Rasm tanlang") : "Prompt yozib, video yarating"}</p>
              <p className="mt-1 text-[12px] text-white/45">{engine === "camera" ? "Rasm tanlangach shu yerda jonli preview paydo bo'ladi, har bir kamera harakatini darhol ko'rasiz." : "Natija shu yerda chiqadi va galereyaga saqlanadi."}</p>
            </div>
          </div>
        )}
      </div>
      {hasPreview && !busy && (
        <div className="flex flex-wrap items-center gap-2">
          {engine !== "camera" && aiResult && (
            <GhostButton onClick={() => downloadBlob(aiResult.blob, `ai-video-${aiResult.id}.mp4`)} active>
              <Download className="size-4" /> Yuklab olish
            </GhostButton>
          )}
          <GhostButton onClick={() => void openInEditor()}>
            <Save className="size-4" /> Editorda ochish
          </GhostButton>
          {engine === "camera" && <span className="text-[11px] text-white/35">Preview jonli: sozlamalarni o&apos;zgartirsangiz darhol yangilanadi.</span>}
        </div>
      )}
    </div>
  );

  return <ModeLayout canvas={canvas} controls={controls} cta={cta} />;
}
