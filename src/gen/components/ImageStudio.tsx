"use client";

import { Clapperboard, Download, Lock, LockOpen, Shuffle, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AspectRatio } from "@/editor/types";
import { uid } from "@/editor/utils";
import { downloadBlob } from "../export";
import { type GenCaps, GenError, generateImage, GEN_SIZES, randomSeed } from "../client";
import type { GalleryItem } from "../useGallery";
import type { GenItem } from "../store";
import { type Attachment, describeMaterials } from "../attachments";
import type { GenExample } from "../examples";
import { PromptBox } from "./PromptBox";
import { ExampleGallery, ExampleStrip, PromptBoosters, RandomIdea } from "./Examples";
import { Chips, Field, Notice, PrimaryButton, GhostButton } from "./kit";
import { ModeLayout } from "./ModeLayout";

interface StylePreset {
  id: string;
  label: string;
  prompt: string;
  swatch: string;
}

/** Visual styles: the English phrase is appended to the prompt (image models follow English best). */
const STYLES: StylePreset[] = [
  { id: "none", label: "Oddiy", prompt: "", swatch: "linear-gradient(135deg,#27272a,#52525b)" },
  { id: "cinema", label: "Kino", prompt: "cinematic still, dramatic lighting, shallow depth of field, 35mm film grain", swatch: "linear-gradient(135deg,#0f766e,#f97316)" },
  { id: "photo", label: "Foto", prompt: "ultra realistic photograph, natural light, fine detail, 85mm lens", swatch: "linear-gradient(135deg,#0ea5e9,#e0f2fe)" },
  { id: "portrait", label: "Portret", prompt: "studio portrait, soft key light, detailed skin texture, sharp focus", swatch: "linear-gradient(135deg,#be185d,#fbcfe8)" },
  { id: "anime", label: "Anime", prompt: "anime style illustration, vibrant colors, clean line art, detailed background", swatch: "linear-gradient(135deg,#7c3aed,#f0abfc)" },
  { id: "3d", label: "3D", prompt: "3D render, soft studio lighting, glossy materials, octane render", swatch: "linear-gradient(135deg,#4f46e5,#22d3ee)" },
  { id: "fantasy", label: "Fantaziya", prompt: "epic fantasy concept art, volumetric light, intricate detail, painterly", swatch: "linear-gradient(135deg,#065f46,#fbbf24)" },
  { id: "product", label: "Mahsulot", prompt: "product photography, clean seamless background, softbox lighting, commercial quality", swatch: "linear-gradient(135deg,#e4e4e7,#a1a1aa)" },
  { id: "neon", label: "Neon", prompt: "cyberpunk neon city at night, rain reflections, vivid magenta and cyan lights", swatch: "linear-gradient(135deg,#db2777,#06b6d4)" },
  { id: "retro", label: "Retro", prompt: "vintage 90s film photograph, grain, faded warm colors", swatch: "linear-gradient(135deg,#b45309,#fde68a)" },
];

const ASPECTS: [AspectRatio, string][] = [
  ["9:16", "9:16 Reels"],
  ["16:9", "16:9 YouTube"],
  ["1:1", "1:1 Post"],
  ["4:5", "4:5 Portret"],
];

const sizeOf = (a: AspectRatio) => {
  const [w, h] = GEN_SIZES[a] ?? [1024, 1024];
  return w / h;
};

