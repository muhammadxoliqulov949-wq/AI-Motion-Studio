"use client";

import { Player } from "@remotion/player";
import {
  AudioLines,
  Braces,
  Check,
  ChevronLeft,
  Clapperboard,
  Film,
  Loader2,
  Music2,
  PenLine,
  Play,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { MontageApiError, releaseMontage, requestPlan, resolveMontage } from "./client";
import { MONTAGE_SIZES, MontageComposition, totalFrames } from "./composition/MontageComposition";
import { SAMPLE_MONTAGE } from "./sample";
import { TTS_VOICES, type MontageAspect, type ResolvedMontage, type TtsVoice } from "./types";

type Stage = "idle" | "script" | "voice" | "done" | "error";

const EXAMPLES = [
  "Muvaffaqiyatli insonlarning 5 ta ertalabki odati",
  "Samarqand — 3 daqiqada tarix",
  "Kofe haqida siz bilmagan 4 ta fakt",
  "Yangi boshlovchilar uchun yugurish bo'yicha maslahatlar",
];

const LENGTHS = [15, 30, 60];

export default function MontageStudio() {
  const [topic, setTopic] = useState("");
  const [aspect, setAspect] = useState<MontageAspect>("9:16");
  const [seconds, setSeconds] = useState(30);
  const [voice, setVoice] = useState<TtsVoice>("nova");
  const [stage, setStage] = useState<Stage>("idle");
  const [voiceProgress, setVoiceProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [montage, setMontage] = useState<ResolvedMontage | null>(null);
  const [showJson, setShowJson] = useState(false);
  const current = useRef<ResolvedMontage | null>(null);

  useEffect(() => () => releaseMontage(current.current), []);

  const setResult = (m: ResolvedMontage) => {
    releaseMontage(current.current);
    current.current = m;
    setMontage(m);
  };

  const busy = stage === "script" || stage === "voice";

  const generate = async (value = topic) => {
    if (!value.trim() || busy) return;
    setTopic(value);
    setError(null);
    setStage("script");
    try {
      const plan = await requestPlan({ topic: value, aspect, targetSeconds: seconds });
      setStage("voice");
      setVoiceProgress({ done: 0, total: plan.scenes.length });
      const resolved = await resolveMontage(plan, voice, (done, total) => setVoiceProgress({ done, total }));
      setResult(resolved);
      setStage("done");
    } catch (err) {
      setStage("error");
      setError(
        err instanceof MontageApiError && err.code === "no_api_key"
          ? "Serverda OPENAI_API_KEY sozlanmagan. Uni .env yoki Vercel Environment Variables'ga qo'shing. Hozircha “Demo” tugmasi bilan namunani ko'rishingiz mumkin."
          : (err as Error).message,
      );
    }
  };

  const showDemo = () => {
    setError(null);
    setResult({ ...SAMPLE_MONTAGE, aspect });
    setStage("done");
  };

  return (
    <div className="h-dvh overflow-y-auto bg-[#09090b] text-white panel-scroll">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,rgba(250,204,21,0.12),transparent)]" />
      <header className="relative z-10 h-14 flex items-center gap-3 px-4 sm:px-6 border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white">
          <ChevronLeft className="size-4" />
          <Logo size={26} />
        </Link>
        <span className="font-display font-bold">AI Montaj</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-200">Mavzudan video</span>
        <Link href="/editor" className="ml-auto text-xs text-white/50 hover:text-white">
          O&apos;z syomkangizni montaj qilish →
        </Link>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 grid lg:grid-cols-[400px_1fr] gap-8">
        <section className="space-y-5">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">Bitta mavzu — tayyor video.</h1>
            <p className="mt-2 text-sm text-white/55 leading-relaxed">
              AI ssenariy yozadi, stok kutubxonadan (Pixabay) fon videolar topadi, ovoz beradi, subtitr, shrift va tovush effektlarini qo&apos;yadi.
            </p>
          </div>

          <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-4 space-y-4">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Mavzu</span>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void generate();
                  }
                }}
                rows={3}
                maxLength={500}
                placeholder="Masalan: Kofe haqida siz bilmagan 4 ta fakt"
                className="mt-1.5 w-full rounded-xl bg-black/40 ring-1 ring-white/10 focus:ring-yellow-300/60 outline-none p-3 text-sm resize-none placeholder:text-white/25"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Format">
                <Segmented value={aspect} options={["9:16", "16:9"]} onChange={(v) => setAspect(v as MontageAspect)} />
              </Field>
              <Field label="Davomiylik">
                <Segmented value={String(seconds)} options={LENGTHS.map(String)} suffix="s" onChange={(v) => setSeconds(Number(v))} />
              </Field>
            </div>

            <Field label="Ovoz">
              <div className="flex flex-wrap gap-1.5">
                {TTS_VOICES.map((v) => (
                  <button
                    key={v}
                    onClick={() => setVoice(v)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] capitalize ring-1 transition-colors",
                      voice === v ? "bg-yellow-300/15 ring-yellow-300/60 text-white" : "ring-white/10 text-white/55 hover:text-white",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </Field>

            <div className="flex gap-2">
              <button
                onClick={() => void generate()}
                disabled={!topic.trim() || busy}
                className="flex-1 h-11 rounded-xl bg-yellow-300 text-black font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-yellow-200 disabled:opacity-40 disabled:hover:bg-yellow-300"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy ? "Yaratilmoqda…" : "Video yaratish"}
              </button>
              <button
                onClick={showDemo}
                disabled={busy}
                className="h-11 px-4 rounded-xl ring-1 ring-white/15 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40"
                title="API chaqirmasdan namuna"
              >
                Demo
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Misollar</div>
            {EXAMPLES.map((e) => (
              <button
                key={e}
                disabled={busy}
                onClick={() => void generate(e)}
                className="w-full text-left rounded-lg px-3 py-2 text-[12px] text-white/70 bg-white/[0.02] ring-1 ring-white/[0.06] hover:bg-yellow-300/10 hover:ring-yellow-300/30 hover:text-white disabled:opacity-40"
              >
                <Wand2 className="inline size-3 mr-1.5 text-yellow-300" />
                {e}
              </button>
            ))}
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <Pipeline stage={stage} voiceProgress={voiceProgress} />
          {error && (
            <div className="flex gap-2 rounded-xl bg-rose-500/10 ring-1 ring-rose-400/30 p-3 text-sm text-rose-200">
              <TriangleAlert className="size-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {montage ? (
            <Result montage={montage} showJson={showJson} onToggleJson={() => setShowJson(!showJson)} />
          ) : (
            <EmptyState />
          )}
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Segmented({ value, options, onChange, suffix = "" }: { value: string; options: string[]; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div className="flex rounded-lg bg-black/40 p-0.5 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn("flex-1 py-1.5 rounded-md text-xs font-medium", value === o ? "bg-white text-black" : "text-white/55 hover:text-white")}
        >
          {o}
          {suffix}
        </button>
      ))}
    </div>
  );
}

