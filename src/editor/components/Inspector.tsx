"use client";

import { MousePointerClick, Trash2 } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";
import { removeClip, updateClip } from "../ops";
import { ASPECTS, FILTERS, MOTIONS, TEXT_STYLES, TRANSITIONS } from "../presets";
import { useEditor } from "../store";
import type { AspectRatio, Clip, MediaClip, TextClip } from "../types";
import { formatTime, round } from "../utils";
import { Switch } from "./LibraryPanel";

export function Inspector() {
  const { project, selectedId, assets, commit, preview, checkpoint, select } = useEditor();
  const clip = project.clips.find((c) => c.id === selectedId);

  if (!clip) return <ProjectSettings />;

  /** Slider changes stream through `preview`; a checkpoint is taken on pointer down. */
  const set = (patch: Partial<Clip>, live = false) =>
    live ? preview(updateClip(project, clip.id, patch)) : commit(updateClip(project, clip.id, patch));

  const asset = clip.type === "media" ? assets.find((a) => a.id === clip.assetId) : undefined;

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-white/40">{clip.type === "text" ? "Matn" : asset?.kind === "audio" ? "Audio klip" : "Video klip"}</div>
          <div className="text-sm font-semibold text-white truncate">{clip.type === "text" ? clip.text : asset?.name}</div>
          <div className="text-[11px] text-white/40 font-mono mt-0.5">
            {formatTime(clip.start)} → {formatTime(clip.start + clip.duration)}
          </div>
        </div>
        <button
          onClick={() => {
            commit(removeClip(project, clip.id));
            select(null);
          }}
          className="size-8 grid place-items-center rounded-md text-white/50 hover:text-rose-300 hover:bg-rose-500/10"
          title="O'chirish"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {clip.type === "text" ? (
        <TextFields clip={clip} set={set} checkpoint={checkpoint} />
      ) : (
        <MediaFields clip={clip} set={set} checkpoint={checkpoint} isAudio={asset?.kind === "audio"} />
      )}

      {asset?.kind !== "audio" && (
        <Group title="Kirish o'tishi">
          <Chips
            value={clip.transitionIn}
            options={Object.entries(TRANSITIONS).map(([id, t]) => [id, t.label])}
            onChange={(v) => set({ transitionIn: v as Clip["transitionIn"] })}
          />
          {clip.transitionIn !== "none" && (
            <Slider label="Davomiylik" value={clip.transitionDuration} min={0.1} max={2} step={0.05} unit="s" onDown={checkpoint} onChange={(v) => set({ transitionDuration: v }, true)} />
          )}
        </Group>
      )}
    </div>
  );
}

function MediaFields({
  clip,
  set,
  checkpoint,
  isAudio,
}: {
  clip: MediaClip;
  set: (p: Partial<MediaClip>, live?: boolean) => void;
  checkpoint: () => void;
  isAudio: boolean;
}) {
  return (
    <>
      <Group title="Asosiy">
        <Slider
          label="Tezlik"
          value={clip.speed}
          min={0.25}
          max={4}
          step={0.05}
          unit="x"
          onDown={checkpoint}
          onChange={(v) => set({ speed: v, duration: round((clip.duration * clip.speed) / v, 3) }, true)}
        />
        <Slider label="Ovoz" value={clip.volume} min={0} max={1.5} step={0.01} pct onDown={checkpoint} onChange={(v) => set({ volume: v }, true)} />
        {!isAudio && (
          <>
            <Slider label="Shaffoflik" value={clip.opacity} min={0} max={1} step={0.01} pct onDown={checkpoint} onChange={(v) => set({ opacity: v }, true)} />
            <Slider label="Masshtab" value={clip.scale} min={0.5} max={2} step={0.01} pct onDown={checkpoint} onChange={(v) => set({ scale: v }, true)} />
          </>
        )}
      </Group>
      {!isAudio && (
        <>
          <Group title="Rang">
            <div className="grid grid-cols-5 gap-1.5">
              {Object.entries(FILTERS).map(([id, f]) => (
                <button
                  key={id}
                  title={f.label}
                  onClick={() => set({ filter: id as MediaClip["filter"] })}
                  className={cn("aspect-square rounded-md ring-2", clip.filter === id ? "ring-violet-400" : "ring-transparent hover:ring-white/30")}
                  style={{ background: f.swatch }}
                />
              ))}
            </div>
          </Group>
          <Group title="Kamera harakati">
            <Chips value={clip.motion} options={Object.entries(MOTIONS).map(([id, m]) => [id, m.label])} onChange={(v) => set({ motion: v as MediaClip["motion"] })} />
          </Group>
        </>
      )}
    </>
  );
}

