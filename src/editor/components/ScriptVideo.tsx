"use client";

import { ArrowDown, ArrowLeft, ArrowUp, Check, Film, Loader2, Palette, Plus, RefreshCw, Sparkles, Trash2, TriangleAlert, Wand2, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useBrandKit } from "../brand-kit";
import { buildScriptVideo, findSceneFootage, newScene, requestScript, type MusicMood, ScriptError, type ScriptAspect, type ScriptDraft, type ScriptScene, templateScript } from "../script-video";
import { useEditor } from "../store";
import { formatShort } from "../utils";
import { EmotionTagBar, insertTag } from "./EmotionTagBar";
import { VoicePicker } from "./VoicePicker";

const EXAMPLES = ["Toshkentdagi 5 ta eng chiroyli joy", "Kofe tayyorlashning sirlari", "Telefoningiz batareyasini tejash bo'yicha 5 maslahat", "Yangi kofexonamiz ochildi"];
const CAPTION_STYLES: [string, string][] = [
  ["tiktok-caption", "TikTok"],
  ["hormozi-caption", "Podkast"],
  ["caption", "Klassik"],
  ["soft-caption", "Yumshoq"],
];
const MUSIC: [MusicMood, string][] = [
  ["none", "Yo'q"],
  ["calm", "Sokin"],
  ["upbeat", "Quvnoq"],
  ["cinematic", "Kinematik"],
];

type Stage = { kind: "topic" } | { kind: "cards" } | { kind: "building"; label: string; fraction: number } | { kind: "done"; warnings: string[] };

/**
 * Topic → script cards you can edit → a finished project in the editor (stock footage, voiceover,
 * synced captions, music, whooshes and your brand kit).
 */
