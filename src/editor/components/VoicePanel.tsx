"use client";

import { Loader2, Mic, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { saveMedia } from "../media-store";
import { addTrack, insertClip, makeMediaClip } from "../ops";
import { computePeaks } from "../sample-media";
import { useEditor } from "../store";
import { round, uid } from "../utils";
import { speak } from "../catalog/voices";
import { Chips, Section, Slider } from "./ui";
import { VoicePicker } from "./VoicePicker";

const STYLES: [string, string][] = [
  ["", "Tabiiy"],
  ["Calm, warm and slow, like a documentary narrator.", "Hujjatli film"],
  ["Energetic, upbeat and fast, like a TikTok creator.", "Energik"],
  ["Confident and clear, like a news anchor.", "Yangiliklar"],
  ["Friendly and persuasive, like a product advertisement.", "Reklama"],
];

/** Generates a voiceover with AI and places it on a dedicated "Ovoz" audio track. */
export function VoicePanel() {
  const { project, selectedId, commit, addAssets, playhead } = useEditor();
  const selected = project.clips.find((c) => c.id === selectedId);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState("openai:nova");
  const [style, setStyle] = useState("");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected?.type === "text" && !text) setText(selected.text);
  }, [selected]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await speak({ text, voice, speed, style });
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      void ctx.close();
      const asset = {
        id: uid("voice"),
        name: `Ovoz: ${text.slice(0, 28)}${text.length > 28 ? "…" : ""}`,
        kind: "audio" as const,
        duration: decoded.duration,
        src: URL.createObjectURL(blob),
        gradient: "linear-gradient(135deg,#7c2d12,#fb923c)",
        peaks: computePeaks(decoded.getChannelData(0), 400),
        origin: "voice" as const,
      };
      addAssets([asset]);
      void saveMedia(asset, blob);
      let p = project;
      let track = p.tracks.find((t) => t.kind === "audio" && t.name === "Ovoz");
      if (!track) {
        const added = addTrack(p, "audio", "Ovoz");
        p = added.project;
        track = added.track;
      }
      const at = selected?.type === "text" ? selected.start : round(playhead.getFrame() / project.fps, 3);
      const clip = makeMediaClip(asset, track.id, at, { volume: 1, fadeIn: 0, fadeOut: 0.1 });
      commit(insertClip(p, clip, ["audio"], track.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-br from-orange-500/10 to-fuchsia-500/10 ring-1 ring-white/[0.08] p-3.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
          <Mic className="size-4 text-orange-300" /> AI ovoz (voiceover)
        </div>
        <p className="mt-1 text-[11px] text-white/55 leading-relaxed">
          Matnni yozing — sun&apos;iy intellekt uni ovozga aylantiradi va “Ovoz” trekiga qo&apos;yadi. Matn klipi tanlangan bo&apos;lsa, uning matni va vaqti olinadi.
        </p>
      </div>
      <Section title="Matn">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={1500}
          placeholder="Masalan: Bugun sizga Toshkentning eng chiroyli joylarini ko'rsataman…"
          className="w-full rounded-lg bg-black/40 ring-1 ring-white/10 focus:ring-cyan-300/70 outline-none p-2.5 text-sm text-white resize-none"
        />
        <div className="text-right text-[10px] text-white/30">{text.length}/1500</div>
      </Section>
      <Section title="Ovoz">
        <VoicePicker value={voice} onChange={setVoice} compact />
      </Section>
      <Section title="Uslub">
        <Chips value={style} options={STYLES} onChange={setStyle} size="sm" />
      </Section>
      <Slider label="Tezlik" value={speed} min={0.5} max={2} step={0.05} unit="x" onDown={() => {}} onChange={setSpeed} />
      <button
        onClick={() => void generate()}
        disabled={busy || !text.trim()}
        className="w-full h-10 rounded-xl bg-cyan-400 text-black text-sm font-semibold hover:bg-cyan-300 disabled:opacity-40 inline-flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />} Ovoz yaratish
      </button>
      {error && (
        <div className="flex gap-2 rounded-lg px-3 py-2 text-[11px] bg-amber-500/10 text-amber-200/90 ring-1 ring-amber-400/20">
          <TriangleAlert className="size-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}
    </div>
  );
}