const STEPS = [
  { key: "script", label: "Ssenariy va kadrlar", detail: "OpenAI", icon: PenLine },
  { key: "footage", label: "Fon videolar", detail: "Pixabay", icon: Film },
  { key: "voice", label: "Ovoz (TTS)", detail: "OpenAI", icon: AudioLines },
  { key: "mix", label: "Montaj va miks", detail: "Remotion", icon: Clapperboard },
] as const;

function Pipeline({ stage, voiceProgress }: { stage: Stage; voiceProgress: { done: number; total: number } }) {
  if (stage === "idle") return null;
  // The plan request covers script + footage; voices come next; mixing is instant.
  const doneCount = stage === "script" ? 0 : stage === "voice" ? 2 : stage === "done" ? 4 : 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const done = i < doneCount;
        const active = !done && stage !== "error" && stage !== "done" && (i === doneCount || (stage === "script" && i === 1));
        return (
          <div
            key={s.key}
            className={cn(
              "rounded-xl p-3 ring-1 transition-colors",
              done ? "bg-emerald-500/10 ring-emerald-400/25" : active ? "bg-yellow-300/10 ring-yellow-300/30" : "bg-white/[0.02] ring-white/[0.06]",
            )}
          >
            <div className="flex items-center gap-1.5">
              {done ? (
                <Check className="size-3.5 text-emerald-300" />
              ) : active ? (
                <Loader2 className="size-3.5 text-yellow-300 animate-spin" />
              ) : (
                <s.icon className="size-3.5 text-white/30" />
              )}
              <span className="text-[12px] font-medium">{s.label}</span>
            </div>
            <div className="mt-0.5 text-[10px] text-white/40">
              {s.key === "voice" && stage === "voice" ? `${voiceProgress.done}/${voiceProgress.total} kadr` : s.detail}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="aspect-video lg:aspect-auto lg:h-[560px] rounded-2xl ring-1 ring-dashed ring-white/10 bg-white/[0.02] grid place-items-center text-center p-8">
      <div>
        <Play className="size-8 mx-auto text-white/20" />
        <p className="mt-3 text-sm text-white/45">Mavzu yozing va “Video yaratish”ni bosing.</p>
        <p className="mt-1 text-xs text-white/30">Yoki API kalitlarsiz natijani ko&apos;rish uchun “Demo”.</p>
      </div>
    </div>
  );
}

