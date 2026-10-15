"use client";

import { Diamond, RotateCcw, Search, X } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";
import { round } from "../utils";

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Chips({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: string | null;
  options: [string, string][];
  onChange: (v: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "rounded-md ring-1 transition-colors whitespace-nowrap",
            size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11px]",
            value === id ? "bg-cyan-400/15 ring-cyan-300/70 text-white" : "ring-white/10 text-white/60 hover:text-white hover:ring-white/25",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-white/[0.04] p-0.5 ring-1 ring-white/[0.06]">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors inline-flex items-center justify-center gap-1",
            value === id ? "bg-white/[0.12] text-white shadow-sm" : "text-white/50 hover:text-white",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  pct,
  display,
  onChange,
  onDown,
  onReset,
  keyframe,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  pct?: boolean;
  display?: string;
  onChange: (v: number) => void;
  onDown: () => void;
  onReset?: () => void;
  /** Keyframe toggle: active = a keyframe exists at the playhead, has = the property is animated. */
  keyframe?: { active: boolean; has: boolean; onToggle: () => void };
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="group/slider">
      <div className="flex items-center justify-between text-[11px] mb-1.5 gap-2">
        <span className="text-white/65 truncate">{label}</span>
        <div className="flex items-center gap-1">
          {onReset && (
            <button onClick={onReset} className="opacity-0 group-hover/slider:opacity-100 text-white/35 hover:text-white" title="Asliga qaytarish">
              <RotateCcw className="size-3" />
            </button>
          )}
          <span className="text-white/90 font-mono tabular-nums min-w-[42px] text-right">
            {display ?? (pct ? `${Math.round(value * 100)}%` : `${round(value, 2)}${unit}`)}
          </span>
          {keyframe && (
            <button
              onClick={keyframe.onToggle}
              title={keyframe.active ? "Keyframe'ni o'chirish" : "Keyframe qo'shish"}
              className={cn("size-5 grid place-items-center rounded", keyframe.active ? "text-cyan-300" : keyframe.has ? "text-cyan-300/50 hover:text-cyan-200" : "text-white/30 hover:text-white")}
            >
              <Diamond className={cn("size-3", keyframe.active && "fill-current")} />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onDown}
        onKeyDown={onDown}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ams-range w-full"
        style={{ "--fill": `${Math.max(0, Math.min(100, fill))}%` } as React.CSSProperties}
      />
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  const btn = (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={cn("w-8 h-[18px] shrink-0 rounded-full relative transition-colors", checked ? "bg-cyan-400" : "bg-white/15")}
    >
      <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-white transition-all shadow", checked ? "left-4" : "left-0.5")} />
    </button>
  );
  if (!label) return btn;
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-white/75 py-1 cursor-pointer">
      {label}
      {btn}
    </label>
  );
}

export const SWATCHES = ["#ffffff", "#000000", "#facc15", "#fb923c", "#ef4444", "#f472b6", "#a855f7", "#3b82f6", "#22d3ee", "#22c55e", "#a3e635", "#78716c"];

export function ColorRow({ value, onChange, allowNone }: { value: string | undefined; onChange: (c: string | undefined) => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowNone && (
        <button
          onClick={() => onChange(undefined)}
          title="Yo'q"
          className={cn("size-6 rounded-full ring-2 grid place-items-center bg-white/5", !value ? "ring-cyan-300" : "ring-white/10")}
        >
          <X className="size-3 text-white/50" />
        </button>
      )}
      {SWATCHES.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn("size-6 rounded-full ring-2 transition", value?.toLowerCase() === c ? "ring-cyan-300 scale-110" : "ring-white/10 hover:ring-white/30")}
          style={{ background: c }}
        />
      ))}
      <label className="size-6 rounded-full ring-2 ring-white/10 overflow-hidden cursor-pointer relative" title="Boshqa rang" style={{ background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }}>
        <input type="color" value={value && value.startsWith("#") && value.length === 7 ? value : "#ffffff"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/35" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-8 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08] focus:ring-cyan-300/60 outline-none pl-8 pr-7 text-xs text-white placeholder:text-white/30"
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function CategoryBar({ value, options, onChange }: { value: string | null; options: [string, string][]; onChange: (v: string | null) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-0.5 px-0.5">
      {[["__all", "Hammasi"] as [string, string], ...options].map(([id, label]) => {
        const active = (id === "__all" && value === null) || value === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id === "__all" ? null : id)}
            className={cn(
              "shrink-0 px-2.5 h-6 rounded-full text-[11px] transition-colors",
              active ? "bg-white text-black font-medium" : "bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/10",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function PanelHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-[13px] font-semibold text-white">{title}</h3>
      {hint && <span className="text-[10px] text-white/35">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-xs text-white/35">{children}</div>;
}