export function ScriptVideo({ onBack, onDone, onOpenAi, onBrand }: { onBack: () => void; onDone: () => void; onOpenAi?: () => void; onBrand: () => void }) {
  const { assets, commit, addAssets, select } = useEditor();
  const brand = useBrandKit();
  const [stage, setStage] = useState<Stage>({ kind: "topic" });
  const [topic, setTopic] = useState("");
  const [aspect, setAspect] = useState<ScriptAspect>("9:16");
  const [seconds, setSeconds] = useState(30);
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Options
  const [voiceOn, setVoiceOn] = useState(true);
  const [voice, setVoice] = useState("openai:nova");
  const [speed, setSpeed] = useState(1);
  const [captionStyle, setCaptionStyle] = useState("tiktok-caption");
  const [music, setMusic] = useState<MusicMood>("upbeat");
  const [sfx, setSfx] = useState(true);
  const [useBrand, setUseBrand] = useState(true);

  const writeScript = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setDraft(await requestScript(topic.trim(), aspect, seconds, true));
    } catch (err) {
      const code = err instanceof ScriptError ? err.code : "network";
      // No AI available: the user still gets editable scenes built around the topic.
      setNotice(
        code === "no_api_key"
          ? "AI kaliti sozlanmagan — ssenariyni o'zingiz yozing. Quyidagi kartalar mavzu asosida tayyorlandi."
          : code === "rate_limited"
            ? `${(err as Error).message} Hozircha kartalarni o'zingiz to'ldiring.`
            : `AI ssenariy yoza olmadi (${(err as Error).message}). Kartalarni o'zingiz to'ldiring.`,
      );
      setDraft(templateScript(topic, seconds));
    } finally {
      setBusy(false);
      setStage({ kind: "cards" });
    }
  };

  const patchScene = (id: string, patch: Partial<ScriptScene>) => setDraft((d) => d && { ...d, scenes: d.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const scenes = [...d.scenes];
      const j = i + dir;
      if (j < 0 || j >= scenes.length) return d;
      [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
      return { ...d, scenes };
    });

  const build = async () => {
    if (!draft) return;
    setError(null);
    setStage({ kind: "building", label: "Boshlanmoqda…", fraction: 0 });
    try {
      const demo = assets.filter((a) => a.scene || a.origin === "demo");
      const r = await buildScriptVideo({
        title: draft.title,
        scenes: draft.scenes.filter((s) => s.narration.trim() || s.text.trim()),
        aspect,
        voice: voiceOn ? voice : "none",
        voiceSpeed: speed,
        captionStyle,
        music,
        sfx,
        transition: "dissolve",
        kit: useBrand && brand ? brand : null,
        demoAssets: demo,
        onProgress: (label, fraction) => setStage({ kind: "building", label, fraction }),
      });
      addAssets(r.assets);
      commit(r.project);
      select(null);
      setStage({ kind: "done", warnings: r.warnings });
    } catch (err) {
      setError((err as Error).message || "Video yasab bo'lmadi");
      setStage({ kind: "cards" });
    }
  };

  // ---------- Building / done ----------
  if (stage.kind === "building") {
    return (
      <div className="p-6 sm:p-10 min-h-[60vh] grid place-items-center text-center">
        <div className="max-w-sm w-full">
          <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-[0_0_60px_-10px_rgba(217,70,239,0.9)]">
            <Wand2 className="size-7 text-white animate-pulse" />
          </div>
          <div className="mt-5 text-[16px] font-semibold text-white">Video yasalmoqda</div>
          <div className="mt-1.5 text-[12.5px] text-white/60 shimmer-text">{stage.label}</div>
          <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-[width]" style={{ width: `${Math.round(stage.fraction * 100)}%` }} />
          </div>
          <p className="mt-4 text-[11px] text-white/35">Ovozlar, kadrlar va subtitrlar tayyorlanmoqda…</p>
        </div>
      </div>
    );
  }
  if (stage.kind === "done") {
    return (
      <div className="p-6 sm:p-10 min-h-[50vh] grid place-items-center text-center">
        <div className="max-w-md">
          <div className="mx-auto size-14 rounded-full bg-emerald-500/20 grid place-items-center">
            <Check className="size-7 text-emerald-300" />
          </div>
          <div className="mt-4 text-[17px] font-semibold text-white">Video tayyor!</div>
          <p className="mt-2 text-[13px] text-white/70 leading-relaxed">Hammasi timeline&apos;da: kadrlar, ovoz, subtitr va musiqa. Xohlagan joyini tahrirlashingiz mumkin.</p>
          {stage.warnings.length > 0 && (
            <div className="mt-3 text-left rounded-lg px-3 py-2 text-[11.5px] bg-amber-500/10 text-amber-200/90 ring-1 ring-amber-400/20 space-y-1">
              {stage.warnings.map((w) => (
                <div key={w} className="flex gap-1.5">
                  <TriangleAlert className="size-3.5 shrink-0 mt-0.5" /> {w}
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 grid sm:grid-cols-2 gap-2">
            <button onClick={onDone} className="h-11 rounded-xl bg-white text-black text-[13px] font-semibold">
              Natijani ko&apos;rish
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

  // ---------- Topic ----------
  if (stage.kind === "topic" || !draft) {
    return (
      <div className="p-4 sm:p-7">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white">
          <ArrowLeft className="size-4" /> Orqaga
        </button>
        <h2 className="mt-2 text-[20px] sm:text-[24px] font-bold text-white font-display pr-10">Mavzudan video</h2>
        <p className="text-[12.5px] text-white/50 mt-1">Mavzuni yozing — AI ssenariy yozadi, kadr topadi, ovoz va subtitr qo&apos;shadi. Video yasalishidan oldin ssenariyni o&apos;zingiz tahrirlaysiz.</p>

        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Masalan: Kofe tayyorlashning 5 ta sirli usuli"
          className="mt-4 w-full rounded-xl bg-black/40 ring-1 ring-white/10 focus:ring-violet-400/70 outline-none p-3 text-[14px] text-white resize-none"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => setTopic(e)} className="px-2.5 py-1 rounded-full text-[11px] text-violet-200 ring-1 ring-violet-400/30 hover:bg-violet-500/15">
              {e}
            </button>
          ))}
        </div>

        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-[12px] font-semibold text-white mb-2">Format</div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["9:16", "Reels / TikTok"],
                  ["16:9", "YouTube"],
                ] as [ScriptAspect, string][]
              ).map(([id, label]) => (
                <button key={id} onClick={() => setAspect(id)} className={cn("h-11 rounded-xl text-[12.5px] ring-1", aspect === id ? "bg-violet-500/15 ring-violet-400/70 text-white font-medium" : "ring-white/10 text-white/65 hover:ring-white/25")}>
                  {id} · {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-white mb-2">Davomiylik</div>
            <div className="flex gap-2">
              {[15, 30, 45, 60].map((s) => (
                <button key={s} onClick={() => setSeconds(s)} className={cn("flex-1 h-11 rounded-xl text-[12.5px] ring-1", seconds === s ? "bg-white text-black ring-white font-semibold" : "ring-white/10 text-white/70 hover:ring-white/25")}>
                  {s} s
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-gradient-to-t from-[#101014] via-[#101014] to-transparent">
          <button
            onClick={() => void writeScript()}
            disabled={busy || topic.trim().length < 3}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 shadow-[0_10px_40px_-10px_rgba(217,70,239,0.8)] disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} {busy ? "Ssenariy yozilmoqda…" : "Ssenariy yozish"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- Script cards ----------
  const total = draft.scenes.reduce((s, c) => s + c.seconds, 0);
  const usedIds = (except: string) => new Set(draft.scenes.filter((s) => s.id !== except && s.footage).map((s) => s.footage!.id));

  return (
    <div className="p-4 sm:p-7">
      <button onClick={() => setStage({ kind: "topic" })} className="inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white">
        <ArrowLeft className="size-4" /> Mavzuni o&apos;zgartirish
      </button>
      <h2 className="mt-2 text-[20px] sm:text-[24px] font-bold text-white font-display pr-10">Ssenariyni tekshiring</h2>
      <p className="text-[12.5px] text-white/50 mt-1">Har bir kartani tahrirlang: matn, ovoz uchun gap, kadr. Keyin «Video yasash».</p>
      <p className="mt-1.5 text-[11.5px] text-violet-200/80 leading-relaxed">
        🎭 Ovoz hissiyoti: gap oldiga <span className="font-mono text-violet-100">[excited]</span>, <span className="font-mono text-violet-100">[calm]</span>, <span className="font-mono text-violet-100">[whisper]</span>, <span className="font-mono text-violet-100">[pause 1s]</span> kabi teg yozing yoki tugmalarni bosing — keyingi matn shu ohangda o&apos;qiladi.
      </p>

      {notice && (
        <div className="mt-3 flex gap-2 rounded-lg px-3 py-2 text-[12px] bg-amber-500/10 text-amber-200/90 ring-1 ring-amber-400/20">
          <TriangleAlert className="size-4 shrink-0 mt-px" /> {notice}
        </div>
      )}
      {error && (
        <div className="mt-3 flex gap-2 rounded-lg px-3 py-2 text-[12px] bg-rose-500/10 text-rose-200 ring-1 ring-rose-400/25">
          <TriangleAlert className="size-4 shrink-0 mt-px" /> {error}
        </div>
      )}

      <div className="mt-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Video nomi (sarlavha)</label>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1 w-full h-10 rounded-lg bg-black/40 ring-1 ring-white/10 focus:ring-cyan-300/70 outline-none px-3 text-sm text-white" />
      </div>

      <div className="mt-4 space-y-3">
        {draft.scenes.map((s, i) => (
          <SceneCard
            key={s.id}
            index={i}
            scene={s}
            aspect={aspect}
            usedIds={() => usedIds(s.id)}
            onChange={(p) => patchScene(s.id, p)}
            onMove={(d) => move(i, d)}
            onDelete={() => setDraft({ ...draft, scenes: draft.scenes.filter((x) => x.id !== s.id) })}
            first={i === 0}
            last={i === draft.scenes.length - 1}
            canDelete={draft.scenes.length > 1}
          />
        ))}
        {draft.scenes.length < 10 && (
          <button onClick={() => setDraft({ ...draft, scenes: [...draft.scenes, newScene()] })} className="w-full h-10 rounded-xl border border-dashed border-white/15 text-[12.5px] text-white/60 hover:text-white hover:border-white/30 inline-flex items-center justify-center gap-1.5">
            <Plus className="size-4" /> Kadr qo&apos;shish
          </button>
        )}
      </div>

      <div className="mt-6 space-y-5">
        <Opt title="Ovoz">
          <label className="flex items-center gap-2 text-[12px] text-white/75 mb-2">
            <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} className="accent-cyan-400" /> Ovoz bilan (voiceover)
          </label>
          {voiceOn && (
            <>
              <VoicePicker value={voice} onChange={setVoice} />
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[11px] text-white/50">Tezlik</span>
                {[0.9, 1, 1.1, 1.2].map((v) => (
                  <button key={v} onClick={() => setSpeed(v)} className={cn("h-7 px-2.5 rounded-md text-[11.5px] ring-1", speed === v ? "bg-cyan-400/15 ring-cyan-300/70 text-white" : "ring-white/10 text-white/60 hover:ring-white/25")}>
                    {v}x
                  </button>
                ))}
              </div>
            </>
          )}
        </Opt>
        <Opt title="Subtitr uslubi">
          <Chips value={captionStyle} options={CAPTION_STYLES} onChange={setCaptionStyle} />
        </Opt>
        <Opt title="Musiqa">
          <Chips value={music} options={MUSIC} onChange={setMusic} />
          <label className="mt-2.5 flex items-center gap-2 text-[12px] text-white/75">
            <input type="checkbox" checked={sfx} onChange={(e) => setSfx(e.target.checked)} className="accent-cyan-400" /> Kadrlar almashganda whoosh tovushi
          </label>
        </Opt>
        <Opt title="Brend">
          {brand ? (
            <label className="flex items-center gap-2 text-[12px] text-white/75">
              <input type="checkbox" checked={useBrand} onChange={(e) => setUseBrand(e.target.checked)} className="accent-cyan-400" />
              Brend to&apos;plamini qo&apos;llash ({brand.name || brand.font}
              {brand.logo ? ", logo bilan" : ""})
            </label>
          ) : (
            <p className="text-[12px] text-white/50">Brend to&apos;plami hali sozlanmagan.</p>
          )}
          <button onClick={onBrand} className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] text-white">
            <Palette className="size-3.5" /> {brand ? "Brendni tahrirlash" : "Brend to'plamini sozlash"}
          </button>
        </Opt>
      </div>

      <div className="mt-6 sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 bg-gradient-to-t from-[#101014] via-[#101014] to-transparent">
        <button
          onClick={() => void build()}
          disabled={!draft.scenes.some((s) => s.narration.trim() || s.text.trim())}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 shadow-[0_10px_40px_-10px_rgba(217,70,239,0.8)] disabled:opacity-40"
        >
          <Wand2 className="size-4" /> Video yasash · ~{formatShort(total)}
        </button>
      </div>
    </div>
  );
}

function SceneCard({
  index,
  scene,
  aspect,
  usedIds,
  onChange,
  onMove,
  onDelete,
  first,
  last,
  canDelete,
}: {
  index: number;
  scene: ScriptScene;
  aspect: ScriptAspect;
  usedIds: () => Set<string>;
  onChange: (p: Partial<ScriptScene>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  first: boolean;
  last: boolean;
  canDelete: boolean;
}) {
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const narrationRef = useRef<HTMLTextAreaElement>(null);
  const ib = "size-7 grid place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent";

  const find = async (next: boolean) => {
    setFinding(true);
    setNote(null);
    try {
      const r = await findSceneFootage(scene.query, aspect, usedIds(), next ? (scene.page ?? 1) + 1 : 1);
      if (r.footage) onChange({ footage: r.footage, page: r.page });
      else setNote("Bu so'rov bo'yicha kadr topilmadi — inglizcha boshqa so'z yozing.");
    } catch (err) {
      const m = (err as Error).message;
      setNote(/PIXABAY|api_key|sozlanmagan/i.test(m) ? "Stok kadrlar uchun serverda PIXABAY_API_KEY kerak — hozircha demo kadr qo'yiladi." : m);
    } finally {
      setFinding(false);
    }
  };

  return (
    <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.08] p-3 sm:p-3.5">
      <div className="flex items-center gap-2">
        <span className="size-6 rounded-full bg-violet-500/25 text-violet-100 text-[11.5px] font-semibold grid place-items-center">{index + 1}</span>
        <input
          value={scene.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Ekrandagi qisqa matn"
          className="flex-1 min-w-0 h-8 bg-transparent text-[13px] font-semibold text-white outline-none placeholder:text-white/30 border-b border-transparent focus:border-white/20"
        />
        <button className={ib} onClick={() => onMove(-1)} disabled={first} title="Yuqoriga">
          <ArrowUp className="size-4" />
        </button>
        <button className={ib} onClick={() => onMove(1)} disabled={last} title="Pastga">
          <ArrowDown className="size-4" />
        </button>
        <button className={cn(ib, "hover:text-rose-300")} onClick={onDelete} disabled={!canDelete} title="O'chirish">
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-[96px_1fr] sm:grid-cols-[130px_1fr] gap-3">
        <div className="space-y-1.5">
          <div
            className={cn("relative rounded-lg overflow-hidden bg-black ring-1 ring-white/10", aspect === "9:16" ? "aspect-[9/16]" : "aspect-video")}
            onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
            onMouseLeave={() => videoRef.current?.pause()}
          >
            {scene.footage ? (
              <video ref={videoRef} src={`${scene.footage.src}#t=0.5`} muted loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-center px-1.5 text-[10px] text-white/40 leading-snug">
                <Film className="size-5 mb-1 mx-auto" />
                Kadr yo&apos;q
              </div>
            )}
            {finding && (
              <div className="absolute inset-0 bg-black/60 grid place-items-center">
                <Loader2 className="size-4 animate-spin text-white" />
              </div>
            )}
          </div>
          <button onClick={() => void find(!!scene.footage)} disabled={finding} className="w-full h-7 rounded-md bg-white/10 hover:bg-white/15 text-[10.5px] text-white inline-flex items-center justify-center gap-1 disabled:opacity-50">
            <RefreshCw className="size-3" /> {scene.footage ? "Boshqa kadr" : "Kadr topish"}
          </button>
        </div>
        <div className="min-w-0 space-y-2">
          <textarea
            ref={narrationRef}
            value={scene.narration}
            onChange={(e) => onChange({ narration: e.target.value })}
            rows={3}
            placeholder="Ovoz nima deydi (subtitr ham shundan olinadi). Hissiyot: [excited] …"
            className="w-full rounded-lg bg-black/40 ring-1 ring-white/10 focus:ring-cyan-300/70 outline-none p-2 text-[12.5px] text-white resize-none"
          />
          <EmotionTagBar compact onInsert={(tag) => insertTag(narrationRef, scene.narration, (v) => onChange({ narration: v }), tag)} />
          <div className="flex gap-2">
            <input
              value={scene.query}
              onChange={(e) => onChange({ query: e.target.value, page: 1 })}
              placeholder="Kadr qidiruvi (inglizcha)"
              className="flex-1 min-w-0 h-8 rounded-lg bg-black/40 ring-1 ring-white/10 focus:ring-cyan-300/70 outline-none px-2.5 text-[12px] text-white"
            />
            <div className="shrink-0 flex items-center rounded-lg bg-black/40 ring-1 ring-white/10 h-8">
              <button className="w-7 h-full text-white/60 hover:text-white" onClick={() => onChange({ seconds: Math.max(2, scene.seconds - 1) })}>
                −
              </button>
              <span className="w-10 text-center text-[11.5px] tabular-nums text-white/80">{scene.seconds}s</span>
              <button className="w-7 h-full text-white/60 hover:text-white" onClick={() => onChange({ seconds: Math.min(20, scene.seconds + 1) })}>
                +
              </button>
            </div>
          </div>
          {note && <p className="text-[10.5px] text-amber-200/80 leading-snug">{note}</p>}
        </div>
      </div>
    </div>
  );
}

function Opt({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-white mb-2">{title}</div>
      {children}
    </div>
  );
}

function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className={cn("h-8 px-3 rounded-lg text-[12px] ring-1", value === id ? "bg-cyan-400/15 ring-cyan-300/70 text-white" : "ring-white/10 text-white/65 hover:ring-white/25")}>
          {label}
        </button>
      ))}
    </div>
  );
}
