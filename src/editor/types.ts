export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5" | "4:3" | "21:9";

export type AssetKind = "video" | "audio" | "image";

export type SceneId = "city" | "mountains" | "ocean" | "portrait" | "product" | "neon";

/** Where an asset came from: user upload, built-in demo, or one of the libraries. */
export type AssetOrigin = "upload" | "demo" | "music" | "sfx" | "stock" | "voice";

export interface MediaAsset {
  id: string;
  name: string;
  kind: AssetKind;
  /** Source duration in seconds (images use a default length). */
  duration: number;
  /** Object URL / data URL / http(s) / public path. Missing for synthetic scenes. */
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
  origin?: AssetOrigin;
  /** Library item id (music / sfx catalog) this asset was created from. */
  libraryId?: string;
  /** Attribution line required by the license (e.g. CC BY). */
  credit?: string;
  license?: string;
  /** Path in the Supabase "media" bucket once the file is uploaded to the cloud. */
  storagePath?: string;
  /** Editing style measured from this video when it was attached to the AI chat as a reference. */
  referenceStyle?: ReferenceStyle;
  /** Set when the file was attached in the AI chat: a style reference or material to edit. */
  chatRole?: "reference" | "material";
}

/** Editing rhythm and look of a reference video, measured in the browser (see reference-analysis.ts). */
export interface ReferenceStyle {
  /** Seconds analysed (long references are sampled from the start). */
  duration: number;
  aspect: AspectRatio;
  /** Shot lengths in seconds, in order. */
  shots: number[];
  /** How each cut enters: index i is the transition into shot i + 1. */
  transitions: ("cut" | "fade" | "dip-black" | "flash")[];
  avgShot: number;
  /** Dominant colours, most common first. */
  palette: string[];
  /** 0..1 averages over the sampled frames. */
  brightness: number;
  saturation: number;
  contrast: number;
  /** > 0 warm, < 0 cool. */
  warmth: number;
  /** Closest colour preset id (catalog/filters.ts). */
  filter: string;
  /** Music tempo of the reference, when its audio could be analysed. */
  bpm?: number;
  /** Small JPEG frames (data URLs) shown to the vision model. */
  frames: string[];
}

export type TrackKind = "video" | "overlay" | "text" | "sticker" | "effect" | "audio";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

/** Colour preset id (see catalog/filters.ts). Kept as string so the catalog can grow. */
export type FilterId = string;
/** Transition id (see catalog/transitions.ts). */
export type TransitionId = string;
/** Text template id (see catalog/text-templates.ts) — the legacy style ids remain valid. */
export type TextStyleId = string;
export type MotionId = "none" | "ken-burns" | "punch-in" | "shake" | "drift";
/** Clip animation id (see catalog/animations.ts). */
export type AnimationId = string;

export type Easing = "linear" | "ease" | "ease-in" | "ease-out" | "hold" | "bounce";

export interface Keyframe {
  /** Seconds from the clip start. */
  t: number;
  value: number;
  easing: Easing;
}

export type KeyframeProp = "x" | "y" | "scale" | "rotation" | "opacity" | "volume" | "focusX";

export type Keyframes = Partial<Record<KeyframeProp, Keyframe[]>>;

export interface ClipAnimation {
  id: AnimationId;
  duration: number;
}

export interface Adjustments {
  brightness: number; // -1..1
  contrast: number; // -1..1
  saturation: number; // -1..1
  temperature: number; // -1 (cool) .. 1 (warm)
  tint: number; // -1 (green) .. 1 (magenta)
  hue: number; // degrees -180..180
  blur: number; // px at 1080p
  vignette: number; // 0..1
  sharpen: number; // 0..1 (contrast boost on edges approximation)
}

export type MaskShape = "none" | "circle" | "rect" | "linear" | "mirror" | "star" | "heart" | "diamond";

export interface Mask {
  shape: MaskShape;
  /** Size relative to the frame, 0..1. */
  size: number;
  feather: number; // 0..1
  x: number; // -1..1 offset
  y: number;
  rotation: number;
  invert: boolean;
}

