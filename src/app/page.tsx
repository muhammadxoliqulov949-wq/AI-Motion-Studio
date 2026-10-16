"use client";

import {
  ArrowRight,
  AudioLines,
  Braces,
  Captions,
  Clapperboard,
  Film,
  Layers,
  MessageSquareText,
  Palette,
  RefreshCcw,
  Scissors,
  Shuffle,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Logo } from "@/components/Logo";

const HeroPlayer = dynamic(() => import("@/components/landing/HeroPlayer"), {
  ssr: false,
  loading: () => <div className="aspect-video rounded-2xl bg-white/5 ring-1 ring-white/10 animate-pulse" />,
});

const MODULES = [
  {
    title: "Montaj + AI",
    status: "Faol",
    href: "/editor",
    icon: Scissors,
    desc: "Syomkalaringizni yuklang va so'z bilan montaj qiling. Timeline, rang, o'tishlar, subtitr — hammasi AI qo'lida.",
    accent: "from-violet-500 to-fuchsia-500",
  },
  {
    title: "AI Montaj",
    status: "Yangi",
    href: "/montage",
    icon: Wand2,
    desc: "Bitta mavzu yozing — AI ssenariy, fon videolar, ovoz, subtitr, shrift va tovush effektlari bilan tayyor video yig'adi.",
    accent: "from-yellow-400 to-orange-500",
  },
  {
    title: "Video generatsiya",
    status: "Beta",
    href: "/motion",
    icon: Film,
    desc: "Promptdan noldan animatsiya va motion-grafika yaratish. Kod orqali, kadrma-kadr.",
    accent: "from-sky-500 to-cyan-400",
  },
  {
    title: "Audio",
    status: "Tez orada",
    href: null,
    icon: AudioLines,
    desc: "Ovozni tozalash, musiqa yaratish, ovoz berish va avtomatik ducking.",
    accent: "from-emerald-500 to-lime-400",
  },
];

const STEPS = [
  { icon: Upload, title: "Yuklang", text: "Montaj qilinmagan videolar, rasmlar va audiolarni tashlang. Fayllar brauzeringizda qoladi." },
  { icon: MessageSquareText, title: "Ayting", text: "“TikTok uchun tez, subtitrli, 15 soniya” — oddiy so'z bilan qanday video kerakligini yozing." },
  { icon: RefreshCcw, title: "Takomillashtiring", text: "Natija yoqmasa — aytasiz. Yoqsa — yanada yaxshilaysiz. Har bir qadamni qo'lda ham tahrirlash mumkin." },
];

const FEATURES = [
  { icon: Layers, title: "Ko'p trekli timeline", text: "Video, overlay, matn, subtitr va musiqa treklari. Kesish, trim, snap, ripple." },
  { icon: Palette, title: "Rang va LUT", text: "Sinematik, teal & orange, vintaj… letterbox, vinyetka, plyonka donasi." },
  { icon: Shuffle, title: "O'tishlar va harakat", text: "Fade, zoom, blur, wipe, Ken Burns, punch-in — ritmga mos." },
  { icon: Captions, title: "Subtitrlar", text: "So'zma-so'z ajratiladigan karaoke uslubidagi subtitrlar." },
  { icon: Wand2, title: "AI montajchi", text: "Jimliklarni kesadi, ritmga moslaydi, formatni o'zgartiradi, sarlavha va musiqa qo'yadi." },
  { icon: Braces, title: "Montaj — bu kod", text: "Har bir loyiha JSON. AI aynan uni tahrirlaydi, Remotion esa videoga aylantiradi." },
];

