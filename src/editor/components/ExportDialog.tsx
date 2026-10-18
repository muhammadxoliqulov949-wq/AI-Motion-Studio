"use client";

import { CheckCircle2, Copy, Download, Film, Loader2, Share2, TriangleAlert, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { NOTO_LICENSE } from "../catalog/stickers";
import { accessToken } from "../cloud";
import { TimelineComposition } from "../composition/TimelineComposition";
import { ASPECTS } from "../presets";
import { useEditor } from "../store";
import { formatShort, projectDuration } from "../utils";

const RESOLUTIONS = [
  { id: "480p", label: "480p", short: 480 },
  { id: "720p", label: "720p", short: 720 },
  { id: "1080p", label: "1080p", short: 1080 },
  { id: "2k", label: "2K", short: 1440 },
  { id: "4k", label: "4K", short: 2160 },
];

const FORMATS = [
  { id: "mp4", label: "MP4", hint: "H.264 · hamma joyda ochiladi", container: "mp4" as const, codec: "h264" as const },
  { id: "webm", label: "WebM", hint: "VP9 · veb uchun", container: "webm" as const, codec: "vp9" as const },
  { id: "mp3", label: "MP3", hint: "faqat audio", container: "mp3" as const, codec: null },
  { id: "wav", label: "WAV", hint: "faqat audio, siqilmagan", container: "wav" as const, codec: null },
];

const QUALITIES = [
  { id: "low", label: "Kichik fayl", value: "low" as const },
  { id: "high", label: "Tavsiya etilgan", value: "high" as const },
  { id: "very-high", label: "Yuqori", value: "very-high" as const },
];

type Phase = { kind: "idle" } | { kind: "rendering"; progress: number } | { kind: "done"; url: string; size: number; name: string } | { kind: "error"; message: string };

/** Renders the timeline to a file entirely in the browser with @remotion/web-renderer (WebCodecs). */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, assets } = useEditor();
  const [res, setRes] = useState("1080p");
  const [fps, setFps] = useState(project.fps);
  const [format, setFormat] = useState("mp4");
  const [quality, setQuality] = useState("high");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [where, setWhere] = useState<"browser" | "server">("browser");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const total = projectDuration(project);
  const { width, height } = ASPECTS[project.aspect];
  const scale = (RESOLUTIONS.find((r) => r.id === res)?.short ?? 1080) / Math.min(width, height);
  const fmt = FORMATS.find((f) => f.id === format)!;
  const audioOnly = !fmt.codec;

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setPhase((p) => (p.kind === "done" ? p : { kind: "idle" }));
    } else setFps(project.fps);
  }, [open, project.fps]);

  /** Attribution lines required by the licenses of the assets used in this edit. */
  const credits = useMemo(() => {
    const used = new Set(project.clips.filter((c) => c.type === "media").map((c) => (c as { assetId: string }).assetId));
    const lines = assets.filter((a) => used.has(a.id) && a.credit).map((a) => a.credit!);
    for (const c of project.clips) if (c.type === "sticker" && c.credit) lines.push(c.credit);
    if (project.clips.some((c) => c.type === "sticker" && c.sticker.startsWith("emoji:"))) lines.push(NOTO_LICENSE);
    return [...new Set(lines)];
  }, [project.clips, assets]);

  const blobSources = assets.filter((a) => a.src?.startsWith("blob:")).length;

  /** Remotion Lambda: renders in the cloud, polls progress, returns a download URL. */
  const startServer = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "rendering", progress: 0 });
    try {
      const token = await accessToken();
      const res = await fetch("/api/lambda/render-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ project: { ...project, fps }, assets, scale, format: fmt.id === "wav" ? "mp3" : fmt.id }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      while (!controller.signal.aborted) {
        await new Promise((r) => setTimeout(r, 2000));
        const p = await fetch("/api/lambda/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: data.renderId, bucketName: data.bucketName }),
        }).then((r) => r.json());
        if (p.type === "error") throw new Error(p.message);
        const d = p.data;
        if (d.type === "error") throw new Error(d.message);
        if (d.type === "progress") setPhase({ kind: "rendering", progress: Math.min(99.5, d.progress * 100) });
        if (d.type === "done") {
          setPhase({ kind: "done", url: d.url, size: d.size, name: `${project.name}.${fmt.id === "wav" ? "mp3" : fmt.container}` });
          return;
        }
      }
      setPhase({ kind: "idle" });
    } catch (err) {
      if (controller.signal.aborted) setPhase({ kind: "idle" });
      else setPhase({ kind: "error", message: (err as Error).message || "Server render bajarilmadi" });
    }
  };

  const start = async () => {
    if (where === "server") return startServer();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "rendering", progress: 0 });
    try {
      const { renderMediaOnWeb, canRenderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({
        container: fmt.container,
        videoCodec: fmt.codec,
        width,
        height,
        scale,
        videoBitrate: QUALITIES.find((q) => q.id === quality)!.value,
      });
      const fatal = check.issues.find((i) => i.severity === "error");
      if (!check.canRender && fatal) throw new Error(fatal.message);
      const durationInFrames = Math.max(1, Math.ceil(total * fps));
      const props = { project: { ...project, fps }, assets };
      const result = await renderMediaOnWeb({
        composition: { component: TimelineComposition, id: "timeline", width, height, fps, durationInFrames, defaultProps: props },
        inputProps: props,
        container: fmt.container,
        videoCodec: fmt.codec,
        videoBitrate: QUALITIES.find((q) => q.id === quality)!.value,
        scale,
        signal: controller.signal,
        onProgress: (p) => setPhase({ kind: "rendering", progress: Math.min(99.5, p.progress * 100) }),
        delayRenderTimeoutInMilliseconds: 60000,
      });
      const blob = await result.getBlob();
      const name = `${project.name.replace(/[^\p{L}\p{N}_ -]+/gu, "").trim() || "video"}.${fmt.container}`;
      setPhase({ kind: "done", url: URL.createObjectURL(blob), size: blob.size, name });
    } catch (err) {
      if (controller.signal.aborted) setPhase({ kind: "idle" });
      else setPhase({ kind: "error", message: (err as Error).message || "Render bajarilmadi" });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm animate-in fade-in p-4" onClick={phase.kind === "rendering" ? undefined : onClose}>
      <div className="w-full max-w-[480px] max-h-[92vh] overflow-y-auto rounded-2xl bg-[#121216] ring-1 ring-white/10 shadow-2xl p-5 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Eksport</h2>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md text-white/50 hover:text-white hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex gap-3 items-center rounded-xl bg-white/[0.03] p-3 mb-4">
          <div className="size-11 rounded-lg bg-gradient-to-br from-cyan-400/30 to-fuchsia-500/30 grid place-items-center">
            <Film className="size-5 text-cyan-200" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-white font-medium truncate">{project.name}</div>
            <div className="text-[11px] text-white/45">
              {formatShort(total)} · {audioOnly ? "audio" : `${Math.round(width * scale)}×${Math.round(height * scale)} · ${fps}fps`} · {project.clips.length} klip
            </div>
          </div>
        </div>

        {phase.kind === "idle" || phase.kind === "error" ? (
          <>
            <Field label="Qayerda render qilinsin">
              <div className="grid grid-cols-2 gap-2">
                <Opt active={where === "browser"} onClick={() => setWhere("browser")} title="Kompyuteringizda, WebCodecs bilan">
                  Brauzerda
                </Opt>
                <Opt active={where === "server"} onClick={() => setWhere("server")} title="Remotion Lambda (AWS) — tezroq, Safari va uzun videolar uchun">
                  Serverda (tez)
                </Opt>
              </div>
              <p className="text-[10px] text-white/35 mt-1.5">
                {where === "server"
                  ? blobSources
                    ? "Yuklangan fayllar serverga ko'rinishi uchun tizimga kiring — ular bulutga yuklanadi."
                    : "AWS Lambda'da parallel render — uzun videolar ham bir necha daqiqada tayyor."
                  : "Kompyuteringiz resursi bilan, fayllar hech qayerga yuborilmaydi."}
              </p>
            </Field>
            <Field label="Format">
              <div className="grid grid-cols-4 gap-2">
                {FORMATS.map((f) => (
                  <Opt key={f.id} active={format === f.id} onClick={() => setFormat(f.id)} title={f.hint}>
                    {f.label}
                  </Opt>
                ))}
              </div>
              <p className="text-[10px] text-white/35 mt-1.5">{fmt.hint}</p>
            </Field>
            {!audioOnly && (
              <>
                <Field label="Ruxsat (sifat)">
                  <div className="grid grid-cols-5 gap-2">
                    {RESOLUTIONS.map((r) => (
                      <Opt key={r.id} active={res === r.id} onClick={() => setRes(r.id)}>
                        {r.label}
                      </Opt>
                    ))}
                  </div>
                </Field>
                <Field label="Kadr tezligi">
                  <div className="grid grid-cols-5 gap-2">
                    {[24, 25, 30, 50, 60].map((f) => (
                      <Opt key={f} active={fps === f} onClick={() => setFps(f)}>
                        {f}
                      </Opt>
                    ))}
                  </div>
                </Field>
                <Field label="Bitreyt">
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITIES.map((q) => (
                      <Opt key={q.id} active={quality === q.id} onClick={() => setQuality(q.id)}>
                        {q.label}
                      </Opt>
                    ))}
                  </div>
                </Field>
              </>
            )}
            {credits.length > 0 && (
              <Field label="Mualliflik (litsenziya talab qiladi)">
                <div className="rounded-lg bg-black/30 ring-1 ring-white/[0.07] p-2.5 text-[10.5px] text-white/60 leading-relaxed space-y-1 max-h-28 overflow-y-auto panel-scroll">
                  {credits.map((c) => (
                    <div key={c}>{c}</div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    void navigator.clipboard?.writeText(credits.join("\n"));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200"
                >
                  <Copy className="size-3" /> {copied ? "Nusxalandi" : "Video tavsifi uchun nusxalash"}
                </button>
              </Field>
            )}
            {phase.kind === "error" && (
              <div className="mb-3 flex gap-2 rounded-lg bg-rose-500/10 ring-1 ring-rose-400/20 px-3 py-2 text-[11px] text-rose-200">
                <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
                <span>
                  {phase.message}. Chrome yoki Edge brauzerining so&apos;nggi versiyasida urinib ko&apos;ring yoki ruxsatni pasaytiring.
                </span>
              </div>
            )}
            <button onClick={() => void start()} disabled={total <= 0} className="w-full mt-1 h-10 rounded-xl bg-cyan-400 text-black text-sm font-semibold hover:bg-cyan-300 disabled:opacity-40">
              Render boshlash
            </button>
            <p className="mt-3 text-[10px] text-white/35 text-center leading-relaxed">
              Render to&apos;liq brauzeringizda bajariladi — fayllaringiz serverga yuborilmaydi.
              {blobSources > 0 ? " Render vaqtida bu oynani yopmang." : ""}
            </p>
          </>
        ) : phase.kind === "rendering" ? (
          <div className="py-2">
            <div className="flex justify-between text-xs text-white/60 mb-2">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" /> Kadrlar render qilinmoqda…
              </span>
              <span className="font-mono">{Math.floor(phase.progress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-all" style={{ width: `${phase.progress}%` }} />
            </div>
            <button onClick={() => abortRef.current?.abort()} className="mt-4 w-full h-9 rounded-xl bg-white/10 text-white/80 text-sm hover:bg-white/15">
              Bekor qilish
            </button>
          </div>
        ) : (
          <div className="py-3 text-center">
            <CheckCircle2 className="size-10 text-emerald-400 mx-auto mb-2" />
            <div className="text-sm text-white font-medium">Tayyor!</div>
            <div className="text-[11px] text-white/45 mt-1">
              {phase.name} · {(phase.size / 1024 / 1024).toFixed(1)} MB
            </div>
            <a href={phase.url} download={phase.name} className="mt-4 w-full h-10 rounded-xl bg-cyan-400 text-black text-sm font-semibold hover:bg-cyan-300 inline-flex items-center justify-center gap-2">
              <Download className="size-4" /> Yuklab olish
            </a>
            <ShareButton url={phase.url} name={phase.name} />
            <button onClick={() => setPhase({ kind: "idle" })} className="mt-2 text-[11px] text-white/50 hover:text-white">
              Boshqa sozlama bilan qayta render
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
      {children}
    </div>
  );
}

function Opt({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn("h-9 rounded-lg text-xs font-medium ring-1", active ? "ring-cyan-300 bg-cyan-400/15 text-white" : "ring-white/10 text-white/60 hover:text-white")}
    >
      {children}
    </button>
  );
}

/**
 * Phone: the system share sheet with the video file (Telegram, Instagram, TikTok…).
 * Desktop / no file sharing: shares or copies the link of a server render.
 */
function ShareButton({ url, name }: { url: string; name: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "failed">("idle");
  const share = async () => {
    setState("busy");
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const file = new File([blob], name, { type: blob.type || "video/mp4" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        setState("idle");
        return;
      }
      if (/^https?:/.test(url)) {
        if (navigator.share) await navigator.share({ url, title: name });
        else await navigator.clipboard.writeText(url);
        setState("copied");
        return;
      }
      setState("failed");
    } catch (err) {
      setState((err as Error).name === "AbortError" ? "idle" : "failed");
    }
  };
  return (
    <button onClick={() => void share()} disabled={state === "busy"} className="mt-2 w-full h-10 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/15 inline-flex items-center justify-center gap-2 disabled:opacity-50">
      {state === "busy" ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
      {state === "copied" ? "Havola nusxalandi" : state === "failed" ? "Bu brauzerda ulashib bo'lmadi — yuklab oling" : "Ulashish (Telegram, Instagram…)"}
    </button>
  );
}