export interface ChromaKey {
  enabled: boolean;
  color: string;
  similarity: number; // 0..1
  smoothness: number; // 0..1
  spill: number; // 0..1
}

export interface Crop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type SpeedCurve = "none" | "montage" | "hero" | "bullet" | "jump-cut" | "flash-in" | "flash-out";

export type FitMode = "cover" | "contain" | "fill";

export interface BaseClip {
  id: string;
  trackId: string;
  /** Position on the timeline in seconds. */
  start: number;
  /** Visible length on the timeline in seconds. */
  duration: number;
  transitionIn: TransitionId;
  transitionDuration: number;
  keyframes?: Keyframes;
}

/** Transform shared by every visual clip. x/y are offsets in % of the frame. */
export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipH?: boolean;
  flipV?: boolean;
}

export interface VisualExtras {
  animIn?: ClipAnimation;
  animOut?: ClipAnimation;
  animCombo?: ClipAnimation;
  blendMode?: string;
}

export interface MediaClip extends BaseClip, Partial<Omit<Transform, "scale" | "opacity">>, VisualExtras {
  type: "media";
  assetId: string;
  /** Seconds trimmed from the start of the source. */
  in: number;
  speed: number;
  speedCurve?: SpeedCurve;
  reverse?: boolean;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
  filter: FilterId;
  filterIntensity?: number;
  motion: MotionId;
  opacity: number;
  scale: number;
  fit?: FitMode;
  crop?: Crop;
  adjust?: Partial<Adjustments>;
  mask?: Mask;
  chroma?: ChromaKey;
}

export type TextAlign = "left" | "center" | "right";

export interface TextClip extends BaseClip, Partial<Transform>, VisualExtras {
  type: "text";
  text: string;
  style: TextStyleId;
  position: "top" | "center" | "bottom";
  color: string;
  font?: string;
  fontSize?: number; // px at 1080p
  fontWeight?: number;
  italic?: boolean;
  uppercase?: boolean;
  align?: TextAlign;
  letterSpacing?: number;
  lineHeight?: number;
  strokeColor?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  bgColor?: string;
  bgOpacity?: number;
  highlightColor?: string;
  /** Text animation (character / word based). */
  textIn?: AnimationId;
  textOut?: AnimationId;
  textLoop?: AnimationId;
}

export interface StickerClip extends BaseClip, Partial<Transform>, VisualExtras {
  type: "sticker";
  /**
   * "emoji:<name>" (animated Noto emoji), "char:<emoji>", "shape:<id>", "motion:<id>" (animated preset
   * drawn in code), "gif:<giphy id>" (GIPHY sticker / GIF, URL in `src`) or "icon:<prefix:name>"
   * (Iconify icon, SVG markup in `src`).
   */
  sticker: string;
  color?: string;
  /** GIF URL (gif:) or SVG markup (icon:). */
  src?: string;
  /** Width / height of the source (GIFs are rarely square). */
  aspect?: number;
  /** Attribution for the export credits, when the licence asks for it. */
  credit?: string;
  license?: string;
}

export interface EffectClip extends BaseClip {
  type: "effect";
  effect: string;
  intensity: number;
}

export type Clip = MediaClip | TextClip | StickerClip | EffectClip;
export type VisualClip = MediaClip | TextClip | StickerClip;

export interface ProjectGrade {
  filter: FilterId;
  letterbox: boolean;
  vignette: boolean;
  grain: boolean;
}

export type BackgroundType = "color" | "blur" | "gradient";

export interface ProjectBackground {
  type: BackgroundType;
  color: string;
  gradient?: string;
  blur: number;
}

export interface Project {
  name: string;
  aspect: AspectRatio;
  fps: number;
  tracks: Track[];
  clips: Clip[];
  grade: ProjectGrade;
  background?: ProjectBackground;
}

export interface EditorSnapshot {
  project: Project;
  assets: MediaAsset[];
}
