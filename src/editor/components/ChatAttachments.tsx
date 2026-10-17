"use client";

import { Cloud, Film, Image as ImageIcon, Loader2, Music2, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { cleanupChatUploads, uploadChatAttachment } from "../cloud";
import { importFile } from "../import-media";
import { saveMedia } from "../media-store";
import { analyzeReferenceVideo, frameForModel } from "../reference-analysis";
import { SKILLS, type SkillId } from "../skills";
import { useEditor } from "../store";
import type { MediaAsset, ReferenceStyle } from "../types";

/**
 * Files attached to the AI chat. Each file becomes a normal project asset (so the AI can put it on
 * the timeline), is optionally copied to the user's temporary cloud folder, and is prepared for the
 * vision model: a reference video is analysed (rhythm, transitions, colour, tempo + frames), photos
 * and material videos get one preview frame.
 */

export type AttachmentRole = "reference" | "material";

export interface ChatAttachment {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  role: AttachmentRole;
  asset?: MediaAsset;
  preview?: string;
  status: "importing" | "analyzing" | "ready" | "error";
  progress?: number;
  progressLabel?: string;
  error?: string;
  style?: ReferenceStyle;
  frames: string[];
  cloud: "off" | "uploading" | "saved" | "failed";
}

/** What the server receives for each attachment. */
export const toPayload = (a: ChatAttachment) => ({
  assetId: a.asset!.id,
  name: a.name,
  kind: a.kind,
  role: a.role,
  frames: a.frames,
});

const MAX_FILES = 6;
const kindOf = (f: File): ChatAttachment["kind"] | null =>
  f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "audio" : null;

export function useChatAttachments(skill: SkillId) {
  const { addAssets, updateAsset } = useEditor();
  const [items, setItems] = useState<ChatAttachment[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    void cleanupChatUploads().catch(() => {});
  }, []);

  const patch = useCallback((id: string, p: Partial<ChatAttachment>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), []);

  /** Analyses a reference video, or grabs one preview frame for material. */
  const prepare = useCallback(
    async (id: string, asset: MediaAsset, role: AttachmentRole, kind: ChatAttachment["kind"], cached?: ReferenceStyle, file?: Blob) => {
      if (role === "reference" && kind === "video") {
        patch(id, { status: "analyzing", progress: 0, progressLabel: "Namuna tahlil qilinmoqda…" });
        try {
          const style = cached ?? (await analyzeReferenceVideo(asset, (f, label) => patch(id, { progress: f, progressLabel: label })));
          // The frames go to the model with this message; the asset keeps only the measurements.
          const referenceStyle = { ...style, frames: [] };
          updateAsset(asset.id, { chatRole: "reference", referenceStyle });
          // Keep the measurements with the stored file so they survive a reload.
          if (file) void saveMedia({ ...asset, chatRole: "reference", referenceStyle }, file);
          patch(id, { status: "ready", style, frames: style.frames.slice(0, 6), progress: 1 });
        } catch (err) {
          patch(id, { status: "error", error: (err as Error).message });
        }
        return;
      }
      updateAsset(asset.id, { chatRole: "material", referenceStyle: undefined });
      const frame = kind === "audio" ? null : await frameForModel(asset).catch(() => null);
      patch(id, { status: "ready", frames: frame ? [frame] : [] });
    },
    [patch, updateAsset],
  );

  const add = useCallback(
    async (files: FileList | File[]) => {
      const room = MAX_FILES - itemsRef.current.length;
      const list = Array.from(files)
        .filter((f) => kindOf(f))
        .slice(0, Math.max(0, room));
      // The Style Matcher treats the first attached video as the reference; everything else is material.
      let hasRef = itemsRef.current.some((x) => x.role === "reference");
      for (const file of list) {
        const kind = kindOf(file)!;
        const role: AttachmentRole = kind === "video" && !hasRef && skill === "style" ? "reference" : "material";
        if (role === "reference") hasRef = true;
        const id = `att_${Math.random().toString(36).slice(2, 9)}`;
        setItems((xs) => [...xs, { id, name: file.name, kind, role, status: "importing", frames: [], cloud: "off" }]);
        void (async () => {
          try {
            const imported = await importFile(file);
            if (!imported) throw new Error("Bu fayl turini o'qib bo'lmadi");
            const asset: MediaAsset = { ...imported, origin: "upload", chatRole: role };
            addAssets([asset]);
            void saveMedia(asset, file);
            patch(id, { asset, preview: asset.kind === "image" ? asset.src : asset.thumbs?.[0] });
            await prepare(id, asset, role, kind, undefined, file);
          } catch (err) {
            patch(id, { status: "error", error: (err as Error).message });
          }
        })();
        void (async () => {
          try {
            patch(id, { cloud: "uploading" });
            const path = await uploadChatAttachment(file);
            patch(id, { cloud: path ? "saved" : "off" });
          } catch {
            patch(id, { cloud: "failed" });
          }
        })();
      }
    },
    [addAssets, patch, prepare, skill],
  );

  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));

  const toggleRole = (id: string) => {
    const a = itemsRef.current.find((x) => x.id === id);
    if (!a?.asset || a.kind !== "video" || a.status !== "ready") return;
    const role: AttachmentRole = a.role === "reference" ? "material" : "reference";
    // Only one reference at a time: demote the previous one.
    for (const other of itemsRef.current) {
      if (other.id !== id && other.role === "reference" && other.asset && role === "reference") {
        patch(other.id, { role: "material" });
        void prepare(other.id, other.asset, "material", other.kind);
      }
    }
    patch(id, { role });
    void prepare(id, a.asset, role, a.kind, a.style);
  };

  const clear = () => setItems([]);
  const busy = items.some((x) => x.status === "importing" || x.status === "analyzing");
  const ready = items.filter((x) => x.status === "ready" && x.asset);
  return { items, add, remove, toggleRole, clear, busy, ready };
}

