"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Italic,
  MousePointerClick,
  Trash2,
  Type as TypeIcon,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { animationsOfKind, textAnimsOfKind } from "../catalog/animations";
import { EFFECT_GROUPS, EFFECTS } from "../catalog/effects";
import { DEFAULT_ADJUST, FILTER_PRESETS } from "../catalog/filters";
import { loadFontFamily } from "../catalog/font-loader";
import { FONTS } from "../catalog/fonts";
import { shapeById } from "../catalog/stickers";
import { TEXT_TEMPLATES } from "../catalog/text-templates";
import { TRANSITION_DEFS } from "../catalog/transitions";
import { KEYFRAME_PROPS, keyframeAt, removeKeyframe, setKeyframe, valueAt } from "../keyframes";
import { duplicateClip, removeClip, setClipSpeed, templatePatch, updateClip } from "../ops";
import { ASPECTS, BLEND_MODES, MOTIONS, SPEED_CURVES } from "../presets";
import { useCurrentTime, useEditor } from "../store";
import type {
  Adjustments,
  AspectRatio,
  ChromaKey,
  Clip,
  ClipAnimation,
  EffectClip,
  KeyframeProp,
  Mask,
  MaskShape,
  MediaClip,
  SpeedCurve,
  StickerClip,
  TextClip,
  VisualClip,
} from "../types";
import { clamp, formatTime, round } from "../utils";
import { BeatTool, ReplaceMedia, SilenceTool } from "./AudioTools";
import { Chips, ColorRow, SearchBox, Section, Segmented, Slider, Switch } from "./ui";

type SetFn = (patch: Partial<Clip>, live?: boolean) => void;

export function Inspector() {
  const { project, selectedId, assets, commit, preview, checkpoint, select } = useEditor();
  const clip = project.clips.find((c) => c.id === selectedId);
  if (!clip) return <ProjectSettings />;

  /** Slider changes stream through `preview`; a checkpoint is taken on pointer down. */
  const set: SetFn = (patch, live = false) => (live ? preview(updateClip(project, clip.id, patch)) : commit(updateClip(project, clip.id, patch)));
  const asset = clip.type === "media" ? assets.find((a) => a.id === clip.assetId) : undefined;
  const kind = clip.type === "media" ? (asset?.kind === "audio" ? "Audio" : asset?.kind === "image" ? "Rasm" : "Video") : { text: "Matn", sticker: "Stiker", effect: "Effekt" }[clip.type];
  const title =
    clip.type === "text" ? clip.text : clip.type === "sticker" ? clip.sticker.split(":")[1] : clip.type === "effect" ? EFFECTS[clip.effect]?.label : asset?.name;

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-2 border-b border-white/[0.05]">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-cyan-300/80 font-semibold">{kind}</div>
          <div className="text-[13px] font-semibold text-white truncate">{title}</div>
          <div className="text-[10.5px] text-white/40 font-mono mt-0.5">
            {formatTime(clip.start, project.fps)} → {formatTime(clip.start + clip.duration, project.fps)} · {round(clip.duration, 2)}s
          </div>
        </div>
        <div className="flex gap-1">
          <IconBtn
            title="Nusxalash (Ctrl+D)"
            onClick={() => {
              const r = duplicateClip(project, clip.id);
              commit(r.project);
              if (r.id) select(r.id);
            }}
          >
            <Copy className="size-3.5" />
          </IconBtn>
          <IconBtn
            title="O'chirish (Delete)"
            danger
            onClick={() => {
              commit(removeClip(project, clip.id));
              select(null);
            }}
          >
            <Trash2 className="size-3.5" />
          </IconBtn>
        </div>
      </div>
      {clip.type === "media" && asset?.kind === "audio" && <AudioInspector clip={clip} set={set} checkpoint={checkpoint} credit={asset.credit} license={asset.license} origin={asset.origin} />}
      {clip.type === "media" && asset?.kind !== "audio" && <MediaInspector clip={clip} set={set} checkpoint={checkpoint} isImage={asset?.kind === "image"} />}
      {clip.type === "text" && <TextInspector clip={clip} set={set} checkpoint={checkpoint} />}
      {clip.type === "sticker" && <StickerInspector clip={clip} set={set} checkpoint={checkpoint} />}
      {clip.type === "effect" && <EffectInspector clip={clip} set={set} checkpoint={checkpoint} />}
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} className={cn("size-8 grid place-items-center rounded-md text-white/50 hover:bg-white/10", danger ? "hover:text-rose-300" : "hover:text-white")}>
      {children}
    </button>
  );
}

function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (t: T) => void; tabs: [T, string][] }) {
  return (
    <div className="flex gap-0.5 px-3 border-b border-white/[0.05] overflow-x-auto no-scrollbar sticky top-0 bg-[#111115] z-10">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn("relative px-2.5 h-9 text-[11.5px] font-medium shrink-0 transition-colors", value === id ? "text-white" : "text-white/45 hover:text-white/80")}
        >
          {label}
          {value === id && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-cyan-300" />}
        </button>
      ))}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="p-4 space-y-6">{children}</div>;
}

// ---------- Keyframed transform ----------

function useClipTime(clip: Clip) {
  const time = useCurrentTime();
  const t = time - clip.start;
  return { t: clamp(t, 0, clip.duration), inside: t >= 0 && t <= clip.duration };
}

