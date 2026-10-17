"use client";

import { hasKeyframeAt, keyframePropsFor, toggleKeyframesAt } from "../keyframes";
import { useCurrentTime, useEditor } from "../store";
import type { MediaAsset, Project } from "../types";

/**
 * Adds or removes the selected clip's keyframe at `time` (project seconds).
 * Returns the new project, or null when nothing can be keyframed there.
 */
export const toggleSelectedKeyframe = (project: Project, assets: MediaAsset[], selectedId: string | null, time: number): Project | null => {
  const clip = project.clips.find((c) => c.id === selectedId);
  if (!clip || clip.type === "effect") return null;
  const t = time - clip.start;
  if (t < 0 || t > clip.duration) return null;
  const asset = clip.type === "media" ? assets.find((a) => a.id === clip.assetId) : undefined;
  const next = toggleKeyframesAt(clip, t, keyframePropsFor(clip, asset?.kind));
  return { ...project, clips: project.clips.map((c) => (c.id === clip.id ? next : c)) };
};

/** State for a "Keyframe" button: `active` = the playhead is on a keyframe of the selected clip (button removes it). */
export function useKeyframeToggle() {
  const { project, assets, selectedId, commit } = useEditor();
  const time = useCurrentTime();
  const clip = project.clips.find((c) => c.id === selectedId);
  const t = clip ? time - clip.start : -1;
  const enabled = !!clip && clip.type !== "effect" && t >= 0 && t <= clip.duration;
  const active = enabled && hasKeyframeAt(clip!, t);
  const toggle = () => {
    const next = toggleSelectedKeyframe(project, assets, selectedId, time);
    if (next) commit(next);
    return next ? (active ? "removed" : "added") : null;
  };
  return { enabled, active, toggle };
}
