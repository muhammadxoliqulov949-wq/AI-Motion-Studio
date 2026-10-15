"use client";

import type { PlayerRef } from "@remotion/player";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import type { Clip, MediaAsset, Project } from "./types";

interface State {
  past: Project[];
  present: Project;
  future: Project[];
  assets: MediaAsset[];
  selectedId: string | null;
}

type Action =
  | { type: "set"; project: Project; history: boolean }
  | { type: "checkpoint" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; id: string | null }
  | { type: "add-assets"; assets: MediaAsset[] }
  | { type: "update-asset"; id: string; patch: Partial<MediaAsset> };

const HISTORY_LIMIT = 100;

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "set":
      if (action.project === state.present) return state;
      return action.history
        ? {
            ...state,
            past: [...state.past, state.present].slice(-HISTORY_LIMIT),
            present: action.project,
            future: [],
          }
        : { ...state, present: action.project };
    case "checkpoint":
      return { ...state, past: [...state.past, state.present].slice(-HISTORY_LIMIT), future: [] };
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        present: prev,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    case "select":
      return { ...state, selectedId: action.id };
    case "add-assets":
      return {
        ...state,
        assets: [...state.assets, ...action.assets.filter((a) => !state.assets.some((b) => b.id === a.id))],
      };
    case "update-asset":
      return { ...state, assets: state.assets.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)) };
  }
};

/** Playhead lives outside React state so 30fps updates only re-render subscribers. */
const createPlayhead = () => {
  let frame = 0;
  let playing = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getFrame: () => frame,
    getPlaying: () => playing,
    setFrame: (f: number) => {
      if (f !== frame) {
        frame = f;
        emit();
      }
    },
    setPlaying: (p: boolean) => {
      if (p !== playing) {
        playing = p;
        emit();
      }
    },
  };
};

type Playhead = ReturnType<typeof createPlayhead>;

interface EditorContextValue {
  state: State;
  project: Project;
  assets: MediaAsset[];
  selectedId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Commit a new project version to history. */
  commit: (project: Project) => void;
  /** Replace the project without a history entry (use during drags after `checkpoint`). */
  preview: (project: Project) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  addAssets: (assets: MediaAsset[]) => void;
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void;
  /** Clip copied with Ctrl+C. */
  clipboard: React.MutableRefObject<Clip | null>;
  playerRef: React.RefObject<PlayerRef | null>;
  playhead: Playhead;
  seek: (seconds: number) => void;
  togglePlay: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
  initialProject,
  initialAssets,
  children,
}: {
  initialProject: Project;
  initialAssets: MediaAsset[];
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initialProject,
    future: [],
    assets: initialAssets,
    selectedId: null,
  });
  const playerRef = useRef<PlayerRef | null>(null);
  const clipboard = useRef<Clip | null>(null);
  const playhead = useMemo(createPlayhead, []);
  const fps = state.present.fps;

  const seek = useCallback(
    (seconds: number) => {
      const frame = Math.max(0, Math.round(seconds * fps));
      playerRef.current?.seekTo(frame);
      playhead.setFrame(frame);
    },
    [fps, playhead],
  );

  const value = useMemo<EditorContextValue>(
    () => ({
      state,
      project: state.present,
      assets: state.assets,
      selectedId: state.selectedId,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      commit: (project) => dispatch({ type: "set", project, history: true }),
      preview: (project) => dispatch({ type: "set", project, history: false }),
      checkpoint: () => dispatch({ type: "checkpoint" }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      select: (id) => dispatch({ type: "select", id }),
      addAssets: (assets) => dispatch({ type: "add-assets", assets }),
      updateAsset: (id, patch) => dispatch({ type: "update-asset", id, patch }),
      clipboard,
      playerRef,
      playhead,
      seek,
      togglePlay: () => playerRef.current?.toggle(),
    }),
    [state, playhead, seek],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export const useEditor = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used inside EditorProvider");
  return ctx;
};

export const useCurrentTime = () => {
  const { playhead, project } = useEditor();
  const frame = useSyncExternalStore(playhead.subscribe, playhead.getFrame, playhead.getFrame);
  return frame / project.fps;
};

export const useIsPlaying = () => {
  const { playhead } = useEditor();
  return useSyncExternalStore(playhead.subscribe, playhead.getPlaying, playhead.getPlaying);
};