function TransformSection({ clip, checkpoint, props }: { clip: VisualClip; checkpoint: () => void; props: KeyframeProp[] }) {
  const { project, preview, commit } = useEditor();
  const { t, inside } = useClipTime(clip);
  return (
    <Section title="Transformatsiya" action={<span className="text-[10px] text-white/30">◆ = keyframe</span>}>
      {KEYFRAME_PROPS.filter((p) => props.includes(p.id)).map((p) => {
        const has = !!clip.keyframes?.[p.id]?.length;
        const active = !!keyframeAt(clip, p.id, t);
        const value = valueAt(clip, p.id, t);
        const write = (v: number, live: boolean) => {
          const next = has ? setKeyframe(clip, p.id, t, v) : ({ ...clip, [p.id]: v } as Clip);
          const proj = { ...project, clips: project.clips.map((c) => (c.id === clip.id ? next : c)) };
          if (live) preview(proj);
          else commit(proj);
        };
        return (
          <Slider
            key={p.id}
            label={p.label}
            value={value}
            min={p.min}
            max={p.max}
            step={p.step}
            display={p.id === "opacity" ? `${Math.round(value * 100)}%` : `${round(value, 2)}${p.unit}`}
            onDown={checkpoint}
            onChange={(v) => write(v, true)}
            onReset={() => write(p.id === "scale" || p.id === "opacity" ? 1 : 0, false)}
            keyframe={{
              active,
              has,
              onToggle: () => {
                if (!inside) return;
                const next = active ? removeKeyframe(clip, p.id, t) : setKeyframe(clip, p.id, t, value);
                commit({ ...project, clips: project.clips.map((c) => (c.id === clip.id ? next : c)) });
              },
            }}
          />
        );
      })}
      {!inside && <p className="text-[10px] text-amber-200/70">Keyframe qo&apos;shish uchun playheadni klip ustiga qo&apos;ying.</p>}
    </Section>
  );
}

// ---------- Animations ----------

function AnimPicker({
  title,
  kind,
  value,
  onChange,
  checkpoint,
  maxDuration,
}: {
  title: string;
  kind: "in" | "out" | "combo";
  value: ClipAnimation | undefined;
  onChange: (v: ClipAnimation | undefined, live?: boolean) => void;
  checkpoint: () => void;
  maxDuration: number;
}) {
  const list = useMemo(() => animationsOfKind(kind), [kind]);
  return (
    <Section title={title}>
      <div className="grid grid-cols-3 gap-1.5">
        <AnimCell active={!value} label="Yo'q" onClick={() => onChange(undefined)} />
        {list.map((a) => (
          <AnimCell key={a.id} active={value?.id === a.id} label={a.label} onClick={() => onChange({ id: a.id, duration: value?.duration ?? (kind === "combo" ? 0 : Math.min(a.defaultDuration, maxDuration / 2)) })} />
        ))}
      </div>
      {value && kind !== "combo" && (
        <Slider label="Davomiylik" value={value.duration} min={0.1} max={Math.max(0.2, Math.min(5, maxDuration))} step={0.05} unit="s" onDown={checkpoint} onChange={(v) => onChange({ ...value, duration: v }, true)} />
      )}
      {value && kind === "combo" && (
        <Slider
          label="Takrorlanish davri"
          value={value.duration || maxDuration}
          min={0.3}
          max={Math.max(0.4, maxDuration)}
          step={0.05}
          unit="s"
          onDown={checkpoint}
          onChange={(v) => onChange({ ...value, duration: v }, true)}
        />
      )}
    </Section>
  );
}

function AnimCell({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-1.5 py-2 text-[10.5px] leading-tight ring-1 transition-colors min-h-[38px]",
        active ? "bg-cyan-400/15 ring-cyan-300/70 text-white" : "ring-white/[0.08] text-white/60 hover:text-white hover:ring-white/25 bg-white/[0.02]",
      )}
    >
      {label}
    </button>
  );
}

function ClipAnimations({ clip, set, checkpoint }: { clip: VisualClip; set: SetFn; checkpoint: () => void }) {
  const [tab, setTab] = useState<"in" | "out" | "combo">("in");
  return (
    <>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ["in", "Kirish"],
          ["out", "Chiqish"],
          ["combo", "Kombo"],
        ]}
      />
      {tab === "in" && <AnimPicker title="Kirish animatsiyasi" kind="in" value={clip.animIn} maxDuration={clip.duration} checkpoint={checkpoint} onChange={(v, live) => set({ animIn: v }, live)} />}
      {tab === "out" && <AnimPicker title="Chiqish animatsiyasi" kind="out" value={clip.animOut} maxDuration={clip.duration} checkpoint={checkpoint} onChange={(v, live) => set({ animOut: v }, live)} />}
      {tab === "combo" && <AnimPicker title="Kombo (takrorlanuvchi)" kind="combo" value={clip.animCombo} maxDuration={clip.duration} checkpoint={checkpoint} onChange={(v, live) => set({ animCombo: v }, live)} />}
    </>
  );
}