export function SkillBar({ value, onChange, disabled }: { value: SkillId; onChange: (s: SkillId) => void; disabled?: boolean }) {
  return (
    <div className="shrink-0 flex gap-1.5 px-3 py-2 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
      {SKILLS.map((s) => (
        <button
          key={s.id}
          disabled={disabled}
          onClick={() => onChange(s.id)}
          title={s.hint}
          className={cn(
            "shrink-0 h-7 px-2.5 rounded-full text-[11.5px] inline-flex items-center gap-1.5 ring-1 transition-colors disabled:opacity-50",
            value === s.id ? "bg-violet-500/20 ring-violet-400/60 text-white font-medium" : "ring-white/10 text-white/60 hover:text-white hover:ring-white/25",
          )}
        >
          <span>{s.emoji}</span>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function AttachmentChips({ items, onRemove, onToggleRole }: { items: ChatAttachment[]; onRemove?: (id: string) => void; onToggleRole?: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((a) => (
        <AttachmentChip key={a.id} a={a} onRemove={onRemove && (() => onRemove(a.id))} onToggleRole={onToggleRole && (() => onToggleRole(a.id))} />
      ))}
    </div>
  );
}

function AttachmentChip({ a, onRemove, onToggleRole }: { a: ChatAttachment; onRemove?: () => void; onToggleRole?: () => void }) {
  const Icon = a.kind === "video" ? Film : a.kind === "image" ? ImageIcon : Music2;
  const working = a.status === "importing" || a.status === "analyzing";
  return (
    <div className={cn("relative flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 max-w-[220px] ring-1", a.role === "reference" ? "bg-fuchsia-500/10 ring-fuchsia-400/40" : "bg-white/[0.04] ring-white/10")}>
      <div className="relative size-9 shrink-0 rounded-md overflow-hidden bg-black/40 grid place-items-center">
        {a.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <Icon className="size-4 text-white/50" />
        )}
        {working && (
          <div className="absolute inset-0 bg-black/55 grid place-items-center">
            <Loader2 className="size-3.5 animate-spin text-white" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-white/85 truncate">{a.name}</div>
        <div className="flex items-center gap-1 text-[9.5px]">
          {a.status === "error" ? (
            <span className="text-rose-300 inline-flex items-center gap-0.5 truncate">
              <TriangleAlert className="size-2.5" /> {a.error ?? "Xato"}
            </span>
          ) : a.status === "analyzing" ? (
            <span className="text-fuchsia-200/80 truncate">
              {a.progressLabel} {Math.round((a.progress ?? 0) * 100)}%
            </span>
          ) : (
            <button
              type="button"
              onClick={onToggleRole}
              disabled={!onToggleRole || a.kind !== "video" || a.status !== "ready"}
              title={a.kind === "video" ? "Bosing: namuna ↔ material" : undefined}
              className={cn("px-1 rounded", a.role === "reference" ? "bg-fuchsia-500/30 text-fuchsia-100" : "bg-white/10 text-white/60", a.kind === "video" && onToggleRole && "hover:ring-1 hover:ring-white/30")}
            >
              {a.role === "reference" ? "Namuna" : "Material"}
            </button>
          )}
          {a.style && a.role === "reference" && a.status === "ready" && (
            <span className="text-white/40 truncate">
              {a.style.shots.length} kadr · {a.style.avgShot}s{a.style.bpm ? ` · ${a.style.bpm} BPM` : ""}
            </span>
          )}
          {a.cloud === "saved" && <Cloud className="size-2.5 text-emerald-300/80 shrink-0" aria-label="Bulutda saqlandi" />}
        </div>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-zinc-700 text-white grid place-items-center hover:bg-rose-500" title="Olib tashlash">
          <X className="size-2.5" />
        </button>
      )}
    </div>
  );
}
