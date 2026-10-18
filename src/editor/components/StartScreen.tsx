"use client";

import { Player, Thumbnail } from "@remotion/player";
import { ArrowLeft, Check, Clapperboard, FilePlus2, Film, MessageSquareText, Play, RotateCcw, Sparkles, TriangleAlert, Upload, Wand2, X, Zap } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TimelineComposition } from "../composition/TimelineComposition";
import { createInitialProject } from "../ops";
import { ASPECTS } from "../presets";
import { QUICK_STYLES, type QuickStyle, runQuickMontage } from "../quick-montage";
import { useEditor } from "../store";
import { emptyProject, PROJECT_TEMPLATES } from "../templates";
import type { MediaAsset, Project } from "../types";
import { projectDuration } from "../utils";

/**
 * "Qayerdan boshlaysiz?" — the first thing a new user sees (and the "Yangi" button later):
 * one-click AI montage, AI chat, blank / demo project, and ready templates with live previews.
 * Full screen on phones, a large dialog on desktop. Every start is undoable (Ctrl+Z / ↶).
 */
export function StartScreen({ open, onClose, onOpenAi }: { open: boolean; onClose: () => void; onOpenAi?: () => void }) {
  const [view, setView] = useState<"home" | "quick">("home");
  if (!open) return null;
  const close = () => {
    setView("home");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 sm:grid sm:place-items-center bg-black/75 backdrop-blur-sm sm:p-4" onClick={close}>
      <div
        className="relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-[980px] overflow-y-auto panel-scroll sm:rounded-2xl bg-[#101014] sm:ring-1 ring-white/10 shadow-2xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={close} className="absolute top-3 right-3 z-10 size-9 grid place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 mt-[env(safe-area-inset-top)]" title="Yopish">
          <X className="size-5" />
        </button>
        {view === "home" ? (
          <Home
            onQuick={() => setView("quick")}
            onAi={() => {
              close();
              onOpenAi?.();
            }}
            onDone={close}
          />
        ) : (
          <QuickMontage onBack={() => setView("home")} onDone={close} onOpenAi={onOpenAi} />
        )}
      </div>
    </div>
  );
}

// ---------------- Home ----------------

function Home({ onQuick, onAi, onDone }: { onQuick: () => void; onAi: () => void; onDone: () => void }) {
  const { assets, commit, addAssets, select } = useEditor();
  const start = (build: () => { project: Project; assets?: MediaAsset[] }) => {
    const r = build();
    if (r.assets?.length) addAssets(r.assets);
    commit(r.project);
    select(null);
    onDone();
  };

  return (
    <div className="p-4 sm:p-7">
      <div className="pr-10">
        <h2 className="text-[22px] sm:text-[26px] font-bold text-white tracking-tight font-display">Qayerdan boshlaysiz?</h2>
        <p className="text-[12.5px] text-white/50 mt-1">Videongizni tashlang — qolganini AI qiladi. Yoki tayyor shablondan boshlang.</p>
      </div>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-[1.4fr_1fr_1fr]">
        <button
          onClick={onQuick}
          className="group relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left bg-gradient-to-br from-violet-600 via-fuchsia-600 to-orange-500 shadow-[0_20px_60px_-20px_rgba(217,70,239,0.7)] hover:brightness-110 transition sm:row-span-2"
        >
          <div className="absolute -right-6 -bottom-8 text-[120px] opacity-15 rotate-12 select-none">⚡</div>
          <Zap className="size-6 text-white mb-3" />
          <div className="text-[17px] font-bold text-white">Bir bosishda AI montaj</div>
          <p className="text-[12px] text-white/85 mt-1 leading-relaxed max-w-[320px]">Videolaringizni tanlang, uslubni bosing — 30 soniyada musiqa, kesish, subtitr va ranglar bilan tayyor video.</p>
          <div className="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-white text-black text-[13px] font-semibold">
            <Upload className="size-4" /> Boshlash
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {QUICK_STYLES.map((s) => (
              <span key={s.id} className="px-2 py-0.5 rounded-full bg-black/20 text-[10.5px] text-white/90">
                {s.emoji} {s.label}
              </span>
            ))}
          </div>
        </button>
        <ActionCard icon={MessageSquareText} title="AI bilan yozish" text="Nima xohlaysiz — oddiy so'z bilan ayting" accent onClick={onAi} />
        <ActionCard icon={Clapperboard} title="Demo bilan sinash" text="4 ta xom klip — AI'ni sinab ko'ring" onClick={() => start(() => ({ project: createInitialProject(assets) }))} />
        <ActionCard icon={FilePlus2} title="Bo'sh loyiha" text="Hammasini o'zim qilaman" onClick={() => start(() => ({ project: emptyProject() }))} />
        <ActionCard icon={RotateCcw} title="Davom etish" text="Oxirgi loyihaga qaytish" onClick={onDone} />
      </div>

      <div className="mt-7 flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold text-white">Tayyor shablonlar</h3>
        <span className="hidden sm:inline text-[10.5px] text-white/35">Ko&apos;rish uchun kursorni olib boring · klip ustidan o&apos;z videongiz bilan almashtiring</span>
      </div>
      <TemplateGallery onPick={(t) => start(() => t.build(assets))} />
    </div>
  );
}

