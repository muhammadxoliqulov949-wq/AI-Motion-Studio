"use client";

import { Activity, AudioWaveform, Loader2, Scissors } from "lucide-react";
import { useState } from "react";
import { analyzeMusicBeats, beatsOnTimeline, cutToBeats, removeSilencesFromClip, type BeatInfo } from "../audio-analysis";
import { updateClip } from "../ops";
import { useEditor } from "../store";
import type { MediaClip } from "../types";
import { Chips, Section, Slider } from "./ui";

const Note = ({ text, error }: { text: string; error?: boolean }) => (
  <p className={`text-[10.5px] leading-relaxed ${error ? "text-amber-200/90" : "text-emerald-200/90"}`}>{text}</p>
);

/** Cuts out pauses in a talking clip using the real audio level. */
export function SilenceTool({ clip }: { clip: MediaClip }) {
  const { project, assets, commit } = useEditor();
  const [sensitivity, setSensitivity] = useState(12);
  const [minPause, setMinPause] = useState(0.45);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const asset = assets.find((a) => a.id === clip.assetId);
  const usable = !!asset?.src && !asset.scene;

  const run = async () => {
    if (!asset) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await removeSilencesFromClip(project, clip, asset, { sensitivity, minSilence: minPause });
      if (r.removed < 0.1) setNote({ text: "Olib tashlanadigan pauza topilmadi." });
      else {
        commit(r.project);
        setNote({ text: `${r.removed}s pauza kesildi, ${r.pieces} ta bo'lak qoldi.` });
      }
    } catch (err) {
      setNote({ text: `Audio tahlil qilinmadi: ${(err as Error).message}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Jimliklarni olib tashlash">
      {!usable ? (
        <Note text="Demo kliplarda haqiqiy ovoz yo'q — o'z videongizni yuklang." error />
      ) : (
        <>
          <Slider label="Sezgirlik" value={sensitivity} min={4} max={24} step={1} unit=" dB" onDown={() => {}} onChange={setSensitivity} />
          <Slider label="Eng qisqa pauza" value={minPause} min={0.2} max={1.5} step={0.05} unit="s" onDown={() => {}} onChange={setMinPause} />
          <button
            onClick={() => void run()}
            disabled={busy}
            className="w-full h-9 rounded-lg bg-white/[0.08] hover:bg-cyan-400 hover:text-black text-xs font-medium text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />} Pauzalarni kesish
          </button>
        </>
      )}
      {note && <Note {...note} />}
    </Section>
  );
}

/** Detects the tempo of a music clip and rebuilds the main track so cuts land on beats. */
export function BeatTool({ clip }: { clip: MediaClip }) {
  const { project, assets, commit } = useEditor();
  const [info, setInfo] = useState<BeatInfo | null>(null);
  const [every, setEvery] = useState("2");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const asset = assets.find((a) => a.id === clip.assetId);

  const detect = async () => {
    if (!asset) return null;
    setBusy(true);
    setNote(null);
    try {
      const r = await analyzeMusicBeats(asset);
      setInfo(r);
      return r;
    } catch (err) {
      setNote({ text: `Ritm aniqlanmadi: ${(err as Error).message}`, error: true });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    const r = info ?? (await detect());
    if (!r) return;
    const beats = beatsOnTimeline(clip, r);
    const next = cutToBeats(project, beats, Number(every));
    if (next === project) setNote({ text: "Asosiy video trekida klip yo'q yoki musiqa juda qisqa.", error: true });
    else {
      commit(next);
      setNote({ text: `Asosiy video ${r.bpm} BPM ritmiga moslab qayta kesildi.` });
    }
  };

  return (
    <Section title="Ritm (beat sync)">
      {info && (
        <div className="flex items-center gap-2 text-[11px] text-white/70">
          <Activity className="size-3.5 text-cyan-300" /> {info.bpm} BPM · {info.beats.length} bit
        </div>
      )}
      <div className="text-[11px] text-white/50">Har nechta bitda kesilsin</div>
      <Chips value={every} options={[["1", "1 — juda tez"], ["2", "2 — energik"], ["4", "4 — sokin"]]} onChange={setEvery} />
      <div className="flex gap-1.5">
        <button
          onClick={() => void detect()}
          disabled={busy}
          className="flex-1 h-9 rounded-lg bg-white/[0.06] hover:bg-white/10 text-xs text-white/80 inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <AudioWaveform className="size-3.5" />} Ritmni aniqlash
        </button>
        <button
          onClick={() => void sync()}
          disabled={busy}
          className="flex-1 h-9 rounded-lg bg-cyan-400 text-black text-xs font-semibold hover:bg-cyan-300 disabled:opacity-40"
        >
          Videoni ritmga kesish
        </button>
      </div>
      {note && <Note {...note} />}
    </Section>
  );
}

/** CapCut "Replace": swap the media under a clip but keep its timing, effects and animations. */
export function ReplaceMedia({ clip }: { clip: MediaClip }) {
  const { project, assets, commit } = useEditor();
  const options = assets.filter((a) => (a.kind === "video" || a.kind === "image") && a.id !== clip.assetId && a.origin !== "music" && a.origin !== "sfx");
  if (!options.length) return null;
  return (
    <Section title="Mediani almashtirish">
      <div className="grid grid-cols-4 gap-1.5">
        {options.map((a) => (
          <button
            key={a.id}
            title={a.name}
            onClick={() => {
              const duration = a.kind === "video" ? Math.min(clip.duration, a.duration / clip.speed) : clip.duration;
              commit(updateClip(project, clip.id, { assetId: a.id, in: 0, duration: Math.round(duration * 1000) / 1000 }));
            }}
            className="aspect-video rounded-md ring-1 ring-white/10 hover:ring-cyan-300/70 bg-center bg-cover"
            style={{ backgroundImage: a.thumbs?.length ? `url(${a.thumbs[0]})` : undefined, background: a.thumbs?.length ? undefined : a.gradient }}
          />
        ))}
      </div>
      <p className="text-[10px] text-white/35">Vaqt, effekt va animatsiyalar saqlanadi — faqat kadr almashadi.</p>
    </Section>
  );
}
