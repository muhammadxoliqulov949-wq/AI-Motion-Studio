"use client";

import { Cloud, CloudOff, FolderOpen, Loader2, LogIn, LogOut, Mail, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  deleteCloudProject,
  ensureUploaded,
  listCloudProjects,
  loadCloudProject,
  saveCloudProject,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  supabaseEnabled,
  useCloudUser,
  type CloudProjectRow,
} from "../cloud";
import { useEditor } from "../store";
import { formatShort } from "../utils";

const CURRENT_KEY = "ams-cloud-project";

const readCurrent = () => {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
};
const writeCurrent = (id: string | null) => {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* ignore */
  }
};

type SaveState = "idle" | "saving" | "saved" | "error";

/** Account button + cloud projects (Supabase). Renders nothing when Supabase is not configured. */
export function CloudMenu({ compact }: { compact?: boolean }) {
  const { user, ready } = useCloudUser();
  const { project, assets, commit, addAssets, updateAsset, select } = useEditor();
  const [menu, setMenu] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [cloudId, setCloudId] = useState<string | null>(() => (supabaseEnabled ? readCurrent() : null));
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const latest = useRef({ project, assets });
  latest.current = { project, assets };

  const saveNow = async (id: string | null = cloudId) => {
    if (!user || saving.current) return id;
    saving.current = true;
    setState("saving");
    try {
      const uploaded = await ensureUploaded(latest.current.assets, user.id);
      for (const a of uploaded) {
        const old = latest.current.assets.find((x) => x.id === a.id);
        if (old && old.storagePath !== a.storagePath) updateAsset(a.id, { storagePath: a.storagePath, src: a.src });
      }
      const newId = await saveCloudProject(id, latest.current.project, uploaded);
      if (newId !== id) {
        setCloudId(newId);
        writeCurrent(newId);
      }
      setState("saved");
      setError(null);
      return newId;
    } catch (err) {
      setState("error");
      setError((err as Error).message);
      return id;
    } finally {
      saving.current = false;
    }
  };

  // Signed-in users get CapCut-style autosave: the project is created in the cloud on the
  // first change and updated a few seconds after every edit.
  const first = useRef(true);
  useEffect(() => {
    if (!user) return;
    if (first.current) {
      first.current = false;
      if (!cloudId) return;
    }
    const t = setTimeout(() => void saveNow(cloudId), 4000);
    return () => clearTimeout(t);
  }, [project, user, cloudId]);

  if (!supabaseEnabled || !ready) return null;

  const open = async (id: string) => {
    const r = await loadCloudProject(id);
    const known = new Set(latest.current.assets.map((a) => a.id));
    addAssets(r.assets.filter((a) => !known.has(a.id)));
    for (const a of r.assets.filter((x) => known.has(x.id))) updateAsset(a.id, a);
    commit(r.project);
    select(null);
    setCloudId(id);
    writeCurrent(id);
    setState("saved");
    setProjectsOpen(false);
  };

  if (!user) {
    return (
      <>
        <button
          onClick={() => setAuthOpen(true)}
          className="h-8 px-2.5 rounded-lg text-[12px] text-white/75 hover:text-white hover:bg-white/10 inline-flex items-center gap-1.5 shrink-0"
          title="Kirish — loyihalarni bulutda saqlash"
        >
          <LogIn className="size-4" /> {!compact && "Kirish"}
        </button>
        {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
      </>
    );
  }

  const initial = (user.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <div className="relative shrink-0 flex items-center gap-1.5">
      {!compact && cloudId && (
        <span className={cn("text-[11px] hidden xl:inline-flex items-center gap-1", state === "error" ? "text-amber-300" : "text-white/35")} title={error ?? undefined}>
          {state === "saving" ? <Loader2 className="size-3 animate-spin" /> : state === "error" ? <CloudOff className="size-3" /> : <Cloud className="size-3" />}
          {state === "saving" ? "Saqlanmoqda…" : state === "error" ? "Bulutga saqlanmadi" : "Bulutda"}
        </span>
      )}
      <button
        onClick={() => setMenu(!menu)}
        className="size-8 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-black text-[13px] font-bold grid place-items-center"
        title={user.email ?? "Akkaunt"}
      >
        {initial}
      </button>
      {menu && (
        <div className="absolute right-0 top-10 w-60 rounded-xl bg-[#1a1a20] ring-1 ring-white/10 shadow-2xl p-1.5 z-50" onMouseLeave={() => setMenu(false)}>
          <div className="px-2.5 py-2 text-[11px] text-white/45 truncate">{user.email}</div>
          <MenuItem
            icon={<FolderOpen className="size-3.5" />}
            label="Loyihalarim"
            onClick={() => {
              setProjectsOpen(true);
              setMenu(false);
            }}
          />
          <MenuItem
            icon={<Save className="size-3.5" />}
            label={cloudId ? "Hozir saqlash" : "Bulutga saqlash"}
            onClick={() => {
              void saveNow();
              setMenu(false);
            }}
          />
          {cloudId && (
            <MenuItem
              icon={<Cloud className="size-3.5" />}
              label="Yangi nusxa sifatida saqlash"
              onClick={() => {
                void saveNow(null);
                setMenu(false);
              }}
            />
          )}
          <MenuItem
            icon={<LogOut className="size-3.5" />}
            label="Chiqish"
            onClick={() => {
              void signOut();
              setCloudId(null);
              writeCurrent(null);
              setMenu(false);
            }}
          />
        </div>
      )}
      {projectsOpen && <ProjectsDialog currentId={cloudId} onOpen={open} onClose={() => setProjectsOpen(false)} onSaveCurrent={() => void saveNow(null)} />}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-white/80 hover:bg-white/[0.07] text-left">
      {icon} {label}
    </button>
  );
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const send = async () => {
    setState("sending");
    try {
      await signInWithEmail(email.trim());
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-[380px] rounded-2xl bg-[#121216] ring-1 ring-white/10 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-white">Kirish</h2>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md text-white/50 hover:text-white hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-[11px] text-white/45 mb-4">Loyihalaringiz va fayllaringiz bulutda saqlanadi — istalgan qurilmadan ochasiz.</p>
        {state === "sent" ? (
          <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-400/20 p-3 text-[12px] text-emerald-200">
            <Mail className="inline size-3.5 mr-1" /> {email} manziliga kirish havolasi yuborildi. Pochtangizni oching va havolani bosing.
          </div>
        ) : (
          <>
            <button
              onClick={() => void signInWithGoogle().catch((err) => setError((err as Error).message))}
              className="w-full h-10 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90"
            >
              Google orqali kirish
            </button>
            <div className="my-3 flex items-center gap-2 text-[10px] text-white/30">
              <span className="flex-1 h-px bg-white/10" /> yoki email <span className="flex-1 h-px bg-white/10" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email && void send()}
              placeholder="siz@email.com"
              className="w-full h-10 rounded-xl bg-white/[0.05] ring-1 ring-white/10 focus:ring-cyan-300/60 outline-none px-3 text-sm text-white"
            />
            <button
              onClick={() => void send()}
              disabled={!email.includes("@") || state === "sending"}
              className="w-full mt-2 h-10 rounded-xl bg-cyan-400 text-black text-sm font-semibold hover:bg-cyan-300 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {state === "sending" && <Loader2 className="size-4 animate-spin" />} Havola yuborish
            </button>
          </>
        )}
        {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      </div>
    </div>
  );
}

function ProjectsDialog({
  currentId,
  onOpen,
  onClose,
  onSaveCurrent,
}: {
  currentId: string | null;
  onOpen: (id: string) => Promise<void>;
  onClose: () => void;
  onSaveCurrent: () => void;
}) {
  const [rows, setRows] = useState<CloudProjectRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    listCloudProjects()
      .then(setRows)
      .catch((err) => setError((err as Error).message));
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-[560px] max-h-[85vh] overflow-y-auto rounded-2xl bg-[#121216] ring-1 ring-white/10 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Loyihalarim</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                onSaveCurrent();
                setTimeout(() => void refresh(), 1500);
              }}
              className="h-8 px-3 rounded-lg bg-cyan-400 text-black text-xs font-semibold hover:bg-cyan-300"
            >
              Joriy loyihani saqlash
            </button>
            <button onClick={onClose} className="size-8 grid place-items-center rounded-md text-white/50 hover:text-white hover:bg-white/10">
              <X className="size-4" />
            </button>
          </div>
        </div>
        {error && <p className="mb-3 text-[11px] text-rose-300">{error} — Supabase'da migratsiya (projects jadvali) bajarilganini tekshiring.</p>}
        {!rows ? (
          <div className="py-10 grid place-items-center">
            <Loader2 className="size-5 animate-spin text-cyan-300" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-white/40">Hali saqlangan loyiha yo&apos;q.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1", r.id === currentId ? "ring-cyan-300/50 bg-cyan-400/5" : "ring-white/[0.07] hover:bg-white/[0.03]")}>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-white truncate">{r.name}</div>
                  <div className="text-[10.5px] text-white/40">
                    {r.aspect} · {formatShort(r.duration)} · {new Date(r.updated_at).toLocaleString("uz-UZ")}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setBusy(r.id);
                    void onOpen(r.id)
                      .catch((err) => setError((err as Error).message))
                      .finally(() => setBusy(null));
                  }}
                  className="h-8 px-3 rounded-lg bg-white/[0.08] hover:bg-white/15 text-xs text-white inline-flex items-center gap-1.5"
                >
                  {busy === r.id && <Loader2 className="size-3 animate-spin" />} Ochish
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm(`"${r.name}" o'chirilsinmi?`)) return;
                    void deleteCloudProject(r.id).then(refresh);
                  }}
                  className="size-8 grid place-items-center rounded-lg text-white/40 hover:text-rose-300 hover:bg-rose-500/10"
                  title="O'chirish"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