function ActionCard({ icon: Icon, title, text, onClick, accent }: { icon: typeof Film; title: string; text: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl p-3.5 text-left ring-1 transition flex sm:flex-col gap-3 sm:gap-2 items-center sm:items-start",
        accent ? "bg-violet-500/10 ring-violet-400/30 hover:bg-violet-500/15" : "bg-white/[0.03] ring-white/[0.08] hover:bg-white/[0.06]",
      )}
    >
      <span className={cn("size-9 shrink-0 rounded-xl grid place-items-center", accent ? "bg-violet-500/25 text-violet-200" : "bg-white/[0.06] text-white/70")}>
        <Icon className="size-[18px]" />
      </span>
      <span>
        <span className="block text-[13px] font-semibold text-white">{title}</span>
        <span className="block text-[11px] text-white/45 leading-snug">{text}</span>
      </span>
    </button>
  );
}

// ---------------- Templates with live previews ----------------

type Template = (typeof PROJECT_TEMPLATES)[number];

function TemplateGallery({ onPick }: { onPick: (t: Template) => void }) {
  const { assets } = useEditor();
  // Built once per open from the demo footage, so the previews play instantly.
  const built = useMemo(() => PROJECT_TEMPLATES.map((t) => ({ t, ...t.build(assets) })), [assets]);
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
      {built.map(({ t, project, assets: extra }) => (
        <TemplateCard key={t.id} template={t} project={project} assets={[...assets, ...extra]} onPick={() => onPick(t)} />
      ))}
    </div>
  );
}