function TextFields({
  clip,
  set,
  checkpoint,
}: {
  clip: TextClip;
  set: (p: Partial<TextClip>, live?: boolean) => void;
  checkpoint: () => void;
}) {
  return (
    <>
      <Group title="Matn">
        <textarea
          value={clip.text}
          onFocus={checkpoint}
          onChange={(e) => set({ text: e.target.value }, true)}
          rows={3}
          className="w-full rounded-lg bg-black/40 ring-1 ring-white/10 focus:ring-violet-400 outline-none p-2.5 text-sm text-white resize-none"
        />
      </Group>
      <Group title="Uslub">
        <Chips value={clip.style} options={Object.entries(TEXT_STYLES).map(([id, s]) => [id, s.label])} onChange={(v) => set({ style: v as TextClip["style"] })} />
      </Group>
      <Group title="Joylashuv">
        <Chips
          value={clip.position}
          options={[
            ["top", "Tepa"],
            ["center", "Markaz"],
            ["bottom", "Past"],
          ]}
          onChange={(v) => set({ position: v as TextClip["position"] })}
        />
      </Group>
      <Group title="Rang">
        <div className="flex gap-1.5">
          {["#ffffff", "#facc15", "#f472b6", "#22d3ee", "#a3e635", "#000000"].map((c) => (
            <button
              key={c}
              onClick={() => set({ color: c })}
              className={cn("size-7 rounded-full ring-2", clip.color === c ? "ring-violet-400" : "ring-white/10")}
              style={{ background: c }}
            />
          ))}
        </div>
      </Group>
    </>
  );
}

function ProjectSettings() {
  const { project, commit } = useEditor();
  return (
    <div className="p-4 space-y-5">
      <div className="rounded-xl border border-dashed border-white/10 p-4 flex items-center gap-3 text-white/50">
        <MousePointerClick className="size-5 shrink-0" />
        <p className="text-xs leading-relaxed">Timelinedan klip tanlang — uning xususiyatlari shu yerda chiqadi. Hozir loyiha sozlamalari ko&apos;rsatilmoqda.</p>
      </div>
      <Group title="Format">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ASPECTS) as AspectRatio[]).map((a) => {
            const { width, height, label } = ASPECTS[a];
            return (
              <button
                key={a}
                onClick={() => commit({ ...project, aspect: a })}
                className={cn(
                  "rounded-lg p-2 flex flex-col items-center gap-1.5 ring-1",
                  project.aspect === a ? "ring-violet-400 bg-violet-500/10" : "ring-white/10 hover:ring-white/30",
                )}
              >
                <span className="border-2 border-white/60 rounded-sm" style={{ width: (width / Math.max(width, height)) * 28, height: (height / Math.max(width, height)) * 28 }} />
                <span className="text-[11px] text-white font-medium">{a}</span>
                <span className="text-[9px] text-white/40">{label}</span>
              </button>
            );
          })}
        </div>
      </Group>
      <Group title="Butun loyiha rangi">
        <div className="grid grid-cols-5 gap-1.5">
          {Object.entries(FILTERS).map(([id, f]) => (
            <button
              key={id}
              title={f.label}
              onClick={() => commit({ ...project, grade: { ...project.grade, filter: id as typeof project.grade.filter } })}
              className={cn("aspect-square rounded-md ring-2", project.grade.filter === id ? "ring-violet-400" : "ring-transparent hover:ring-white/30")}
              style={{ background: f.swatch }}
            />
          ))}
        </div>
        {(["letterbox", "vignette", "grain"] as const).map((key) => (
          <div key={key} className="flex items-center justify-between text-xs text-white/70 py-1">
            {{ letterbox: "Letterbox", vignette: "Vinyetka", grain: "Plyonka donasi" }[key]}
            <Switch checked={project.grade[key]} onChange={() => commit({ ...project, grade: { ...project.grade, [key]: !project.grade[key] } })} />
          </div>
        ))}
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{title}</h4>
      {children}
    </section>
  );
}

function Chips({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] ring-1 transition-colors",
            value === id ? "bg-violet-500/20 ring-violet-400 text-white" : "ring-white/10 text-white/60 hover:text-white hover:ring-white/30",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  pct,
  onChange,
  onDown,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  pct?: boolean;
  onChange: (v: number) => void;
  onDown: () => void;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-white/60">{label}</span>
        <span className="text-white font-mono tabular-nums">{pct ? `${Math.round(value * 100)}%` : `${round(value, 2)}${unit}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onDown}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-400"
      />
    </label>
  );
}