function Result({ montage, showJson, onToggleJson }: { montage: ResolvedMontage; showJson: boolean; onToggleJson: () => void }) {
  const size = MONTAGE_SIZES[montage.aspect];
  const inputProps = useMemo(() => ({ montage }), [montage]);
  const frames = totalFrames(montage);
  const vertical = montage.aspect === "9:16";
  const credits = montage.scenes.filter((s) => s.footage);

  return (
    <div className={cn("grid gap-5", vertical ? "md:grid-cols-[minmax(0,320px)_1fr]" : "grid-cols-1")}>
      <div className="space-y-2">
        <div className="rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black shadow-2xl">
          <Player
            component={MontageComposition}
            inputProps={inputProps}
            durationInFrames={frames}
            fps={montage.fps}
            compositionWidth={size.width}
            compositionHeight={size.height}
            style={{ width: "100%", aspectRatio: `${size.width} / ${size.height}` }}
            controls
            acknowledgeRemotionLicense
          />
        </div>
        <div className="text-[11px] text-white/40 flex flex-wrap gap-x-3">
          <span>{(frames / montage.fps).toFixed(1)} s</span>
          <span>{montage.scenes.length} kadr</span>
          <span className="inline-flex items-center gap-1">
            <Music2 className="size-3" /> lofi BGM
          </span>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold leading-tight">{montage.title}</h2>
            <p className="text-xs text-white/40 mt-0.5">{montage.topic}</p>
          </div>
          <button onClick={onToggleJson} className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-white/60 hover:text-white bg-white/5 hover:bg-white/10">
            <Braces className="size-3" /> {showJson ? "Kadrlar" : "JSON"}
          </button>
        </div>

        {montage.warnings.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-400/20 p-2.5 space-y-1">
            {montage.warnings.map((w, i) => (
              <div key={i} className="flex gap-1.5 text-[11px] text-amber-200/90">
                <TriangleAlert className="size-3.5 shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}

        {showJson ? (
          <pre className="max-h-[520px] overflow-auto rounded-xl bg-black/50 ring-1 ring-white/10 p-3 text-[11px] leading-relaxed font-mono text-white/70 panel-scroll">
            {JSON.stringify(montage, (k, v) => (k === "voiceSrc" && typeof v === "string" ? "<audio>" : v), 2)}
          </pre>
        ) : (
          <ol className="space-y-2">
            {montage.scenes.map((s, i) => (
              <li key={i} className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.07] p-3">
                <div className="flex items-center gap-2 text-[11px] text-white/40">
                  <span className="size-5 rounded-md bg-white/10 grid place-items-center text-white/80 font-semibold">{i + 1}</span>
                  <span>{(s.durationInFrames / montage.fps).toFixed(1)}s</span>
                  <Chip>{s.animation_type}</Chip>
                  <Chip>sfx: {s.sfx_type}</Chip>
                  {s.voiceSrc ? <Chip tone="ok">ovoz</Chip> : s.narration ? <Chip tone="warn">ovozsiz</Chip> : null}
                </div>
                <div className="mt-1.5 text-sm font-semibold text-white">{s.text}</div>
                {s.narration && <div className="mt-0.5 text-[12px] text-white/55 leading-snug">{s.narration}</div>}
                <div className="mt-1.5 text-[11px] text-white/35">
                  🔎 {s.visual_search_query}
                  {s.footage ? (
                    <>
                      {" · "}
                      <a href={s.footage.pexelsUrl} target="_blank" rel="noreferrer" className="underline hover:text-white/70">
                        {s.footage.author} / {s.footage.pexelsUrl.includes("pixabay") ? "Pixabay" : "Pexels"}
                      </a>
                    </>
                  ) : (
                    " · gradient fon"
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {credits.length > 0 && <p className="text-[10px] text-white/30">Fon videolar: Pixabay / Pexels (bepul tijoriy litsenziya).</p>}
      </div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <span
      className={cn(
        "px-1.5 py-px rounded text-[10px]",
        tone === "ok" ? "bg-emerald-500/15 text-emerald-300" : tone === "warn" ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-white/50",
      )}
    >
      {children}
    </span>
  );
}
