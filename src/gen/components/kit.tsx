"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small building blocks shared by the studio panels. */

export function Field({ label, hint, children, right }: { label: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">{label}</span>
        {right}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">{hint}</p>}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange, size = "md" }: { value: T | null; options: [T, string][]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "rounded-lg ring-1 transition-colors whitespace-nowrap",
            size === "sm" ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-[12px]",
            value === id ? "bg-white text-black ring-white font-semibold" : "ring-white/12 text-white/65 hover:text-white hover:ring-white/30",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Range({ label, value, min, max, step = 1, format, onChange }: { label: string; value: number; min: number; max: number; step?: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-[12px] text-white/60 mb-1.5">
        <span>{label}</span>
        <span className="tabular-nums text-white/85">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ams-range w-full"
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "info" | "error"; children: ReactNode }) {
  const style = {
    warn: "bg-amber-500/10 text-amber-100/90 ring-amber-400/25",
    info: "bg-sky-500/10 text-sky-100/90 ring-sky-400/25",
    error: "bg-rose-500/10 text-rose-100 ring-rose-400/30",
  }[tone];
  return (
    <div className={cn("flex gap-2 rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ring-1", style)}>
      <TriangleAlert className="size-4 shrink-0 mt-px" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function PrimaryButton({ children, busy, disabled, onClick, className }: { children: ReactNode; busy?: boolean; disabled?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "w-full h-12 rounded-2xl text-[14px] font-semibold text-white inline-flex items-center justify-center gap-2 transition",
        "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 shadow-[0_12px_40px_-12px_rgba(217,70,239,0.8)] hover:brightness-110 active:scale-[0.99] disabled:opacity-45 disabled:shadow-none",
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, active, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-9 px-3 rounded-xl text-[12.5px] inline-flex items-center justify-center gap-1.5 ring-1 transition-colors disabled:opacity-40",
        active ? "bg-white/15 ring-white/30 text-white" : "bg-white/[0.04] ring-white/10 text-white/80 hover:bg-white/[0.09] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export const fmtUsd = (v: number) => (v < 0.1 ? `$${v.toFixed(3).replace(/0+$/, "").replace(/\.$/, ".0")}` : `$${v.toFixed(2)}`);