function TransitionSection({ clip, set, checkpoint }: { clip: Clip; set: SetFn; checkpoint: () => void }) {
  return (
    <Section title="Kirish o'tishi">
      <select
        value={clip.transitionIn}
        onChange={(e) => set({ transitionIn: e.target.value })}
        className="w-full h-8 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08] text-xs text-white px-2 outline-none"
      >
        {Object.entries(TRANSITION_DEFS)
          .filter(([id]) => !["slide", "zoom", "wipe"].includes(id))
          .map(([id, t]) => (
            <option key={id} value={id} className="bg-[#16161b]">
              {t.label}
            </option>
          ))}
      </select>
      {clip.transitionIn !== "none" && (
        <Slider label="Davomiylik" value={clip.transitionDuration} min={0.1} max={2} step={0.05} unit="s" onDown={checkpoint} onChange={(v) => set({ transitionDuration: v }, true)} />
      )}
    </Section>
  );
}

// ---------- Media ----------

type MediaTab = "basic" | "anim" | "speed" | "adjust" | "mask" | "audio";

function MediaInspector({ clip, set, checkpoint, isImage }: { clip: MediaClip; set: SetFn; checkpoint: () => void; isImage: boolean }) {
  const [tab, setTab] = useState<MediaTab>("basic");
  const { project, commit, preview } = useEditor();
  const tabs: [MediaTab, string][] = [
    ["basic", "Asosiy"],
    ["anim", "Animatsiya"],
    ...(!isImage ? ([["speed", "Tezlik"]] as [MediaTab, string][]) : []),
    ["adjust", "Rang"],
    ["mask", "Maska"],
    ...(!isImage ? ([["audio", "Ovoz"]] as [MediaTab, string][]) : []),
  ];
  const crop = clip.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <Body>
        {tab === "basic" && (
          <>
            <ReplaceMedia clip={clip} />
            <TransformSection clip={clip} checkpoint={checkpoint} props={["x", "y", "scale", "rotation", "opacity"]} />
            <Section title="Kadr">
              <div className="flex gap-1.5">
                <ToggleBtn active={!!clip.flipH} onClick={() => set({ flipH: !clip.flipH })} title="Gorizontal aks">
                  <FlipHorizontal2 className="size-3.5" /> Ko&apos;zgu
                </ToggleBtn>
                <ToggleBtn active={!!clip.flipV} onClick={() => set({ flipV: !clip.flipV })} title="Vertikal aks">
                  <FlipVertical2 className="size-3.5" /> Teskari
                </ToggleBtn>
              </div>
              <div className="text-[11px] text-white/50 mt-1">Kanvasga joylash</div>
              <Segmented
                value={clip.fit ?? "cover"}
                onChange={(v) => set({ fit: v })}
                options={[
                  ["cover", "To'ldirish"],
                  ["contain", "Moslash"],
                  ["fill", "Cho'zish"],
                ]}
              />
            </Section>
            <Section title="Kesish (crop)" action={<ResetBtn onClick={() => set({ crop: undefined })} />}>
              {(["top", "bottom", "left", "right"] as const).map((side) => (
                <Slider
                  key={side}
                  label={{ top: "Tepa", bottom: "Past", left: "Chap", right: "O'ng" }[side]}
                  value={crop[side]}
                  min={0}
                  max={0.45}
                  step={0.005}
                  pct
                  onDown={checkpoint}
                  onChange={(v) => set({ crop: { ...crop, [side]: v } }, true)}
                />
              ))}
            </Section>
            <Section title="Aralashtirish rejimi">
              <select
                value={clip.blendMode ?? "normal"}
                onChange={(e) => set({ blendMode: e.target.value })}
                className="w-full h-8 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08] text-xs text-white px-2 outline-none"
              >
                {Object.entries(BLEND_MODES).map(([id, label]) => (
                  <option key={id} value={id} className="bg-[#16161b]">
                    {label}
                  </option>
                ))}
              </select>
            </Section>
            <Section title="Kamera harakati">
              <Chips value={clip.motion} options={Object.entries(MOTIONS).map(([id, m]) => [id, m.label])} onChange={(v) => set({ motion: v as MediaClip["motion"] })} />
            </Section>
            <ChromaSection chroma={clip.chroma} onChange={(c, live) => set({ chroma: c }, live)} checkpoint={checkpoint} />
          </>
        )}
        {tab === "anim" && (
          <>
            <ClipAnimations clip={clip} set={set} checkpoint={checkpoint} />
            <TransitionSection clip={clip} set={set} checkpoint={checkpoint} />
          </>
        )}
        {tab === "speed" && (
          <>
            <Section title="Oddiy tezlik">
              <Slider
                label="Tezlik"
                value={clip.speed}
                min={0.1}
                max={10}
                step={0.05}
                unit="x"
                onDown={checkpoint}
                onChange={(v) => preview(setClipSpeed(project, clip.id, v))}
              />
              <div className="flex flex-wrap gap-1.5">
                {[0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
                  <button key={s} onClick={() => commit(setClipSpeed(project, clip.id, s))} className={cn("px-2 py-1 rounded-md text-[11px] ring-1", clip.speed === s ? "ring-cyan-300 bg-cyan-400/15 text-white" : "ring-white/10 text-white/60 hover:text-white")}>
                    {s}x
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/35">Davomiylik: {round(clip.duration, 2)}s (manba {round(clip.duration * clip.speed, 2)}s)</p>
            </Section>
            <Section title="Tezlik egri chizig'i">
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(SPEED_CURVES) as SpeedCurve[]).map((id) => (
                  <button
                    key={id}
                    onClick={() => set({ speedCurve: id })}
                    className={cn("rounded-md p-1.5 ring-1 flex flex-col items-center gap-1", (clip.speedCurve ?? "none") === id ? "ring-cyan-300 bg-cyan-400/10" : "ring-white/[0.08] hover:ring-white/25")}
                  >
                    <CurveIcon points={[...SPEED_CURVES[id].points]} />
                    <span className="text-[10px] text-white/70">{SPEED_CURVES[id].label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-white/35">Egri chiziq va teskari ijroda klip ovozi o&apos;chadi.</p>
            </Section>
            <Section title="Teskari ijro">
              <Switch label="Reverse" checked={!!clip.reverse} onChange={() => set({ reverse: !clip.reverse })} />
            </Section>
          </>
        )}
        {tab === "adjust" && <AdjustPanel clip={clip} set={set} checkpoint={checkpoint} />}
        {tab === "mask" && <MaskPanel mask={clip.mask} onChange={(m, live) => set({ mask: m }, live)} checkpoint={checkpoint} />}
        {tab === "audio" && (
          <>
            <VolumeSection clip={clip} set={set} checkpoint={checkpoint} />
            <SilenceTool clip={clip} />
          </>
        )}
      </Body>
    </>
  );
}

function ResetBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-[10px] text-white/40 hover:text-white">
      Tiklash
    </button>
  );
}

function ToggleBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn("flex-1 h-8 rounded-lg inline-flex items-center justify-center gap-1.5 text-[11px] ring-1", active ? "ring-cyan-300 bg-cyan-400/15 text-white" : "ring-white/10 text-white/60 hover:text-white")}
    >
      {children}
    </button>
  );
}

