export type AspectRatio = "16:9" | "9:16" | "1:1";

export type AssetKind = "video" | "audio" | "image";

export type SceneId = "city" | "mountains" | "ocean" | "portrait" | "product" | "neon";

export interface MediaAsset {
  id: string;
  name: string;
  kind: AssetKind;
  /** Source duration in seconds (images use a default length). */
  duration: number;
  /** Object URL / data URL for uploaded media. Missing for synthetic scenes. */
  src?: string;
  /** Synthetic demo scene rendered in code instead of a file. */
  scene?: SceneId;
  /** Filmstrip frames (data URLs) for the timeline. */
  thumbs?: string[];
  /** CSS gradient used when no thumbnail exists. */
  gradient: string;
  /** Normalised 0..1 peaks for audio waveforms. */
  peaks?: number[];
  width?: number;
  height?: number;
}

export type TrackKind = "video" | "overlay" | "text" | "audio";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export type FilterId =
  | "none"
  | "cinematic"
  | "teal-orange"
  | "vintage"
  | "mono"
  | "vivid"
  | "cool"
  | "warm"
  | "fade";

export type TransitionId = "none" | "fade" | "slide" | "zoom" | "blur" | "wipe";

export type TextStyleId = "title" | "caption" | "lower-third" | "pop" | "typewriter" | "neon";

export type MotionId = "none" | "ken-burns" | "punch-in" | "shake" | "drift";

export interface BaseClip {
  id: string;
  trackId: string;
  /** Position on the timeline in seconds. */
  start: number;
  /** Visible length on the timeline in seconds. */
  duration: number;
  transitionIn: TransitionId;
  transitionDuration: number;
}

export interface MediaClip extends BaseClip {
  type: "media";
  assetId: string;
  /** Seconds trimmed from the start of the source. */
  in: number;
  speed: number;
  volume: number;
  filter: FilterId;
  motion: MotionId;
  opacity: number;
  scale: number;
}

export interface TextClip extends BaseClip {
  type: "text";
  text: string;
  style: TextStyleId;
  position: "top" | "center" | "bottom";
  color: string;
}

export type Clip = MediaClip | TextClip;

export interface ProjectGrade {
  filter: FilterId;
  letterbox: boolean;
  vignette: boolean;
  grain: boolean;
}

export interface Project {
  name: string;
  aspect: AspectRatio;
  fps: number;
  tracks: Track[];
  clips: Clip[];
  grade: ProjectGrade;
}

export interface EditorSnapshot {
  project: Project;
  assets: MediaAsset[];
}
