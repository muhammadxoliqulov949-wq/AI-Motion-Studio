"use client";

import { Loader2, Pause, Play, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  defaultVoice,
  LANG_LABELS,
  normalizeVoiceId,
  previewVoice,
  stopPreview,
  ttsCapabilities,
  usableVoices,
  type TtsCapabilities,
  type VoiceOption,
} from "../catalog/voices";

/** Loads which TTS providers the server supports (once) and picks a sensible default voice. */
export const useVoices = (value: string, onChange: (id: string) => void) => {
  const [caps, setCaps] = useState<TtsCapabilities | null>(null);
  useEffect(() => {
    let alive = true;
    void ttsCapabilities().then((c) => {
      if (!alive) return;
      setCaps(c);
      // Move off a voice the server cannot serve (e.g. the old default when only Azure is set up).
      const usable = usableVoices();
      if (!usable.some((v) => v.id === normalizeVoiceId(value))) onChange(defaultVoice());
    });
    return () => {
      alive = false;
    };
    // Runs once: later changes of `value` must not reset the user's choice.
  }, []);
  return { caps, voices: usableVoices() };
};

/** Voice list grouped by language with a "tinglab ko'rish" button on each row. */
export function VoicePicker({ value, onChange, compact = false }: { value: string; onChange: (id: string) => void; compact?: boolean }) {
  const { voices } = useVoices(value, onChange);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = normalizeVoiceId(value);

  useEffect(() => () => stopPreview(), []);

  const toggle = async (v: VoiceOption) => {
    setError(null);
    if (playing === v.id) {
      stopPreview();
      setPlaying(null);
      return;
    }
    setBusy(v.id);
    try {
      await previewVoice(v, () => setPlaying(null));
      setPlaying(v.id);
    } catch (err) {
      setPlaying(null);
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const groups = [...new Set(voices.map((v) => v.lang))];

  return (
    <div className="space-y-2.5">
      {groups.map((lang) => (
        <div key={lang}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/35 mb-1">{LANG_LABELS[lang]}</div>
          <div className={cn("grid gap-1.5", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
            {voices
              .filter((v) => v.lang === lang)
              .map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg ring-1 pl-1.5 pr-2.5 py-1.5 cursor-pointer transition-colors",
                    current === v.id ? "bg-cyan-400/10 ring-cyan-300/60" : "bg-white/[0.03] ring-white/[0.08] hover:ring-white/20",
                  )}
                  onClick={() => onChange(v.id)}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggle(v);
                    }}
                    className="size-7 shrink-0 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white"
                    title="Tinglab ko'rish"
                  >
                    {busy === v.id ? <Loader2 className="size-3 animate-spin" /> : playing === v.id ? <Pause className="size-3 fill-current" /> : <Play className="size-3 fill-current ml-px" />}
                  </button>
                  <span className="text-[12px] text-white/85 truncate">{v.label}</span>
                </div>
              ))}
          </div>
        </div>
      ))}
      {error && (
        <div className="flex gap-2 rounded-lg px-3 py-2 text-[11px] bg-amber-500/10 text-amber-200/90 ring-1 ring-amber-400/20">
          <TriangleAlert className="size-3.5 shrink-0 mt-0.5" /> {error}
        </div>
      )}
    </div>
  );
}
