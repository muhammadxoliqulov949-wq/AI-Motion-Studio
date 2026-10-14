import type { MediaAsset, SceneId } from "./types";

export const SCENES: Record<SceneId, { name: string; colors: [string, string, string] }> = {
  city: { name: "Shahar_kechasi.mp4", colors: ["#0f172a", "#7c3aed", "#f472b6"] },
  mountains: { name: "Tog'lar_dron.mp4", colors: ["#0c4a6e", "#38bdf8", "#f0f9ff"] },
  ocean: { name: "Okean_quyosh.mp4", colors: ["#1e3a8a", "#f97316", "#fde68a"] },
  portrait: { name: "Intervyu_A-kamera.mp4", colors: ["#1c1917", "#a16207", "#fcd34d"] },
  product: { name: "Mahsulot_closeup.mp4", colors: ["#111827", "#10b981", "#d1fae5"] },
  neon: { name: "Neon_ko'cha.mp4", colors: ["#020617", "#06b6d4", "#e879f9"] },
};

const SCENE_DURATIONS: Record<SceneId, number> = {
  city: 9,
  mountains: 12,
  ocean: 10,
  portrait: 24,
  product: 7,
  neon: 8,
};

export const sceneGradient = (scene: SceneId) => {
  const [a, b, c] = SCENES[scene].colors;
  return `linear-gradient(135deg, ${a} 0%, ${b} 60%, ${c} 100%)`;
};

export const createSampleAssets = (): MediaAsset[] =>
  (Object.keys(SCENES) as SceneId[]).map((scene) => ({
    id: `asset_${scene}`,
    name: SCENES[scene].name,
    kind: "video",
    duration: SCENE_DURATIONS[scene],
    scene,
    gradient: sceneGradient(scene),
  }));

const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

export const fakePeaks = (count: number, seed = 7) => {
  const rand = seeded(seed);
  return Array.from({ length: count }, (_, i) => {
    const beat = i % 8 === 0 ? 0.35 : 0;
    return Math.min(1, 0.25 + rand() * 0.45 + beat);
  });
};

/** Renders a short procedural lo-fi beat to a WAV blob so the demo has real audio. */
export const renderDemoMusic = async (): Promise<MediaAsset> => {
  const sampleRate = 22050;
  const seconds = 32;
  const bpm = 96;
  const ctx = new OfflineAudioContext(1, sampleRate * seconds, sampleRate);
  const beat = 60 / bpm;
  const master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);

  const chords = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
    [164.81, 196, 246.94],
  ];

  for (let bar = 0; bar < seconds / (beat * 4); bar++) {
    const t0 = bar * beat * 4;
    chords[bar % chords.length].forEach((freq) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.3);
      g.gain.linearRampToValueAtTime(0, t0 + beat * 4);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + beat * 4);
    });
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * beat;
      if (b % 2 === 0) {
        const kick = ctx.createOscillator();
        const kg = ctx.createGain();
        kick.frequency.setValueAtTime(140, t);
        kick.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        kg.gain.setValueAtTime(0.5, t);
        kg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        kick.connect(kg).connect(master);
        kick.start(t);
        kick.stop(t + 0.3);
      }
      const hat = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, sampleRate * 0.05, sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      hat.buffer = buf;
      const hg = ctx.createGain();
      hg.gain.value = 0.08;
      hat.connect(hg).connect(master);
      hat.start(t + beat / 2);
    }
  }

  const rendered = await ctx.startRendering();
  const channel = rendered.getChannelData(0);
  const blob = encodeWav(channel, sampleRate);
  return {
    id: "asset_music",
    name: "Lofi_beat_96bpm.wav",
    kind: "audio",
    duration: seconds,
    src: URL.createObjectURL(blob),
    gradient: "linear-gradient(135deg,#065f46,#34d399)",
    peaks: computePeaks(channel, 400),
  };
};

export const computePeaks = (channel: Float32Array, count: number) => {
  const block = Math.floor(channel.length / count);
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < count; i++) {
    let peak = 0;
    for (let j = 0; j < block; j++) peak = Math.max(peak, Math.abs(channel[i * block + j] ?? 0));
    peaks.push(peak);
    max = Math.max(max, peak);
  }
  return peaks.map((p) => (max ? p / max : 0));
};

const encodeWav = (samples: Float32Array, sampleRate: number) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
};
