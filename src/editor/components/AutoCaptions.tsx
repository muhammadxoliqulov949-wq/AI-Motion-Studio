"use client";

import { Captions, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { applyCaptions, CaptionError, captionClipsFromSegments, speechSourceClips, transcribeClips } from "../captions";
import { useEditor } from "../store";
import { Chips, Section } from "./ui";

const LANGS: [string, string][] = [
  ["auto", "Avto"],
  ["uz", "O'zbek"],
  ["ru", "Rus"],
  ["en", "Ingliz"],
  ["tr", "Turk"],
];

const STYLES: [string, string][] = [
  ["caption", "Klassik"],
  ["tiktok-caption", "TikTok"],
  ["hormozi-caption", "Podkast"],
  ["soft-caption", "Yumshoq"],
  ["movie-subtitle", "Kino"],
];

export function AutoCaptions() {
  const { project, assets, commit } = useEditor();
  const [lang, setLang] = useState("auto");
  const [style, setStyle] = useState("tiktok-caption");
  const [words, setWords] = useState("4");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const sources = speechSourceClips(project, assets);

  const run = async () => {
    setMessage(null);
    setBusy({ done: 0, total: 1 });
    try {
      const segments = await transcribeClips(project, assets, (done, total) => setBusy({ done, total }), lang === "auto" ? undefined : lang);
      if (!segments.length) {
        setMessage({ text: "Nutq topilmadi. Klipda ovoz borligini tekshiring.", error: true });
      } else {
        const clips = captionClipsFromSegments(segments, style, "T2", Number(words));
        commit(applyCaptions(project, clips));
        setMessage({ text: `${clips.length} ta subtitr qo'shildi (T2 treki). Matnni Xususiyatlar panelida tahrirlashingiz mumkin.` });
      }
    } catch (err) {
      const code = err instanceof CaptionError ? err.code : undefined;
      setMessage({
        text:
          code === "no_api_key"
            ? "Nutqni tanish uchun serverda OPENAI_API_KEY kerak. AI montajchiga “subtitr qo'sh” deb yozsangiz, namunaviy subtitr qo'yiladi."
            : code === "rate_limited"
              ? "Juda ko'p so'rov. Birozdan keyin qayta urinib ko'ring."
              : `Xatolik: ${(err as Error).message}`,
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-br from-cyan-400/10 to-fuchsia-500/10 ring-1 ring-white/[0.08] p-3.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <Captions className="size-4 text-cyan-300" /> Avto subtitr
        </div>
        <p className="mt-1 text-[11px] text-white/55 leading-relaxed">
          Videodagi nutqni sun&apos;iy intellekt taniydi va vaqtiga mos subtitr qo&apos;yadi. {sources.length ? `${sources.length} ta ovozli klip topildi.` : "Avval ovozli video yoki audio yuklang (demo kliplarda ovoz yo'q)."}
        </p>
      </div>
      <Section title="Til">
        <Chips value={lang} options={LANGS} onChange={setLang} />
      </Section>
      <Section title="Uslub">
        <Chips value={style} options={STYLES} onChange={setStyle} />
      </Section>
      <Section title="Bir kartada so'zlar">
        <Chips value={words} options={[["2", "2"], ["3", "3"], ["4", "4"], ["6", "6"], ["10", "10"]]} onChange={setWords} />
      </Section>
      <button
        onClick={() => void run()}
        disabled={!!busy || !sources.length}
        className="w-full h-10 rounded-xl bg-cyan-400 text-black text-sm font-semibold hover:bg-cyan-300 disabled:opacity-40 inline-flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Tanilmoqda… {busy.done}/{busy.total}
          </>
        ) : (
          "Subtitr yaratish"
        )}
      </button>
      {message && (
        <div className={`flex gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed ${message.error ? "bg-amber-500/10 text-amber-200/90 ring-1 ring-amber-400/20" : "bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/20"}`}>
          {message.error && <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />}
          {message.text}
        </div>
      )}
    </div>
  );
}
