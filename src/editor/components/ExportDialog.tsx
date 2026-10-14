"use client";

import { CheckCircle2, Film, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ASPECTS } from "../presets";
import { useEditor } from "../store";
import { formatShort, projectDuration } from "../utils";

const QUALITIES = [
  { id: "720p", label: "720p", scale: 2 / 3 },
  { id: "1080p", label: "1080p", scale: 1 },
  { id: "4k", label: "4K", scale: 2 },
];

/** Frontend mock of the render flow; the backend (Remotion Lambda) plugs in later. */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project } = useEditor();
  const [quality, setQuality] = useState("1080p");
  const [format, setFormat] = useState("MP4");
  const [progress, setProgress] = useState<number | null>(null);
  const total = projectDuration(project);
  const { width, height } = ASPECTS[project.aspect];
  const scale = QUALITIES.find((q) => q.id === quality)!.scale;

  useEffect(() => {
    if (!open) setProgress(null);
  }, [open]);

  useEffect(() => {
    if (progress === null || progress >= 100) return;
    const t = setTimeout(() => setProgress((p) => Math.min(100, (p ?? 0) + 2 + Math.random() * 5)), 120);
    return () => clearTimeout(t);
  }, [progress]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div
        className="w-[420px] rounded-2xl bg-[#121216] ring-1 ring-white/10 shadow-2xl p-5 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Videoni eksport qilish</h2>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md text-white/50 hover:text-white hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex gap-3 items-center rounded-xl bg-white/[0.03] p-3 mb-4">
          <div className="size-11 rounded-lg bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 grid place-items-center">
            <Film className="size-5 text-violet-200" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-white font-medium truncate">{project.name}</div>
            <div className="text-[11px] text-white/45">
              {formatShort(total)} · {Math.round(width * scale)}×{Math.round(height * scale)} · {project.fps}fps
            </div>
          </div>
        </div>

        {progress === null ? (
          <>
            <Field label="Sifat">
              {QUALITIES.map((q) => (
                <Opt key={q.id} active={quality === q.id} onClick={() => setQuality(q.id)}>
                  {q.label}
                </Opt>
              ))}
            </Field>
            <Field label="Format">
              {["MP4", "MOV", "GIF"].map((f) => (
                <Opt key={f} active={format === f} onClick={() => setFormat(f)}>
                  {f}
                </Opt>
              ))}
            </Field>
            <button
              onClick={() => setProgress(0)}
              className="w-full mt-2 h-10 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-semibold hover:brightness-110"
            >
              Render boshlash
            </button>
            <p className="mt-3 text-[10px] text-white/35 text-center">Demo rejim: haqiqiy render backend ulanganda ishlaydi.</p>
          </>
        ) : progress < 100 ? (
          <div className="py-2">
            <div className="flex justify-between text-xs text-white/60 mb-2">
              <span>Kadrlar render qilinmoqda…</span>
              <span className="font-mono">{Math.floor(progress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 text-[11px] text-white/35 font-mono">
              {Math.floor((progress / 100) * total * project.fps)} / {Math.ceil(total * project.fps)} kadr
            </div>
          </div>
        ) : (
          <div className="py-3 text-center">
            <CheckCircle2 className="size-10 text-emerald-400 mx-auto mb-2" />
            <div className="text-sm text-white font-medium">Tayyor!</div>
            <div className="text-[11px] text-white/45 mt-1">
              {project.name}.{format.toLowerCase()} · {quality}
            </div>
            <button disabled className="mt-4 w-full h-10 rounded-xl bg-white/10 text-white/50 text-sm font-medium cursor-not-allowed">
              Yuklab olish (backend kerak)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">{label}</div>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function Opt({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("h-9 rounded-lg text-xs font-medium ring-1", active ? "ring-violet-400 bg-violet-500/15 text-white" : "ring-white/10 text-white/60 hover:text-white")}
    >
      {children}
    </button>
  );
}
