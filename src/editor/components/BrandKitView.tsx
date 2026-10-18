"use client";

import { ArrowLeft, Check, ImagePlus, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { applyBrandKit, type BrandKit, DEFAULT_BRAND, type LogoCorner, logoAsset, prepareLogo, saveBrandKit, useBrandKit } from "../brand-kit";
import { loadFontFamily } from "../catalog/font-loader";
import { FONTS } from "../catalog/fonts";
import { saveMedia } from "../media-store";
import { useEditor } from "../store";
import { projectDuration } from "../utils";
import { ColorRow, Section } from "./ui";

const POPULAR = ["Montserrat", "Inter", "Poppins", "Bebas Neue", "Roboto", "Playfair Display", "Oswald", "Rubik", "Manrope", "Lora", "Anton", "Caveat"];
const CORNERS: [LogoCorner, string][] = [
  ["tl", "↖ Yuqori chap"],
  ["tr", "↗ Yuqori o'ng"],
  ["bl", "↙ Pastki chap"],
  ["br", "↘ Pastki o'ng"],
];

/**
 * Brand kit editor (logo, colours, font). Saves as you type; "Joriy videoga qo'llash" puts the
 * kit on the open project (font + colours on texts, logo in a corner for the whole video).
 */
export function BrandKitView({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const saved = useBrandKit();
  const kit: BrandKit = saved ?? DEFAULT_BRAND;
  const { project, assets, commit, addAssets } = useEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string[] | null>(null);
  const [fontReady, setFontReady] = useState(kit.font);

  const update = (patch: Partial<BrandKit>) => {
    setApplied(null);
    saveBrandKit({ ...kit, ...patch });
  };

  useEffect(() => {
    let alive = true;
    void loadFontFamily(kit.font)
      .catch(() => {})
      .then(() => alive && setFontReady(kit.font));
    return () => {
      alive = false;
    };
  }, [kit.font]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { logo, aspect } = await prepareLogo(file);
      update({ logo, logoAspect: aspect, showLogo: true });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const hasClips = project.clips.length > 0 && projectDuration(project) > 0;
  const apply = async () => {
    const r = applyBrandKit(project, assets, kit);
    const logo = logoAsset(kit);
    if (r.newAssets.length && logo?.src) {
      addAssets(r.newAssets);
      // Keep the logo across reloads like any upload.
      void fetch(logo.src)
        .then((res) => res.blob())
        .then((blob) => saveMedia(r.newAssets[0], blob));
    }
    commit(r.project);
    setApplied(r.changes.length ? r.changes : ["Qo'llaydigan matn yoki logo topilmadi"]);
  };

  const cornerCss = { tl: "top-3 left-3", tr: "top-3 right-3", bl: "bottom-3 left-3", br: "bottom-3 right-3" }[kit.logoCorner];
  const light = (() => {
    const m = /^#?([0-9a-f]{6})$/i.exec(kit.primary);
    if (!m) return true;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
  })();

  return (
    <div className="p-4 sm:p-7">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white">
        <ArrowLeft className="size-4" /> Orqaga
      </button>
      <h2 className="mt-2 text-[20px] sm:text-[24px] font-bold text-white font-display pr-10">Brend to&apos;plami</h2>
      <p className="text-[12.5px] text-white/50 mt-1">Logo, ranglar va shriftni bir marta saqlang — keyingi videolaringizga o&apos;zi qo&apos;llanadi.</p>

      <div className="mt-5 grid gap-6 sm:grid-cols-[1fr_260px]">
        <div className="space-y-5 order-2 sm:order-1">
          <Section title="Brend nomi">
            <input
              value={kit.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Masalan: Mening kofexonam"
              className="w-full h-10 rounded-lg bg-black/40 ring-1 ring-white/10 focus:ring-cyan-300/70 outline-none px-3 text-sm text-white"
            />
          </Section>

          <Section title="Logo">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0]).then(() => (e.target.value = ""))} />
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="size-16 shrink-0 rounded-xl bg-[repeating-conic-gradient(#1c1c22_0%_25%,#141418_0%_50%)] [background-size:12px_12px] ring-1 ring-white/15 hover:ring-cyan-300/60 grid place-items-center overflow-hidden"
              >
                {kit.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={kit.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <ImagePlus className="size-5 text-white/50" />
                )}
              </button>
              <div className="min-w-0 flex-1 space-y-1.5">
                <button onClick={() => fileRef.current?.click()} className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-[12px] text-white">
                  {kit.logo ? "Logoni almashtirish" : "Logo yuklash"}
                </button>
                {kit.logo && (
                  <button onClick={() => update({ logo: undefined, logoAspect: undefined })} className="ml-2 h-8 px-2 rounded-lg text-[12px] text-rose-300/90 hover:bg-rose-500/10 inline-flex items-center gap-1">
                    <Trash2 className="size-3.5" /> Olib tashlash
                  </button>
                )}
                <p className="text-[10.5px] text-white/35">Shaffof fonli PNG eng yaxshi. Rasm brauzeringizda saqlanadi.</p>
              </div>
            </div>
            {kit.logo && (
              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-2 text-[12px] text-white/75">
                  <input type="checkbox" checked={kit.showLogo} onChange={(e) => update({ showLogo: e.target.checked })} className="accent-cyan-400" />
                  Videolarga logo qo&apos;yilsin
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CORNERS.map(([id, label]) => (
                    <button key={id} onClick={() => update({ logoCorner: id })} className={cn("h-8 rounded-lg text-[11.5px] ring-1", kit.logoCorner === id ? "bg-cyan-400/15 ring-cyan-300/70 text-white" : "ring-white/10 text-white/60 hover:ring-white/25")}>
                      {label}
                    </button>
                  ))}
                </div>
                <RangeRow label="Hajmi" value={Math.round(kit.logoSize * 100)} min={8} max={40} suffix="%" onChange={(v) => update({ logoSize: v / 100 })} />
                <RangeRow label="Shaffoflik" value={Math.round(kit.logoOpacity * 100)} min={30} max={100} suffix="%" onChange={(v) => update({ logoOpacity: v / 100 })} />
              </div>
            )}
          </Section>

          <Section title="Ranglar">
            <div className="space-y-2.5">
              <div>
                <div className="text-[11px] text-white/50 mb-1.5">Asosiy rang (sarlavhalar)</div>
                <ColorRow value={kit.primary} onChange={(c) => c && update({ primary: c })} />
              </div>
              <div>
                <div className="text-[11px] text-white/50 mb-1.5">Urg&apos;u rangi (subtitrdagi ajratilgan so&apos;zlar)</div>
                <ColorRow value={kit.accent} onChange={(c) => c && update({ accent: c })} />
              </div>
            </div>
          </Section>

          <Section title="Shrift">
            <div className="flex flex-wrap gap-1.5">
              {POPULAR.filter((f) => FONTS.some((x) => x.family === f)).map((f) => (
                <button key={f} onClick={() => update({ font: f })} className={cn("px-2.5 h-7 rounded-md text-[11.5px] ring-1", kit.font === f ? "bg-cyan-400/15 ring-cyan-300/70 text-white" : "ring-white/10 text-white/60 hover:ring-white/25")}>
                  {f}
                </button>
              ))}
            </div>
            <select
              value={kit.font}
              onChange={(e) => update({ font: e.target.value })}
              className="mt-2 w-full h-9 rounded-lg bg-black/40 ring-1 ring-white/10 text-[12px] text-white px-2 outline-none"
            >
              {FONTS.map((f) => (
                <option key={f.family} value={f.family}>
                  {f.family}
                  {f.cyrillic ? " · kirill" : ""}
                </option>
              ))}
            </select>
          </Section>
        </div>

        <div className="order-1 sm:order-2">
          <div className="sm:sticky sm:top-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-2">Ko&apos;rinishi</div>
            <div className="relative mx-auto w-[150px] sm:w-full aspect-[9/16] max-h-[300px] sm:max-h-none rounded-xl overflow-hidden ring-1 ring-white/10 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950">
              {kit.logo && kit.showLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={kit.logo} alt="" className={cn("absolute object-contain", cornerCss)} style={{ height: `${kit.logoSize * 100}%`, maxWidth: "45%", opacity: kit.logoOpacity }} />
              )}
              <div className="absolute inset-x-3 top-[38%] text-center">
                <span
                  className="inline-block px-2 py-1 rounded-md text-[17px] font-extrabold leading-tight"
                  style={{ fontFamily: fontReady === kit.font ? `"${kit.font}", sans-serif` : undefined, ...(light ? { color: kit.primary } : { color: "#fff", background: kit.primary }) }}
                >
                  {kit.name || "Sarlavha matni"}
                </span>
              </div>
              <div className="absolute inset-x-3 bottom-[14%] text-center text-[13px] font-bold text-white" style={{ fontFamily: fontReady === kit.font ? `"${kit.font}", sans-serif` : undefined }}>
                Subtitr va <span style={{ color: kit.accent }}>muhim so&apos;z</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex gap-2 rounded-lg px-3 py-2 text-[12px] bg-rose-500/10 text-rose-200 ring-1 ring-rose-400/25">
          <TriangleAlert className="size-4 shrink-0 mt-px" /> {error}
        </div>
      )}
      {applied && (
        <div className="mt-4 rounded-lg px-3 py-2 text-[12px] bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/25 space-y-0.5">
          {applied.map((l) => (
            <div key={l} className="flex gap-1.5">
              <Check className="size-3.5 shrink-0 mt-0.5" /> {l}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid sm:grid-cols-2 gap-2">
        <button
          onClick={() => void apply()}
          disabled={!hasClips}
          className="h-11 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Wand2 className="size-4" /> Joriy videoga qo&apos;llash
        </button>
        <button onClick={onDone} className="h-11 rounded-xl bg-white/10 text-white text-[13px] font-medium hover:bg-white/15">
          Tayyor
        </button>
      </div>
      {!hasClips && <p className="mt-2 text-[11px] text-white/35">Hozir loyihada klip yo&apos;q — brend yangi videolarga avtomatik qo&apos;llanadi.</p>}
    </div>
  );
}

function RangeRow({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-white/55 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="ams-range w-full" style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} />
    </div>
  );
}