function CurveIcon({ points }: { points: number[] }) {
  const max = 3;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * 56 + 2} ${26 - (Math.min(p, max) / max) * 22}`).join(" ");
  return (
    <svg width="60" height="28" className="text-cyan-300">
      <line x1="2" x2="58" y1={26 - (1 / max) * 22} y2={26 - (1 / max) * 22} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function VolumeSection({ clip, set, checkpoint }: { clip: MediaClip; set: SetFn; checkpoint: () => void }) {
  return (
    <>
      <TransformSection clip={clip} checkpoint={checkpoint} props={["volume"]} />
      <Section title="Fade">
        <Slider label="Fade in" value={clip.fadeIn ?? 0} min={0} max={Math.min(10, clip.duration / 2)} step={0.05} unit="s" onDown={checkpoint} onChange={(v) => set({ fadeIn: v }, true)} />
        <Slider label="Fade out" value={clip.fadeOut ?? 0} min={0} max={Math.min(10, clip.duration / 2)} step={0.05} unit="s" onDown={checkpoint} onChange={(v) => set({ fadeOut: v }, true)} />
      </Section>
      <Section title="Tezkor">
        <div className="flex gap-1.5">
          <ToggleBtn active={clip.volume === 0} onClick={() => set({ volume: clip.volume === 0 ? 1 : 0 })} title="Ovozsiz">
            {clip.volume === 0 ? "Ovozni yoqish" : "Ovozsiz qilish"}
          </ToggleBtn>
        </div>
      </Section>
    </>
  );
}

function AudioInspector({ clip, set, checkpoint, credit, license, origin }: { clip: MediaClip; set: SetFn; checkpoint: () => void; credit?: string; license?: string; origin?: string }) {
  const { project, preview } = useEditor();
  return (
    <Body>
      <VolumeSection clip={clip} set={set} checkpoint={checkpoint} />
      <Section title="Tezlik">
        <Slider label="Tezlik" value={clip.speed} min={0.25} max={4} step={0.05} unit="x" onDown={checkpoint} onChange={(v) => preview(setClipSpeed(project, clip.id, v))} />
      </Section>
      {origin === "music" || origin === "demo" ? <BeatTool clip={clip} /> : <SilenceTool clip={clip} />}
      {(credit || license) && (
        <Section title="Litsenziya">
          <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] p-2.5 text-[10.5px] text-white/55 leading-relaxed">
            {license && <div className="text-white/80 font-medium mb-1">{license}</div>}
            {credit ?? "Atribut talab qilinmaydi."}
          </div>
        </Section>
      )}
    </Body>
  );
}

function AdjustPanel({ clip, set, checkpoint }: { clip: MediaClip; set: SetFn; checkpoint: () => void }) {
  const a = { ...DEFAULT_ADJUST, ...clip.adjust };
  const rows: [keyof Adjustments, string, number, number, number][] = [
    ["brightness", "Yorqinlik", -1, 1, 0.01],
    ["contrast", "Kontrast", -1, 1, 0.01],
    ["saturation", "To'yinganlik", -1, 1, 0.01],
    ["temperature", "Harorat", -1, 1, 0.01],
    ["tint", "Tus", -1, 1, 0.01],
    ["hue", "Rang aylanishi", -180, 180, 1],
    ["sharpen", "Aniqlik", 0, 1, 0.01],
    ["vignette", "Vinyetka", 0, 1, 0.01],
    ["blur", "Xiralik", 0, 30, 0.5],
  ];
  return (
    <>
      <Section title="Filtr">
        <div className="grid grid-cols-4 gap-1.5">
          {Object.entries(FILTER_PRESETS)
            .slice(0, 16)
            .map(([id, f]) => (
              <button key={id} onClick={() => set({ filter: id })} title={f.label} className="flex flex-col items-center gap-0.5">
                <span className={cn("w-full aspect-square rounded-md ring-2", clip.filter === id ? "ring-cyan-300" : "ring-transparent hover:ring-white/30")} style={{ background: f.swatch }} />
                <span className="text-[9px] text-white/50 truncate max-w-full">{f.label}</span>
              </button>
            ))}
        </div>
        {clip.filter !== "none" && (
          <Slider label="Filtr kuchi" value={clip.filterIntensity ?? 1} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => set({ filterIntensity: v }, true)} />
        )}
        <p className="text-[10px] text-white/35">Barcha {Object.keys(FILTER_PRESETS).length} ta filtr chap paneldagi “Filtr” bo&apos;limida.</p>
      </Section>
      <Section title="Sozlash" action={<ResetBtn onClick={() => set({ adjust: undefined })} />}>
        {rows.map(([key, label, min, max, step]) => (
          <Slider
            key={key}
            label={label}
            value={a[key]}
            min={min}
            max={max}
            step={step}
            display={key === "hue" ? `${Math.round(a[key])}°` : key === "blur" ? `${round(a[key], 1)}` : `${Math.round(a[key] * 100)}`}
            onDown={checkpoint}
            onChange={(v) => set({ adjust: { ...clip.adjust, [key]: v } }, true)}
          />
        ))}
      </Section>
    </>
  );
}

const MASKS: [MaskShape, string][] = [
  ["none", "Yo'q"],
  ["circle", "Doira"],
  ["rect", "To'rtburchak"],
  ["linear", "Chiziqli"],
  ["mirror", "Ko'zgu"],
  ["star", "Yulduz"],
  ["heart", "Yurak"],
  ["diamond", "Romb"],
];

function MaskPanel({ mask, onChange, checkpoint }: { mask: Mask | undefined; onChange: (m: Mask | undefined, live?: boolean) => void; checkpoint: () => void }) {
  const m: Mask = mask ?? { shape: "none", size: 0.6, feather: 0.1, x: 0, y: 0, rotation: 0, invert: false };
  const upd = (p: Partial<Mask>, live = false) => onChange({ ...m, ...p }, live);
  return (
    <>
      <Section title="Maska shakli">
        <div className="grid grid-cols-4 gap-1.5">
          {MASKS.map(([id, label]) => (
            <AnimCell key={id} active={m.shape === id} label={label} onClick={() => (id === "none" ? onChange(undefined) : upd({ shape: id }))} />
          ))}
        </div>
      </Section>
      {m.shape !== "none" && (
        <Section title="Parametrlar">
          <Slider label="O'lcham" value={m.size} min={0.05} max={1.5} step={0.01} pct onDown={checkpoint} onChange={(v) => upd({ size: v }, true)} />
          {["circle", "linear", "mirror", "rect"].includes(m.shape) && (
            <Slider label="Yumshoqlik" value={m.feather} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => upd({ feather: v }, true)} />
          )}
          <Slider label="X" value={m.x} min={-1} max={1} step={0.01} onDown={checkpoint} onChange={(v) => upd({ x: v }, true)} />
          <Slider label="Y" value={m.y} min={-1} max={1} step={0.01} onDown={checkpoint} onChange={(v) => upd({ y: v }, true)} />
          {(m.shape === "linear" || m.shape === "mirror") && (
            <Slider label="Burchak" value={m.rotation} min={-180} max={180} step={1} unit="°" onDown={checkpoint} onChange={(v) => upd({ rotation: v }, true)} />
          )}
          {["circle", "linear", "mirror"].includes(m.shape) && <Switch label="Teskari maska" checked={m.invert} onChange={() => upd({ invert: !m.invert })} />}
        </Section>
      )}
    </>
  );
}

function ChromaSection({ chroma, onChange, checkpoint }: { chroma: ChromaKey | undefined; onChange: (c: ChromaKey | undefined, live?: boolean) => void; checkpoint: () => void }) {
  const c: ChromaKey = chroma ?? { enabled: false, color: "#00ff00", similarity: 0.45, smoothness: 0.2, spill: 0.4 };
  const upd = (p: Partial<ChromaKey>, live = false) => onChange({ ...c, ...p }, live);
  return (
    <Section title="Xromakey (yashil fon)">
      <Switch label="Fonni olib tashlash" checked={c.enabled} onChange={() => upd({ enabled: !c.enabled })} />
      {c.enabled && (
        <>
          <div className="flex items-center gap-2">
            {["#00ff00", "#00b140", "#0047bb", "#ffffff"].map((col) => (
              <button key={col} onClick={() => upd({ color: col })} className={cn("size-6 rounded-full ring-2", c.color === col ? "ring-cyan-300" : "ring-white/15")} style={{ background: col }} />
            ))}
            <label className="text-[10px] text-white/50 ml-auto inline-flex items-center gap-1.5">
              Rang
              <input type="color" value={c.color} onChange={(e) => upd({ color: e.target.value })} className="size-6 bg-transparent" />
            </label>
          </div>
          <Slider label="O'xshashlik" value={c.similarity} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => upd({ similarity: v }, true)} />
          <Slider label="Yumshoqlik" value={c.smoothness} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => upd({ smoothness: v }, true)} />
          <Slider label="Rang to'kilishini kamaytirish" value={c.spill} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => upd({ spill: v }, true)} />
        </>
      )}
    </Section>
  );
}

// ---------- Text ----------

type TextTab = "text" | "style" | "anim" | "transform";

function TextInspector({ clip, set, checkpoint }: { clip: TextClip; set: SetFn; checkpoint: () => void }) {
  const [tab, setTab] = useState<TextTab>("text");
  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["text", "Matn"],
          ["style", "Uslub"],
          ["anim", "Animatsiya"],
          ["transform", "Joylashuv"],
        ]}
      />
      <Body>
        {tab === "text" && (
          <>
            <Section title="Matn">
              <textarea
                value={clip.text}
                onFocus={checkpoint}
                onChange={(e) => set({ text: e.target.value }, true)}
                rows={3}
                className="w-full rounded-lg bg-black/40 ring-1 ring-white/10 focus:ring-cyan-300/70 outline-none p-2.5 text-sm text-white resize-none"
              />
            </Section>
            <Section title="Shablon">
              <select
                value={clip.style}
                onChange={(e) => {
                  const base = { ...templatePatch(e.target.value) };
                  set({
                    font: undefined, fontSize: undefined, fontWeight: undefined, strokeColor: undefined, strokeWidth: undefined, shadowColor: undefined,
                    shadowBlur: undefined, bgColor: undefined, bgOpacity: undefined, textIn: undefined, textOut: undefined, textLoop: undefined,
                    uppercase: undefined, italic: undefined, letterSpacing: undefined, ...base, position: clip.position,
                  } as Partial<TextClip>);
                }}
                className="w-full h-8 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08] text-xs text-white px-2 outline-none"
              >
                {Object.entries(TEXT_TEMPLATES).map(([id, t]) => (
                  <option key={id} value={id} className="bg-[#16161b]">
                    {t.label}
                  </option>
                ))}
              </select>
            </Section>
            <FontPicker value={clip.font} onChange={(f) => set({ font: f })} />
            <Section title="Shrift parametrlari">
              <Slider label="O'lcham" value={clip.fontSize ?? 90} min={16} max={320} step={1} unit="px" onDown={checkpoint} onChange={(v) => set({ fontSize: v }, true)} />
              <Slider label="Qalinlik" value={clip.fontWeight ?? 800} min={100} max={900} step={100} onDown={checkpoint} onChange={(v) => set({ fontWeight: v }, true)} />
              <Slider label="Harf oralig'i" value={clip.letterSpacing ?? 0} min={-10} max={40} step={0.5} onDown={checkpoint} onChange={(v) => set({ letterSpacing: v }, true)} />
              <Slider label="Qator balandligi" value={clip.lineHeight ?? 1.15} min={0.8} max={2} step={0.01} onDown={checkpoint} onChange={(v) => set({ lineHeight: v }, true)} />
              <div className="flex gap-1.5">
                <ToggleBtn active={!!clip.italic} onClick={() => set({ italic: !clip.italic })} title="Kursiv">
                  <Italic className="size-3.5" />
                </ToggleBtn>
                <ToggleBtn active={!!clip.uppercase} onClick={() => set({ uppercase: !clip.uppercase })} title="Katta harflar">
                  <TypeIcon className="size-3.5" /> AA
                </ToggleBtn>
                {(["left", "center", "right"] as const).map((al) => (
                  <ToggleBtn key={al} active={(clip.align ?? "center") === al} onClick={() => set({ align: al })} title="Tekislash">
                    {al === "left" ? <AlignLeft className="size-3.5" /> : al === "center" ? <AlignCenter className="size-3.5" /> : <AlignRight className="size-3.5" />}
                  </ToggleBtn>
                ))}
              </div>
            </Section>
          </>
        )}
        {tab === "style" && (
          <>
            <Section title="Rang">
              <ColorRow value={clip.color} onChange={(c) => set({ color: c ?? "#ffffff" })} />
            </Section>
            <Section title="Kontur">
              <ColorRow value={clip.strokeColor} onChange={(c) => set({ strokeColor: c, strokeWidth: c ? clip.strokeWidth || 4 : 0 })} allowNone />
              {clip.strokeColor && <Slider label="Qalinligi" value={clip.strokeWidth ?? 0} min={0} max={20} step={0.5} onDown={checkpoint} onChange={(v) => set({ strokeWidth: v }, true)} />}
            </Section>
            <Section title="Soya / nur">
              <ColorRow value={clip.shadowColor} onChange={(c) => set({ shadowColor: c, shadowBlur: c ? clip.shadowBlur ?? 20 : undefined })} allowNone />
              {clip.shadowColor && <Slider label="Yoyilish" value={clip.shadowBlur ?? 0} min={0} max={80} step={1} onDown={checkpoint} onChange={(v) => set({ shadowBlur: v }, true)} />}
            </Section>
            <Section title="Fon">
              <ColorRow value={clip.bgColor} onChange={(c) => set({ bgColor: c, bgOpacity: c ? clip.bgOpacity ?? 1 : undefined })} allowNone />
              {clip.bgColor && <Slider label="Shaffoflik" value={clip.bgOpacity ?? 1} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => set({ bgOpacity: v }, true)} />}
            </Section>
            <Section title="Ajratish rangi (karaoke)">
              <ColorRow value={clip.highlightColor} onChange={(c) => set({ highlightColor: c })} allowNone />
            </Section>
          </>
        )}
        {tab === "anim" && <TextAnimations clip={clip} set={set} checkpoint={checkpoint} />}
        {tab === "transform" && (
          <>
            <Section title="Joy">
              <Segmented
                value={clip.position}
                onChange={(v) => set({ position: v })}
                options={[
                  ["top", "Tepa"],
                  ["center", "Markaz"],
                  ["bottom", "Past"],
                ]}
              />
            </Section>
            <TransformSection clip={clip} checkpoint={checkpoint} props={["x", "y", "scale", "rotation", "opacity"]} />
            <TransitionSection clip={clip} set={set} checkpoint={checkpoint} />
          </>
        )}
      </Body>
    </>
  );
}

function TextAnimations({ clip, set, checkpoint }: { clip: TextClip; set: SetFn; checkpoint: () => void }) {
  const [mode, setMode] = useState<"text" | "clip">("text");
  return (
    <>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          ["text", "Harf / so'z animatsiyasi"],
          ["clip", "Blok animatsiyasi"],
        ]}
      />
      {mode === "text" ? (
        <>
          {(["in", "out", "loop"] as const).map((kind) => {
            const key = kind === "in" ? "textIn" : kind === "out" ? "textOut" : "textLoop";
            const value = clip[key];
            return (
              <Section key={kind} title={kind === "in" ? "Kirish" : kind === "out" ? "Chiqish" : "Takrorlanuvchi"}>
                <div className="grid grid-cols-3 gap-1.5">
                  <AnimCell active={!value} label="Yo'q" onClick={() => set({ [key]: undefined })} />
                  {textAnimsOfKind(kind).map((a) => (
                    <AnimCell key={a.id} active={value === a.id} label={a.label} onClick={() => set({ [key]: a.id })} />
                  ))}
                </div>
              </Section>
            );
          })}
        </>
      ) : (
        <ClipAnimations clip={clip} set={set} checkpoint={checkpoint} />
      )}
    </>
  );
}

function FontPicker({ value, onChange }: { value: string | undefined; onChange: (f: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = FONTS.filter((f) => !q || f.family.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => {
    if (value) void loadFontFamily(value);
  }, [value]);
  return (
    <Section title="Shrift">
      <button
        onClick={() => setOpen(!open)}
        className="w-full h-9 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08] hover:ring-white/20 text-left px-3 text-[15px] text-white flex items-center justify-between"
        style={{ fontFamily: value ? `"${value}"` : undefined }}
      >
        {value ?? "Standart (Bricolage)"}
        <span className="text-[10px] text-white/40 font-sans">{open ? "yopish" : "o'zgartirish"}</span>
      </button>
      {open && (
        <div className="rounded-lg ring-1 ring-white/10 bg-black/30 p-2 space-y-2">
          <SearchBox value={q} onChange={setQ} placeholder={`${FONTS.length} ta shrift ichidan qidirish`} />
          <div className="max-h-56 overflow-y-auto panel-scroll space-y-0.5">
            {list.map((f) => (
              <FontOption key={f.family} family={f.family} active={value === f.family} cyrillic={f.cyrillic} onClick={() => onChange(f.family)} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function FontOption({ family, active, cyrillic, onClick }: { family: string; active: boolean; cyrillic: boolean; onClick: () => void }) {
  const [ready, setReady] = useState(false);
  const ref = React.useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) {
        io.disconnect();
        void loadFontFamily(family).then(() => setReady(true));
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [family]);
  return (
    <button ref={ref} onClick={onClick} className={cn("w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between", active ? "bg-cyan-400/15" : "hover:bg-white/[0.06]")}>
      <span className="text-[15px] text-white truncate" style={{ fontFamily: ready ? `"${family}"` : undefined }}>
        {family}
      </span>
      {cyrillic && <span className="text-[9px] text-white/35">Кир</span>}
    </button>
  );
}

// ---------- Sticker / effect ----------

function StickerInspector({ clip, set, checkpoint }: { clip: StickerClip; set: SetFn; checkpoint: () => void }) {
  const [tab, setTab] = useState<"basic" | "anim">("basic");
  const shape = clip.sticker.startsWith("shape:") ? shapeById(clip.sticker.slice(6)) : null;
  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["basic", "Asosiy"],
          ["anim", "Animatsiya"],
        ]}
      />
      <Body>
        {tab === "basic" && (
          <>
            {shape && (
              <Section title="Rang">
                <ColorRow value={clip.color ?? shape.defaultColor} onChange={(c) => set({ color: c })} />
              </Section>
            )}
            <TransformSection clip={clip} checkpoint={checkpoint} props={["x", "y", "scale", "rotation", "opacity"]} />
            <Section title="Kadr">
              <div className="flex gap-1.5">
                <ToggleBtn active={!!clip.flipH} onClick={() => set({ flipH: !clip.flipH })} title="Ko'zgu">
                  <FlipHorizontal2 className="size-3.5" /> Ko&apos;zgu
                </ToggleBtn>
              </div>
            </Section>
          </>
        )}
        {tab === "anim" && <ClipAnimations clip={clip} set={set} checkpoint={checkpoint} />}
      </Body>
    </>
  );
}

function EffectInspector({ clip, set, checkpoint }: { clip: EffectClip; set: SetFn; checkpoint: () => void }) {
  return (
    <Body>
      <Section title="Kuchi">
        <Slider label="Intensivlik" value={clip.intensity} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => set({ intensity: v }, true)} />
      </Section>
      {Object.entries(EFFECT_GROUPS).map(([g, label]) => (
        <Section key={g} title={label}>
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries(EFFECTS)
              .filter(([, e]) => e.group === g)
              .map(([id, e]) => (
                <AnimCell key={id} active={clip.effect === id} label={`${e.icon} ${e.label}`} onClick={() => set({ effect: id })} />
              ))}
          </div>
        </Section>
      ))}
    </Body>
  );
}

// ---------- Project ----------

const BG_GRADIENTS = [
  "linear-gradient(135deg,#0f172a,#7c3aed)",
  "linear-gradient(135deg,#f97316,#db2777)",
  "linear-gradient(135deg,#0ea5e9,#22c55e)",
  "linear-gradient(135deg,#111827,#374151)",
  "linear-gradient(135deg,#fde68a,#f472b6)",
  "radial-gradient(circle at 30% 30%,#1e3a8a,#020617)",
];

function ProjectSettings() {
  const { project, commit, preview, checkpoint } = useEditor();
  const bg = project.background ?? { type: "color" as const, color: "#000000", blur: 40 };
  return (
    <div className="p-4 space-y-6">
      <div className="rounded-xl border border-dashed border-white/10 p-3.5 flex items-center gap-3 text-white/50">
        <MousePointerClick className="size-5 shrink-0" />
        <p className="text-[11px] leading-relaxed">Timeline yoki previewdan element tanlang — xususiyatlari shu yerda chiqadi. Hozir loyiha sozlamalari.</p>
      </div>
      <Section title="Kanvas o'lchami">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ASPECTS) as AspectRatio[]).map((a) => {
            const { width, height, label } = ASPECTS[a];
            return (
              <button
                key={a}
                onClick={() => commit({ ...project, aspect: a })}
                className={cn("rounded-lg p-2 flex flex-col items-center gap-1.5 ring-1", project.aspect === a ? "ring-cyan-300 bg-cyan-400/10" : "ring-white/10 hover:ring-white/30")}
              >
                <span className="border-2 border-white/60 rounded-sm" style={{ width: (width / Math.max(width, height)) * 26, height: (height / Math.max(width, height)) * 26 }} />
                <span className="text-[11px] text-white font-medium">{a}</span>
                <span className="text-[9px] text-white/40 text-center leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Kanvas foni">
        <Segmented
          value={bg.type}
          onChange={(v) => commit({ ...project, background: { ...bg, type: v } })}
          options={[
            ["blur", "Blur"],
            ["color", "Rang"],
            ["gradient", "Gradient"],
          ]}
        />
        {bg.type === "blur" && <Slider label="Blur kuchi" value={bg.blur} min={5} max={100} step={1} onDown={checkpoint} onChange={(v) => preview({ ...project, background: { ...bg, blur: v } })} />}
        {bg.type === "color" && <ColorRow value={bg.color} onChange={(c) => commit({ ...project, background: { ...bg, color: c ?? "#000000" } })} />}
        {bg.type === "gradient" && (
          <div className="grid grid-cols-6 gap-1.5">
            {BG_GRADIENTS.map((g) => (
              <button key={g} onClick={() => commit({ ...project, background: { ...bg, gradient: g } })} className={cn("aspect-square rounded-md ring-2", bg.gradient === g ? "ring-cyan-300" : "ring-transparent")} style={{ background: g }} />
            ))}
          </div>
        )}
        <p className="text-[10px] text-white/35">Fon kadr to&apos;liq qoplanmaganda ko&apos;rinadi (Moslash rejimi, kichraytirilgan klip).</p>
      </Section>
      <Section title="Kadr tezligi">
        <Chips value={String(project.fps)} options={[["24", "24 fps"], ["25", "25 fps"], ["30", "30 fps"], ["60", "60 fps"]]} onChange={(v) => commit({ ...project, fps: Number(v) })} />
      </Section>
      <Section title="Loyiha rangi">
        <div className="grid grid-cols-6 gap-1.5">
          {Object.entries(FILTER_PRESETS)
            .slice(0, 18)
            .map(([id, f]) => (
              <button
                key={id}
                title={f.label}
                onClick={() => commit({ ...project, grade: { ...project.grade, filter: id } })}
                className={cn("aspect-square rounded-md ring-2", project.grade.filter === id ? "ring-cyan-300" : "ring-transparent hover:ring-white/30")}
                style={{ background: f.swatch }}
              />
            ))}
        </div>
        {(["letterbox", "vignette", "grain"] as const).map((key) => (
          <Switch key={key} label={{ letterbox: "Letterbox", vignette: "Vinyetka", grain: "Plyonka donasi" }[key]} checked={project.grade[key]} onChange={() => commit({ ...project, grade: { ...project.grade, [key]: !project.grade[key] } })} />
        ))}
      </Section>
    </div>
  );
}
