"use client";

import { BookOpen, Clapperboard, ImageIcon, Images, KeyRound, Scissors } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { type GenCaps, loadCaps } from "../client";
import { useGallery, type GalleryItem } from "../useGallery";
import { GalleryView } from "./GalleryView";
import { ImageStudio } from "./ImageStudio";
import { VideoStudio } from "./VideoStudio";

type Mode = "image" | "video" | "gallery";

const MODES: { id: Mode; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Rasm", icon: ImageIcon },
  { id: "video", label: "Video", icon: Clapperboard },
  { id: "gallery", label: "Galereya", icon: Images },
];

/**
 * AI Studio (/montage): make pictures from text, turn them into videos with camera moves or real AI
 * video models, keep everything in a gallery, and send results on to the editor.
 */
export default function StudioApp() {
  const [mode, setMode] = useState<Mode>("image");
  const [caps, setCaps] = useState<GenCaps | null>(null);
  const [handOver, setHandOver] = useState<GalleryItem | null>(null);
  const gallery = useGallery();

  useEffect(() => {
    let alive = true;
    void loadCaps().then((c) => alive && setCaps(c));
    return () => {
      alive = false;
    };
  }, []);

  const toVideo = (item: GalleryItem) => {
    setHandOver(item);
    setMode("video");
  };

  return (
    <div className="min-h-dvh lg:h-dvh flex flex-col bg-[#09090b] text-white lg:overflow-hidden">
      <header className="shrink-0 border-b border-white/[0.07] bg-[#0b0b0e]/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="h-14 px-3 lg:px-5 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Logo size={28} />
            <span className="font-display font-bold text-[16px] tracking-tight hidden sm:inline">AI Studio</span>
          </Link>

          <nav className="hidden lg:flex mx-auto items-center gap-1 p-1 rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.07]">
            {MODES.map(({ id, label, icon: Icon }) => (
              <ModeTab key={id} active={mode === id} onClick={() => setMode(id)} icon={Icon} label={label} badge={id === "gallery" && gallery.items.length ? gallery.items.length : undefined} />
            ))}
          </nav>

          <div className="ml-auto lg:ml-0 flex items-center gap-1.5">
            <span
              className={cn("hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[11px] ring-1", caps?.hasKey ? "bg-emerald-400/10 ring-emerald-400/30 text-emerald-200" : "bg-amber-400/10 ring-amber-400/25 text-amber-100/90")}
              title={caps?.hasKey ? "Server Pollinations kaliti bilan ishlayapti" : "Kalitsiz bepul rejim: 45 soniyada 1 rasm"}
            >
              <KeyRound className="size-3" /> {caps === null ? "…" : caps.hasKey ? "Kalit ulangan" : "Bepul rejim"}
            </span>
            <Link href="/montage/story" className="h-8 px-2.5 rounded-lg text-[12px] text-white/65 hover:text-white hover:bg-white/10 inline-flex items-center gap-1.5" title="Mavzu → ssenariy → stok kadr va ovozli video">
              <BookOpen className="size-3.5" /> <span className="hidden md:inline">Hikoya video</span>
            </Link>
            <Link href="/editor" className="h-8 px-2.5 rounded-lg text-[12px] text-white/65 hover:text-white hover:bg-white/10 inline-flex items-center gap-1.5">
              <Scissors className="size-3.5" /> <span className="hidden md:inline">Editor</span>
            </Link>
          </div>
        </div>

        <nav className="lg:hidden px-3 pb-2.5 grid grid-cols-3 gap-1 p-1 mx-3 mb-2.5 rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.07]">
          {MODES.map(({ id, label, icon: Icon }) => (
            <ModeTab key={id} active={mode === id} onClick={() => setMode(id)} icon={Icon} label={label} badge={id === "gallery" && gallery.items.length ? gallery.items.length : undefined} />
          ))}
        </nav>
      </header>

      {/* All three modes stay mounted so a prompt, a source or a running job survives switching tabs. */}
      <main className="flex-1 min-h-0 flex flex-col">
        <div className={cn("flex-1 min-h-0 flex-col", mode === "image" ? "flex" : "hidden")}>
          <ImageStudio caps={caps} items={gallery.items} onAdd={gallery.add} onRemove={(id) => void gallery.remove(id)} onToVideo={toVideo} />
        </div>
        <div className={cn("flex-1 min-h-0 flex-col", mode === "video" ? "flex" : "hidden")}>
          <VideoStudio caps={caps} items={gallery.items} onAdd={gallery.add} initial={handOver} />
        </div>
        <div className={cn("flex-1 min-h-0 overflow-y-auto", mode === "gallery" ? "block" : "hidden")}>
          <GalleryView items={gallery.items} ready={gallery.ready} onRemove={(id) => void gallery.remove(id)} onToVideo={toVideo} />
        </div>
      </main>
    </div>
  );
}

function ModeTab({ active, onClick, icon: Icon, label, badge }: { active: boolean; onClick: () => void; icon: typeof ImageIcon; label: string; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative h-9 px-4 rounded-xl text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-colors",
        active ? "bg-white text-black shadow" : "text-white/60 hover:text-white",
      )}
    >
      <Icon className="size-4" />
      {label}
      {badge !== undefined && <span className={cn("min-w-4 h-4 px-1 rounded-full text-[10px] grid place-items-center", active ? "bg-black/15" : "bg-white/15")}>{badge}</span>}
    </button>
  );
}