function TemplateCard({ template, project, assets, onPick }: { template: Template; project: Project; assets: MediaAsset[]; onPick: () => void }) {
  const [hover, setHover] = useState(false);
  const { width, height } = ASPECTS[project.aspect];
  const fps = project.fps;
  const durationInFrames = Math.max(fps, Math.ceil(projectDuration(project) * fps));
  const inputProps = useMemo(() => ({ project, assets }), [project, assets]);
  const common = { component: TimelineComposition, inputProps, durationInFrames, fps, compositionWidth: width, compositionHeight: height, style: { width: "100%", height: "100%" } };
  return (
    <button
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group text-left rounded-xl overflow-hidden ring-1 ring-white/[0.08] hover:ring-cyan-300/60 bg-[#16161b] transition"
    >
      <div className="relative aspect-[4/5] bg-black">
        {hover ? (
          <Player {...common} autoPlay loop initiallyMuted acknowledgeRemotionLicense />
        ) : (
          <Thumbnail {...common} frameToDisplay={Math.min(durationInFrames - 1, Math.round(fps * 1.6))} />
        )}
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/65 text-[10px] text-white/85">{template.aspect}</span>
      </div>
      <div className="p-2.5">
        <div className="text-[12.5px] font-semibold text-white">
          {template.emoji} {template.label}
        </div>
        <div className="text-[10.5px] text-white/45 leading-snug line-clamp-2">{template.description}</div>
      </div>
    </button>
  );
}

// ---------------- One-click montage ----------------

const DURATIONS: [number | null, string][] = [
  [null, "Avto"],
  [15, "15 s"],
  [30, "30 s"],
  [60, "60 s"],
];

function QuickMontage({ onBack, onDone, onOpenAi }: { onBack: () => void; onDone: () => void; onOpenAi?: () => void }) {
  const { assets, commit, addAssets, select } = useEditor();
  const [style, setStyle] = useState<QuickStyle>(QUICK_STYLES[0]);
  const [seconds, setSeconds] = useState<number | null>(15);
  const [files, setFiles] = useState<File[]>([]);
  const [reference, setReference] = useState<File | null>(null);
  const [phase, setPhase] = useState<{ kind: "form" } | { kind: "running"; label: string; progress?: number } | { kind: "done"; reply: string; steps: number; local: boolean } | { kind: "error"; message: string }>({ kind: "form" });
  const filesRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const needsRef = style.id === "reference";

  const run = async () => {
    setPhase({ kind: "running", label: "Tayyorlanmoqda…" });
    try {
      const demo = assets.filter((a) => a.scene || a.origin === "demo");
      const r = await runQuickMontage({ style, seconds, files, reference, demoAssets: demo, onStep: (label, progress) => setPhase({ kind: "running", label, progress }) });
      if (r.assets.length) addAssets(r.assets);
      commit(r.project);
      select(null);
      const done = r.steps.filter((s) => !s.warning).length;
      setPhase({ kind: "done", reply: r.reply ?? `Tayyor! ${done} ta montaj qadami bajarildi.`, steps: done, local: r.mode === "local" });
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message || "Montaj bajarilmadi" });
    }
  };

  if (phase.kind === "running") {
    return (
      <div className="p-6 sm:p-10 min-h-[60vh] grid place-items-center text-center">
        <div className="max-w-sm">
          <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-[0_0_60px_-10px_rgba(217,70,239,0.9)]">
            <Wand2 className="size-7 text-white animate-pulse" />
          </div>
          <div className="mt-5 text-[16px] font-semibold text-white">{style.emoji} {style.label} montaj qilinmoqda</div>
          <div className="mt-1.5 text-[12.5px] text-white/60 shimmer-text">{phase.label}</div>
          {phase.progress !== undefined && (
            <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-[width]" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
            </div>
          )}
          <p className="mt-4 text-[11px] text-white/35">Fayllaringiz brauzerda qayta ishlanadi.</p>
        </div>
      </div>
    );
  }

  if (phase.kind === "done") {
    return (
      <div className="p-6 sm:p-10 min-h-[50vh] grid place-items-center text-center">
        <div className="max-w-md">
          <div className="mx-auto size-14 rounded-full bg-emerald-500/20 grid place-items-center">
            <Check className="size-7 text-emerald-300" />
          </div>
          <div className="mt-4 text-[17px] font-semibold text-white">Video tayyor!</div>
          <p className="mt-2 text-[13px] text-white/70 leading-relaxed">{phase.reply}</p>
          {phase.local && <p className="mt-2 text-[11px] text-amber-200/80">AI kaliti yo&apos;q — lokal rejimda montaj qilindi.</p>}
          <div className="mt-5 grid sm:grid-cols-2 gap-2">
            <button onClick={onDone} className="h-11 rounded-xl bg-white text-black text-[13px] font-semibold inline-flex items-center justify-center gap-2">
              <Play className="size-4 fill-current" /> Natijani ko&apos;rish
            </button>
            <button
              onClick={() => {
                onDone();
                onOpenAi?.();
              }}
              className="h-11 rounded-xl bg-violet-500/20 ring-1 ring-violet-400/40 text-violet-100 text-[13px] font-medium inline-flex items-center justify-center gap-2"
            >
              <Sparkles className="size-4" /> AI bilan sozlash
            </button>
          </div>
          <p className="mt-3 text-[11px] text-white/35">Yoqmasa: ↶ bilan avvalgi loyihaga qaytasiz.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-7">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white">
        <ArrowLeft className="size-4" /> Orqaga
      </button>
      <h2 className="mt-2 text-[20px] sm:text-[24px] font-bold text-white font-display pr-10">Bir bosishda AI montaj</h2>

      {phase.kind === "error" && (
        <div className="mt-3 flex gap-2 rounded-lg px-3 py-2 text-[12px] bg-rose-500/10 text-rose-200 ring-1 ring-rose-400/25">
          <TriangleAlert className="size-4 shrink-0 mt-px" /> {phase.message}
        </div>
      )}

      <Step n={1} title="Videolaringiz yoki rasmlaringiz">
        <input ref={filesRef} type="file" multiple accept="video/*,image/*" className="hidden" onChange={(e) => {
          if (e.target.files?.length) setFiles((f) => [...f, ...Array.from(e.target.files!)].slice(0, 20));
          e.target.value = "";
        }} />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = Array.from(e.dataTransfer.files).filter((f) => /^(video|image)\//.test(f.type));
            if (dropped.length) setFiles((f) => [...f, ...dropped].slice(0, 20));
          }}
          onClick={() => filesRef.current?.click()}
          className="cursor-pointer rounded-xl border border-dashed border-white/15 hover:border-violet-400/60 bg-white/[0.02] p-4 flex items-center gap-3"
        >
          <span className="size-10 rounded-xl bg-violet-500/15 grid place-items-center text-violet-200">
            <Upload className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-white">{files.length ? `${files.length} ta fayl tanlandi` : "Video yoki rasm tanlang"}</span>
            <span className="block text-[11px] text-white/45 truncate">
              {files.length ? files.map((f) => f.name).join(", ") : "Telefoningiz galereyasidan yoki shu yerga sudrab tashlang. Tanlamasangiz — demo kliplar bilan."}
            </span>
          </span>
          {files.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFiles([]);
              }}
              className="ml-auto text-[11px] text-white/50 hover:text-white shrink-0"
            >
              Tozalash
            </button>
          )}
        </div>
      </Step>

      <Step n={2} title="Uslub">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {QUICK_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s)}
              className={cn("rounded-xl p-3 text-left ring-1 transition", style.id === s.id ? "bg-violet-500/15 ring-violet-400/70" : "bg-white/[0.03] ring-white/[0.08] hover:ring-white/20")}
            >
              <div className="text-[22px]">{s.emoji}</div>
              <div className="text-[12.5px] font-semibold text-white mt-1">{s.label}</div>
              <div className="text-[10.5px] text-white/45 leading-snug">{s.hint}</div>
              <div className="text-[10px] text-cyan-300/70 mt-1">{s.id === "reference" ? "namuna formati" : s.aspect}</div>
            </button>
          ))}
        </div>
        {needsRef && (
          <div className="mt-2.5">
            <input ref={refRef} type="file" accept="video/*" className="hidden" onChange={(e) => {
              setReference(e.target.files?.[0] ?? null);
              e.target.value = "";
            }} />
            <button onClick={() => refRef.current?.click()} className={cn("w-full rounded-xl p-3 flex items-center gap-3 text-left ring-1", reference ? "bg-fuchsia-500/10 ring-fuchsia-400/40" : "bg-white/[0.03] ring-white/10 border-dashed")}>
              <Film className="size-5 text-fuchsia-200 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-white truncate">{reference ? reference.name : "Namuna video tanlang"}</span>
                <span className="block text-[10.5px] text-white/45">Yoqqan Reels / TikTok videongiz — kadrlar ritmi, o&apos;tishlar va ranglari ko&apos;chiriladi</span>
              </span>
            </button>
          </div>
        )}
      </Step>

      {!needsRef && (
        <Step n={3} title="Davomiylik">
          <div className="flex gap-2">
            {DURATIONS.map(([v, label]) => (
              <button
                key={label}
                onClick={() => setSeconds(v)}
                className={cn("h-9 px-4 rounded-xl text-[12.5px] ring-1", seconds === v ? "bg-white text-black ring-white font-semibold" : "ring-white/10 text-white/70 hover:ring-white/25")}
              >
                {label}
              </button>
            ))}
          </div>
        </Step>
      )}

      <div className="mt-6 sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-gradient-to-t from-[#101014] via-[#101014] to-transparent">
        <button
          onClick={() => void run()}
          disabled={needsRef && !reference}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 shadow-[0_10px_40px_-10px_rgba(217,70,239,0.8)] disabled:opacity-40"
        >
          <Zap className="size-4" /> Montaj qilish
        </button>
        {needsRef && !reference && <p className="mt-1.5 text-center text-[11px] text-white/40">Avval namuna videoni tanlang</p>}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="size-5 rounded-full bg-white/10 text-[11px] font-semibold text-white grid place-items-center">{n}</span>
        <span className="text-[13px] font-semibold text-white">{title}</span>
      </div>
      {children}
    </div>
  );
}
