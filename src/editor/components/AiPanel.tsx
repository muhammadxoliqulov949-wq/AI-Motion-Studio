"use client";

import { ArrowUp, Check, ChevronDown, Code2, Loader2, RotateCcw, Sparkles, TriangleAlert, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { planLocally, suggestFor, summarize } from "../ai-agent";
import { applyOps, describeProject, type AgentStep, type EditOp } from "../edit-ops";
import { useEditor } from "../store";
import type { Project } from "../types";
import { projectDuration, round } from "../utils";

type Mode = "llm" | "local";

interface Message {
  id: number;
  role: "user" | "ai";
  text: string;
  status?: "thinking" | "working" | "done";
  steps?: AgentStep[];
  revealed?: number;
  code?: string;
  before?: Project;
  suggestions?: string[];
  reverted?: boolean;
  mode?: Mode;
  notice?: string;
  error?: boolean;
}

const MODEL = "gpt-5.2:low";

const STARTERS = [
  "Buni dinamik Reels qil, 15 soniya, musiqa bilan",
  "Sinematik uslubda montaj qil, sarlavha: \"Toshkent tunlari\"",
  "Intervyudagi jimliklarni olib tashla va subtitr qo'sh",
  "Vintaj 90-lar uslubi ber, o'tishlar silliq bo'lsin",
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AiPanel({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const { project, assets, selectedId, commit } = useEditor();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  // The greeting describes the raw footage the session started with.
  const [initialProject] = useState(project);
  const latest = useRef({ project, assets, selectedId });
  latest.current = { project, assets, selectedId };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const patch = (id: number, p: Partial<Message>) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    const userId = ++idRef.current;
    const aiId = ++idRef.current;
    setMessages((ms) => [
      ...ms,
      { id: userId, role: "user", text },
      { id: aiId, role: "ai", text: "", status: "thinking" },
    ]);
    setBusy(true);
    onBusyChange(true);

    // Undo requests revert the most recent AI edit.
    if (/\b(bekor|qaytar|undo|orqaga)/i.test(text)) {
      await wait(500);
      const last = [...messages].reverse().find((m) => m.role === "ai" && m.before && !m.reverted);
      if (last?.before) {
        commit(last.before);
        setMessages((ms) => ms.map((m) => (m.id === last.id ? { ...m, reverted: true } : m)));
        patch(aiId, { status: "done", text: "Oxirgi o'zgarishni bekor qildim — timeline avvalgi holatiga qaytdi." });
      } else {
        patch(aiId, { status: "done", text: "Bekor qiladigan AI o'zgarishi topilmadi." });
      }
      setBusy(false);
      onBusyChange(false);
      return;
    }

    const { project: before, assets: currentAssets, selectedId: sel } = latest.current;
    const finish = () => {
      setBusy(false);
      onBusyChange(false);
    };

    let plan: { reply: string | null; ops: EditOp[]; suggestions: string[] | null; mode: Mode; notice?: string };
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          project: describeProject(before, currentAssets, sel),
          history: historyRef.current,
          model: MODEL,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        plan = { reply: data.reply, ops: data.ops, suggestions: data.suggestions, mode: "llm" };
      } else if (data.code === "no_api_key") {
        await wait(600);
        plan = {
          reply: null,
          ops: planLocally(text, before, sel),
          suggestions: null,
          mode: "local",
          notice: "OPENAI_API_KEY topilmadi — lokal (kalit so'zli) rejimda ishladim.",
        };
      } else if (data.code === "rate_limited") {
        const minutes = Math.max(1, Math.ceil((Number(data.retryAfter) || 60) / 60));
        patch(aiId, {
          status: "done",
          error: true,
          text: `Siz qisqa vaqt ichida juda ko'p so'rov yubordingiz. Iltimos, taxminan ${minutes} daqiqa kutib, qayta urinib ko'ring.`,
        });
        finish();
        return;
      } else {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      patch(aiId, { status: "done", error: true, text: `AI bilan bog'lanib bo'lmadi: ${(err as Error).message}` });
      finish();
      return;
    }

    const result = applyOps(before, currentAssets, plan.ops);
    patch(aiId, { status: "working", steps: result.steps, revealed: 0, mode: plan.mode, notice: plan.notice });
    for (let i = 1; i <= result.steps.length; i++) {
      await wait(260);
      patch(aiId, { revealed: i });
    }
    const changed = result.project !== before;
    if (changed) commit(result.project);
    const reply = plan.reply ?? summarize(result.steps.filter((s) => !s.warning).length, before, result.project);
    historyRef.current = [
      ...historyRef.current,
      { role: "user" as const, content: text },
      { role: "assistant" as const, content: `${reply}\n[ops: ${plan.ops.map((o) => o.op).join(", ") || "none"}]` },
    ].slice(-12);
    patch(aiId, {
      status: "done",
      text: reply,
      code: result.code,
      before: changed ? before : undefined,
      suggestions: plan.suggestions?.length ? plan.suggestions.slice(0, 4) : suggestFor(result.project),
    });
    finish();
  };

  const selected = project.clips.find((c) => c.id === selectedId);
  const selectedLabel =
    selected?.type === "text" ? selected.text : selected ? assets.find((a) => a.id === selected.assetId)?.name : null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 panel-scroll">
        <Welcome project={initialProject} onPick={send} disabled={busy} />
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-3.5 py-2 text-[13px] text-white leading-relaxed">
                {m.text}
              </div>
            </div>
          ) : (
            <AiMessage key={m.id} m={m} onRevert={() => {
              if (!m.before) return;
              commit(m.before);
              patch(m.id, { reverted: true });
            }} onSuggest={send} busy={busy} />
          ),
        )}
      </div>

      <div className="p-3 border-t border-white/[0.06]">
        {selectedLabel && (
          <div className="mb-2 inline-flex items-center gap-1.5 max-w-full rounded-md bg-violet-500/10 ring-1 ring-violet-400/30 px-2 py-1 text-[11px] text-violet-200">
            <span className="shrink-0">Kontekst:</span>
            <span className="truncate font-medium">{selectedLabel}</span>
          </div>
        )}
        <div className="relative rounded-xl bg-[#141419] ring-1 ring-white/10 focus-within:ring-violet-400/60 transition-shadow focus-within:shadow-[0_0_0_4px_rgba(139,92,246,0.12)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={3}
            placeholder="Videoni qanday montaj qilay? Masalan: “TikTok uchun tez, energik, subtitrli qil”"
            className="w-full bg-transparent resize-none outline-none px-3.5 pt-3 pb-10 text-[13px] text-white placeholder:text-white/30"
          />
          <div className="absolute bottom-2 left-3 right-2 flex items-center justify-between">
            <span className="text-[10px] text-white/30">Enter — yuborish · Shift+Enter — yangi qator</span>
            <button
              onClick={() => void send(input)}
              disabled={!input.trim() || busy}
              className="size-8 grid place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white disabled:opacity-30 disabled:from-white/20 disabled:to-white/20 transition"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Welcome({ project, onPick, disabled }: { project: Project; onPick: (s: string) => void; disabled: boolean }) {
  const media = project.clips.filter((c) => c.type === "media").length;
  return (
    <div className="space-y-3">
      <div className="flex gap-2.5">
        <AiAvatar />
        <div className="space-y-2 text-[13px] text-white/85 leading-relaxed">
          <p>
            Salom! Men sizning <span className="text-white font-semibold">AI montajchingizman</span>. Timelineda{" "}
            {media} ta xom klip ({round(projectDuration(project), 1)}s) ko&apos;rib turibman.
          </p>
          <p className="text-white/60">
            Qanday video kerakligini oddiy so&apos;z bilan yozing — men kesaman, tartiblayman, rang beraman, musiqa va subtitr qo&apos;shaman. Natija yoqmasa, nimani o&apos;zgartirishni ayting.
          </p>
        </div>
      </div>
      <div className="grid gap-1.5 pl-9">
        {STARTERS.map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onPick(s)}
            className="text-left rounded-lg px-3 py-2 text-[12px] text-white/75 bg-white/[0.03] ring-1 ring-white/[0.06] hover:bg-violet-500/10 hover:ring-violet-400/40 hover:text-white transition disabled:opacity-40"
          >
            <Wand2 className="inline size-3 mr-1.5 text-violet-300" />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function AiAvatar() {
  return (
    <div className="size-7 shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-[0_0_20px_-4px_rgba(168,85,247,0.8)]">
      <Sparkles className="size-3.5 text-white" />
    </div>
  );
}

function AiMessage({ m, onRevert, onSuggest, busy }: { m: Message; onRevert: () => void; onSuggest: (s: string) => void; busy: boolean }) {
  const [showCode, setShowCode] = useState(false);
  return (
    <div className="flex gap-2.5">
      <AiAvatar />
      <div className="flex-1 min-w-0 space-y-2.5">
        {m.status === "thinking" && (
          <div className="text-[13px] shimmer-text">Timelineni o&apos;qib, montaj rejasini tuzyapman…</div>
        )}
        {m.notice && (
          <div className="flex gap-1.5 items-start rounded-lg bg-amber-500/10 ring-1 ring-amber-400/20 px-2.5 py-1.5 text-[11px] text-amber-200/90">
            <TriangleAlert className="size-3.5 shrink-0 mt-px" />
            {m.notice}
          </div>
        )}
        {m.steps && m.steps.length > 0 && (
          <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-2.5 space-y-1.5">
            {m.steps.map((s, i) => {
              const done = (m.revealed ?? 0) > i;
              const active = (m.revealed ?? 0) === i && m.status === "working";
              if (!done && !active) return null;
              return (
                <div key={i} className="flex gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
                  <span
                    className={cn(
                      "mt-0.5 size-4 shrink-0 rounded-full grid place-items-center",
                      !done ? "text-violet-300" : s.warning ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300",
                    )}
                  >
                    {!done ? <Loader2 className="size-3 animate-spin" /> : s.warning ? <TriangleAlert className="size-2.5" /> : <Check className="size-2.5" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-white/90">{s.label}</div>
                    <div className="text-[11px] text-white/45 leading-snug">{s.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {m.status === "done" && (
          <>
            <p
              className={cn(
                "text-[13px] leading-relaxed",
                m.reverted ? "text-white/40 line-through" : m.error ? "text-rose-300" : "text-white/85",
              )}
            >
              {m.text}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {m.mode && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                    m.mode === "llm" ? "bg-violet-500/15 text-violet-200" : "bg-white/5 text-white/45",
                  )}
                  title={m.mode === "llm" ? "Til modeli rejalashtirgan" : "Kalit so'zli lokal rejalashtiruvchi"}
                >
                  {m.mode === "llm" ? MODEL.split(":")[0].toUpperCase() : "Lokal"}
                </span>
              )}
              {m.code && (
                <button onClick={() => setShowCode(!showCode)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-white/60 hover:text-white bg-white/5 hover:bg-white/10">
                  <Code2 className="size-3" /> Kod
                  <ChevronDown className={cn("size-3 transition-transform", showCode && "rotate-180")} />
                </button>
              )}
              {m.before && !m.reverted && (
                <button onClick={onRevert} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-white/60 hover:text-rose-200 bg-white/5 hover:bg-rose-500/10">
                  <RotateCcw className="size-3" /> Qaytarish
                </button>
              )}
              {m.reverted && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-white/40">
                  <X className="size-3" /> bekor qilingan
                </span>
              )}
            </div>
            {showCode && m.code && (
              <pre className="rounded-lg bg-black/50 ring-1 ring-white/10 p-3 text-[11px] leading-relaxed font-mono text-sky-200/90 overflow-x-auto">
                {m.code}
              </pre>
            )}
            {m.suggestions && !m.reverted && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {m.suggestions.map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => onSuggest(s)}
                    className="px-2.5 py-1 rounded-full text-[11px] text-violet-200 ring-1 ring-violet-400/30 hover:bg-violet-500/15 disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
