"use client";

import { FilePlus2, RotateCcw, X } from "lucide-react";
import { createInitialProject } from "../ops";
import { ASPECTS } from "../presets";
import { useEditor } from "../store";
import { emptyProject, PROJECT_TEMPLATES } from "../templates";

/** "Yangi loyiha" dialog: blank project, the demo, or a ready-made template (undoable). */
export function TemplatePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { assets, commit, addAssets, select } = useEditor();
  if (!open) return null;

  const start = (build: () => { project: Parameters<typeof commit>[0]; assets?: typeof assets }) => {
    const r = build();
    if (r.assets?.length) addAssets(r.assets);
    commit(r.project);
    select(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-[720px] max-h-[90vh] overflow-y-auto rounded-2xl bg-[#121216] ring-1 ring-white/10 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-white">Yangi loyiha</h2>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md text-white/50 hover:text-white hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-[11px] text-white/45 mb-4">
          Shablonni tanlang, keyin kadrlarni o&apos;z videolaringiz bilan almashtiring (klipni tanlang → Asosiy → Mediani almashtirish). Ctrl+Z bilan avvalgi loyihaga qaytish mumkin.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <button onClick={() => start(() => ({ project: emptyProject() }))} className="rounded-xl ring-1 ring-white/10 hover:ring-cyan-300/60 bg-white/[0.03] p-3 text-left">
            <FilePlus2 className="size-5 text-white/70 mb-2" />
            <div className="text-[13px] font-medium text-white">Bo&apos;sh loyiha</div>
            <div className="text-[10.5px] text-white/45">16:9 · hech narsasiz</div>
          </button>
          <button onClick={() => start(() => ({ project: createInitialProject(assets) }))} className="rounded-xl ring-1 ring-white/10 hover:ring-cyan-300/60 bg-white/[0.03] p-3 text-left">
            <RotateCcw className="size-5 text-white/70 mb-2" />
            <div className="text-[13px] font-medium text-white">Demo loyiha</div>
            <div className="text-[10.5px] text-white/45">4 ta xom klip — AI bilan sinab ko&apos;rish uchun</div>
          </button>
          {PROJECT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => start(() => t.build(assets))}
              className="rounded-xl ring-1 ring-white/10 hover:ring-cyan-300/60 bg-gradient-to-br from-white/[0.05] to-transparent p-3 text-left"
            >
              <div className="text-2xl mb-1.5">{t.emoji}</div>
              <div className="text-[13px] font-medium text-white">{t.label}</div>
              <div className="text-[10.5px] text-white/45 leading-snug">{t.description}</div>
              <div className="mt-1.5 text-[10px] text-cyan-300/80">
                {t.aspect} · {ASPECTS[t.aspect].label}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