export default function Home() {
  return (
    <div className="h-screen overflow-y-auto bg-[#09090b] text-white panel-scroll">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(139,92,246,0.25),transparent)]" />

      <nav className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="font-display font-bold text-lg tracking-tight">AI Motion Studio</span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm text-white/60">
          <a href="#modullar" className="hover:text-white">Bo&apos;limlar</a>
          <a href="#qanday" className="hover:text-white">Qanday ishlaydi</a>
          <a href="#imkoniyatlar" className="hover:text-white">Imkoniyatlar</a>
        </div>
        <Link href="/editor" className="h-9 px-4 inline-flex items-center gap-1.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90">
          Boshlash <ArrowRight className="size-4" />
        </Link>
      </nav>

      <header className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-24 grid lg:grid-cols-[1fr_1.15fr] gap-12 lg:gap-14 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-violet-200 bg-violet-500/10 ring-1 ring-violet-400/30">
            <Sparkles className="size-3.5" /> Yangi: Montaj + AI
          </span>
          <h1 className="font-display mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Videongizni{" "}
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-orange-200 bg-clip-text text-transparent">so&apos;z bilan</span>{" "}
            montaj qiling.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/60 leading-relaxed max-w-xl">
            CapCut, DaVinci va After Effects kuchi — lekin tugmalar o&apos;rniga suhbat. Xom syomkani yuklang, qanday video kerakligini yozing: AI kesadi, rang beradi, musiqa va subtitr qo&apos;shadi.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/editor"
              className="h-12 px-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold shadow-[0_10px_40px_-10px_rgba(168,85,247,0.8)] hover:brightness-110"
            >
              <Scissors className="size-4" /> Montajni boshlash
            </Link>
            <a href="#qanday" className="h-12 px-6 inline-flex items-center gap-2 rounded-xl ring-1 ring-white/15 text-white/85 font-medium hover:bg-white/5">
              Qanday ishlaydi
            </a>
          </div>
          <p className="mt-4 text-xs text-white/35">Ro&apos;yxatdan o&apos;tish shart emas · demo material tayyor</p>
        </div>
        <HeroPlayer />
      </header>

      <section id="modullar" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <SectionHead kicker="Bo'limlar" title="Bitta studiya — to'rtta yo'nalish" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((m) => {
            const card = (
              <div className="group h-full rounded-2xl p-6 bg-white/[0.03] ring-1 ring-white/10 hover:ring-white/25 hover:bg-white/[0.05] transition">
                <div className="flex items-center justify-between">
                  <span className={`size-11 rounded-xl bg-gradient-to-br ${m.accent} grid place-items-center`}>
                    <m.icon className="size-5 text-white" />
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      m.status === "Faol" ? "bg-emerald-500/15 text-emerald-300" : m.status === "Yangi" ? "bg-yellow-400/15 text-yellow-200" : m.status === "Beta" ? "bg-sky-500/15 text-sky-300" : "bg-white/10 text-white/50"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold">{m.title}</h3>
                <p className="mt-2 text-sm text-white/55 leading-relaxed">{m.desc}</p>
                {m.href && (
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-white/80 group-hover:text-white">
                    Ochish <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </div>
            );
            return m.href ? (
              <Link key={m.title} href={m.href}>
                {card}
              </Link>
            ) : (
              <div key={m.title} className="opacity-70">
                {card}
              </div>
            );
          })}
        </div>
      </section>

      <section id="qanday" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <SectionHead kicker="Qanday ishlaydi" title="Yuklang. Ayting. Tayyor." />
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-2xl p-6 bg-gradient-to-b from-white/[0.05] to-transparent ring-1 ring-white/10">
              <span className="absolute top-5 right-6 font-display text-5xl font-extrabold text-white/[0.06]">{i + 1}</span>
              <s.icon className="size-6 text-violet-300" />
              <h3 className="mt-4 font-semibold text-lg">{s.title}</h3>
              <p className="mt-2 text-sm text-white/55 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="imkoniyatlar" className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <SectionHead kicker="Imkoniyatlar" title="Professional muharrir + AI rejissyor" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/10">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-[#0c0c10] p-6">
              <f.icon className="size-5 text-white/70" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-white/50 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="rounded-3xl p-8 sm:p-12 text-center bg-gradient-to-br from-violet-600/30 via-fuchsia-600/15 to-transparent ring-1 ring-violet-400/20">
          <Clapperboard className="size-8 mx-auto text-violet-200" />
          <h2 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">Birinchi montajingizni hoziroq qiling</h2>
          <p className="mt-3 text-white/60">Demo material tayyor — faqat nima xohlayotganingizni yozing.</p>
          <Link href="/editor" className="mt-7 h-12 px-7 inline-flex items-center gap-2 rounded-xl bg-white text-black font-semibold hover:bg-white/90">
            Muharrirni ochish <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10 border-t border-white/[0.06] flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-white/35">
        <span>© 2026 AI Motion Studio</span>
        <span>Remotion asosida · kod orqali video</span>
      </footer>
    </div>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-8">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/80">{kicker}</div>
      <h2 className="mt-2 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h2>
    </div>
  );
}