/** Text → image. Everything generated lands in the gallery. */
export function ImageStudio({
  caps,
  items,
  onAdd,
  onRemove,
  onToVideo,
}: {
  caps: GenCaps | null;
  items: GalleryItem[];
  onAdd: (item: GenItem) => Promise<GalleryItem>;
  onRemove: (id: string) => void;
  onToVideo: (item: GalleryItem) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState("cinema");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [model, setModel] = useState<string | undefined>(undefined);
  const [count, setCount] = useState(1);
  const [seed, setSeed] = useState(() => randomSeed());
  const [lockSeed, setLockSeed] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [session, setSession] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [describing, setDescribing] = useState(false);
  const attachRef = useRef(attachments);
  attachRef.current = attachments;
  useEffect(() => () => attachRef.current.forEach((a) => a.thumb && URL.revokeObjectURL(a.thumb)), []);
  const abort = useRef<AbortController | null>(null);

  // Count down after a "free limit" answer so the user knows when to retry.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => () => abort.current?.abort(), []);

  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
  const imageModels = caps?.image ?? [];
  const activeModel = model ?? imageModels[0]?.id;
  const hasKey = !!caps?.hasKey;
  // Without a key the public endpoint allows one image per 45 s: more than one makes no sense.
  const maxCount = hasKey ? 4 : 1;
  const results = session.map((id) => items.find((i) => i.id === id)).filter((i): i is GalleryItem => !!i);
  const current = results.find((i) => i.id === selected) ?? results[0] ?? null;

  /** AI reads the attached materials (and the user's words) and writes the prompt. */
  const describe = async () => {
    if (!attachments.length || describing) return null;
    setDescribing(true);
    setError(null);
    try {
      const written = await describeMaterials(prompt.trim(), attachments, hasKey);
      setPrompt(written);
      setPicked(null);
      return written;
    } catch (err) {
      const e = err as GenError;
      setError(e.message || "Materiallarni o'qib bo'lmadi");
      if (e.code === "free_limit" && e.retryAfter) setWait(e.retryAfter);
      return null;
    } finally {
      setDescribing(false);
    }
  };

  /** Attached picture or video frame → Video tab as the source. */
  const useAsVideo = (a: Attachment) => {
    if (!a.blob || !a.thumb) return;
    onToVideo({ id: `att-${a.id}`, kind: "image", createdAt: Date.now(), prompt: a.name, model: "material", aspect: "", blob: a.blob, url: a.thumb });
  };

  const run = async () => {
    // Only materials, no words: let AI write the prompt first.
    const text = prompt.trim().length >= 3 ? prompt.trim() : attachments.length ? ((await describe()) ?? "") : "";
    if (text.length < 3 || busy) return;
    setError(null);
    abort.current = new AbortController();
    const total = Math.min(count, maxCount);
    setBusy({ done: 0, total });
    const styled = style.prompt ? `${text}, ${style.prompt}` : text;
    try {
      for (let i = 0; i < total; i++) {
        const s = lockSeed ? seed : randomSeed();
        const r = await generateImage({ prompt: styled, model: activeModel, aspect, seed: s, signal: abort.current.signal });
        const item = await onAdd({
          id: uid("img"),
          kind: "image",
          createdAt: Date.now(),
          prompt: text,
          model: r.model,
          aspect,
          blob: r.blob,
          meta: { style: style.id, seed: s, watermark: r.watermarked },
        });
        setSession((ids) => [item.id, ...ids]);
        setSelected(item.id);
        setBusy({ done: i + 1, total });
        // The keyless endpoint allows one image per 45 s: show the countdown instead of a failing retry.
        if (r.watermarked) setWait(45);
      }
      if (!lockSeed) setSeed(randomSeed());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const e = err as GenError;
      setError(e.message || "Rasm yaratib bo'lmadi");
      if (e.code === "free_limit" && e.retryAfter) setWait(e.retryAfter);
    } finally {
      setBusy(null);
    }
  };

  /** Loads an idea: prompt, style and format in one go. */
  const pickExample = (e: GenExample) => {
    setPrompt(e.prompt);
    setStyleId(STYLES.some((s) => s.id === e.style) ? e.style : "none");
    setAspect(e.aspect);
    setPicked(e.id);
    setError(null);
  };

  const canGenerate = (prompt.trim().length >= 3 || attachments.length > 0) && !busy && !describing && wait <= 0;

  const controls = (
    <>
      {!hasKey && caps && (
        <Notice tone="info">
          <b>Sinov rejimi:</b> server kalitsiz ishlayapti — barcha foydalanuvchilar uchun 45 soniyada 1 ta rasm va burchagida kichik «pollinations.ai» belgisi. Cheklovsiz va belgisiz ishlashi uchun serverga bepul <span className="font-mono">POLLINATIONS_API_KEY</span> qo&apos;shing (enter.pollinations.ai).
        </Notice>
      )}
      <Field label="Nimani yaratamiz?" hint="«+» orqali rasm, video yoki hujjat (PDF, Word, TXT) qo'shing — AI ularni o'qib prompt yozadi. O'zingiz yozsangiz, inglizcha yaxshiroq chiqadi.">
        <PromptBox
          value={prompt}
          onChange={(v) => {
            setPrompt(v);
            setPicked(null);
          }}
          placeholder="Masalan: a red fox walking through a snowy forest at dawn — yoki «+» bilan rasm, video, hujjat qo'shing"
          attachments={attachments}
          onAttachments={setAttachments}
          onDescribe={() => void describe()}
          describing={describing}
          onUseAsVideo={useAsVideo}
        />
        <div className="mt-2.5">
          <PromptBoosters prompt={prompt} onChange={setPrompt} />
        </div>
      </Field>

      <Field label="Namunalar" right={<RandomIdea onPick={pickExample} />} hint="Bosing — prompt, uslub va format tayyor bo'ladi. Xohlasangiz matnni o'zgartiring.">
        <ExampleStrip onPick={pickExample} active={picked} />
      </Field>

      <Field label="Uslub">
        <div className="grid grid-cols-5 gap-1.5">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyleId(s.id)}
              title={s.prompt || "Qo'shimcha so'zlarsiz"}
              className={cn("group rounded-xl p-1 ring-1 text-center transition", styleId === s.id ? "ring-white bg-white/10" : "ring-white/10 hover:ring-white/30")}
            >
              <span className="block h-9 rounded-lg" style={{ background: s.swatch }} />
              <span className="block mt-1 text-[10.5px] text-white/75 truncate">{s.label}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Format">
        <Chips value={aspect} options={ASPECTS} onChange={setAspect} />
      </Field>

      {imageModels.length > 1 && (
        <Field label="Model">
          <select
            value={activeModel}
            onChange={(e) => setModel(e.target.value)}
            className="w-full h-10 rounded-xl bg-white/[0.04] ring-1 ring-white/10 text-[13px] text-white px-3 outline-none"
            disabled={!hasKey}
          >
            {imageModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} · {m.publisher}
              </option>
            ))}
          </select>
          {!hasKey && <p className="mt-1.5 text-[11px] text-white/35">Modelni tanlash uchun server kaliti kerak; hozir standart model ishlatiladi.</p>}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Soni">
          <Chips value={String(Math.min(count, maxCount))} options={[1, 2, 3, 4].filter((n) => n <= maxCount).map((n) => [String(n), String(n)] as [string, string])} onChange={(v) => setCount(Number(v))} />
        </Field>
        <Field label="Seed" right={<span className="text-[10.5px] text-white/35 tabular-nums">{lockSeed ? seed : "tasodifiy"}</span>}>
          <div className="flex gap-1.5">
            <GhostButton onClick={() => setLockSeed((v) => !v)} active={lockSeed} title="Seedni qulflash: bir xil uslubda takrorlash">
              {lockSeed ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />} {lockSeed ? "Qulf" : "Ochiq"}
            </GhostButton>
            <GhostButton onClick={() => setSeed(randomSeed())} title="Yangi seed">
              <Shuffle className="size-3.5" />
            </GhostButton>
          </div>
        </Field>
      </div>
    </>
  );

  const cta = (
    <div className="space-y-2">
      {error && <Notice tone="error">{error}{wait > 0 ? ` (${wait} s)` : ""}</Notice>}
      <PrimaryButton onClick={() => void run()} busy={!!busy} disabled={!canGenerate}>
        {busy ? `Yaratilmoqda… ${busy.done}/${busy.total}` : wait > 0 ? `${wait} soniyadan keyin` : (<><Sparkles className="size-4" /> Rasm yaratish</>)}
      </PrimaryButton>
    </div>
  );

  const canvas = (
    <div className="p-4 lg:p-6 min-h-[44dvh] lg:min-h-full flex flex-col gap-4">
      {current ? (
        <>
          <div className="flex-1 min-h-[300px] grid place-items-center rounded-2xl bg-[radial-gradient(ellipse_at_center,#17171d,#0b0b0e_70%)] ring-1 ring-white/[0.06] p-3 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={current.prompt} className="max-h-[62dvh] lg:max-h-[68vh] max-w-full rounded-xl shadow-2xl object-contain" style={{ aspectRatio: sizeOf(current.aspect as AspectRatio) }} />
            {busy && <div className="absolute inset-3 rounded-xl ai-scan pointer-events-none" />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GhostButton onClick={() => onToVideo(current)} active>
              <Clapperboard className="size-4" /> Videoga aylantirish
            </GhostButton>
            <GhostButton onClick={() => downloadBlob(current.blob, `rasm-${current.id}.${current.blob.type.includes("png") ? "png" : "jpg"}`)}>
              <Download className="size-4" /> Yuklab olish
            </GhostButton>
            <GhostButton
              onClick={() => {
                setPrompt(current.prompt);
                if (typeof current.meta?.seed === "number") {
                  setSeed(current.meta.seed);
                  setLockSeed(true);
                }
              }}
              title="Promptni va seedni qayta yuklash"
            >
              <Wand2 className="size-4" /> Shu promptni olish
            </GhostButton>
            <GhostButton
              onClick={() => {
                onRemove(current.id);
                setSession((ids) => ids.filter((i) => i !== current.id));
              }}
            >
              <Trash2 className="size-4" />
            </GhostButton>
            {current.meta?.watermark === true && <span className="text-[11px] text-amber-200/70">belgi bor (bepul rejim)</span>}
          </div>
          {results.length > 1 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {results.map((r) => (
                <button key={r.id} onClick={() => setSelected(r.id)} className={cn("shrink-0 h-16 rounded-lg overflow-hidden ring-2", r.id === current.id ? "ring-white" : "ring-transparent opacity-70 hover:opacity-100")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt="" className="h-full w-auto object-cover" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 grid place-items-center">
          {busy ? (
            <div className="text-center">
              <div className="mx-auto mb-4 w-44 aspect-[9/16] rounded-2xl bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-orange-400/20 ring-1 ring-white/10 shimmer-text animate-pulse" />
              <p className="text-[13px] text-white/60">Rasm yaratilmoqda…</p>
            </div>
          ) : (
            <div className="max-w-2xl w-full">
              <div className="text-center mb-5">
                <div className="mx-auto mb-3 size-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-[0_0_50px_-10px_rgba(217,70,239,0.8)]">
                  <Sparkles className="size-6 text-white" />
                </div>
                <h2 className="text-[18px] font-bold text-white font-display">Tasavvuringizni rasmga aylantiring</h2>
                <p className="text-[12.5px] text-white/45 mt-1">G&apos;oyalardan birini tanlang yoki o&apos;zingiz yozing. Keyin uni videoga aylantirasiz.</p>
              </div>
              <ExampleGallery onPick={pickExample} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return <ModeLayout canvas={canvas} controls={controls} cta={cta} />;
}
