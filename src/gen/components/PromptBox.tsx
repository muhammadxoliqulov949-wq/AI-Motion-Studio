"use client";

import { Clapperboard, FileText, ImageIcon, Loader2, Plus, Sparkles, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ACCEPT, type Attachment, type AttachmentKind, fileToAttachment, MAX_ATTACHMENTS } from "../attachments";

const MENU: { kind: AttachmentKind; label: string; hint: string; icon: typeof ImageIcon }[] = [
  { kind: "image", label: "Rasm", hint: "Namuna, uslub yoki mahsulot surati", icon: ImageIcon },
  { kind: "video", label: "Video", hint: "Videodan kadr olinadi", icon: Video },
  { kind: "document", label: "Hujjat", hint: "PDF, Word, TXT — matndan g'oya", icon: FileText },
];

/**
 * The prompt field with a "+" button for reference materials (pictures, videos, documents).
 * Files can also be dropped on the box or pasted into it.
 */
export function PromptBox({
  value,
  onChange,
  placeholder,
  rows = 4,
  attachments,
  onAttachments,
  onDescribe,
  describing,
  onUseAsVideo,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  attachments: Attachment[];
  onAttachments: (next: Attachment[]) => void;
  onDescribe: () => void;
  describing: boolean;
  onUseAsVideo?: (a: Attachment) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef(attachments);
  listRef.current = attachments;

  // Close the menu on an outside click.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !boxRef.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const add = async (files: File[]) => {
    setError(null);
    const room = MAX_ATTACHMENTS - listRef.current.length;
    if (room <= 0) return setError(`Ko'pi bilan ${MAX_ATTACHMENTS} ta material`);
    const picked = files.slice(0, room);
    setLoading((n) => n + picked.length);
    for (const f of picked) {
      try {
        const a = await fileToAttachment(f);
        onAttachments([...listRef.current, a]);
        listRef.current = [...listRef.current, a];
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading((n) => n - 1);
      }
    }
    if (files.length > room) setError(`Ko'pi bilan ${MAX_ATTACHMENTS} ta material`);
  };

  const open = (kind: AttachmentKind) => {
    setMenu(false);
    if (!fileRef.current) return;
    fileRef.current.accept = ACCEPT[kind];
    fileRef.current.click();
  };

  const remove = (a: Attachment) => {
    if (a.thumb) URL.revokeObjectURL(a.thumb);
    onAttachments(attachments.filter((x) => x.id !== a.id));
  };

  return (
    <div ref={boxRef}>
      <div
        className={cn("relative rounded-2xl bg-white/[0.04] ring-1 transition", drag ? "ring-violet-400 bg-violet-500/10" : "ring-white/10 focus-within:ring-violet-400/70")}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void add([...e.dataTransfer.files]);
        }}
      >
        {attachments.length > 0 || loading > 0 ? (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 pt-3">
            {attachments.map((a) => (
              <div key={a.id} className="group relative shrink-0 w-[64px]" title={a.name}>
                {a.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumb} alt={a.name} className="size-[64px] rounded-xl object-cover ring-1 ring-white/15" />
                ) : (
                  <div className="size-[64px] rounded-xl bg-white/[0.06] ring-1 ring-white/15 grid place-items-center text-white/60">
                    <FileText className="size-6" />
                  </div>
                )}
                {a.kind === "video" && <Video className="absolute left-1 top-1 size-3.5 text-white drop-shadow" />}
                <span className="block mt-1 text-[9.5px] text-white/55 truncate">{a.name}</span>
                <button type="button" onClick={() => remove(a)} className="absolute -right-1.5 -top-1.5 size-5 rounded-full bg-black ring-1 ring-white/25 grid place-items-center text-white/80 hover:text-white" title="Olib tashlash">
                  <X className="size-3" />
                </button>
                {a.blob && onUseAsVideo && (
                  <button type="button" onClick={() => onUseAsVideo(a)} className="absolute left-1 bottom-6 h-5 px-1.5 rounded-md bg-black/70 text-[9px] text-white inline-flex items-center gap-0.5 hover:bg-violet-600" title="Shu rasmdan video yasash">
                    <Clapperboard className="size-2.5" /> Video
                  </button>
                )}
              </div>
            ))}
            {loading > 0 && (
              <div className="shrink-0 size-[64px] rounded-xl bg-white/[0.04] ring-1 ring-white/10 grid place-items-center">
                <Loader2 className="size-4 animate-spin text-white/60" />
              </div>
            )}
          </div>
        ) : null}

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              void add(files);
            }
          }}
          rows={rows}
          maxLength={700}
          placeholder={placeholder}
          className="block w-full bg-transparent outline-none px-3.5 pt-3 pb-1 text-[14px] text-white placeholder:text-white/30 resize-none"
        />

        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className={cn("size-8 rounded-full grid place-items-center ring-1 transition", menu ? "bg-white text-black ring-white" : "bg-white/[0.06] ring-white/15 text-white hover:bg-white/15")}
              title="Material qo'shish: rasm, video, hujjat"
              aria-label="Material qo'shish"
            >
              <Plus className={cn("size-4 transition-transform", menu && "rotate-45")} />
            </button>
            {menu && (
              <div className="absolute left-0 top-10 z-30 w-[240px] rounded-xl bg-[#16161b] ring-1 ring-white/15 shadow-2xl p-1.5">
                {MENU.map(({ kind, label, hint, icon: Icon }) => (
                  <button key={kind} type="button" onClick={() => open(kind)} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/10">
                    <span className="size-8 rounded-lg bg-white/[0.06] grid place-items-center text-white/80">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-white">{label}</span>
                      <span className="block text-[10.5px] text-white/45 truncate">{hint}</span>
                    </span>
                  </button>
                ))}
                <p className="px-2.5 pt-1.5 pb-1 text-[10px] text-white/35">Faylni shu yerga sudrab tashlash yoki joylash (Ctrl+V) ham mumkin.</p>
              </div>
            )}
          </div>
          <span className="text-[11px] text-white/35 truncate">{attachments.length ? `${attachments.length} ta material` : "Rasm, video yoki hujjat qo'shing"}</span>
          {attachments.length > 0 && (
            <button
              type="button"
              onClick={onDescribe}
              disabled={describing}
              className="ml-auto shrink-0 h-8 px-3 rounded-full text-[12px] font-medium text-white inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 disabled:opacity-60"
              title="AI materiallarni o'qib, prompt yozadi"
            >
              {describing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {describing ? "O'qilmoqda…" : "Prompt yozish"}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void add(files);
          }}
        />
      </div>
      {error && <p className="mt-1.5 text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}
