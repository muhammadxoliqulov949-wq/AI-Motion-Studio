// Synthesizes the montage sound library into public/audio so we ship license-free assets.
// Usage: node scripts/generate-audio.mjs
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const RATE = 22050;
const root = path.join(process.cwd(), "public", "audio");

const writeWav = (file, samples) => {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  console.log("wrote", path.relative(process.cwd(), file), `${(samples.length / RATE).toFixed(2)}s`);
};

let seed = 1;
const noise = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647) * 2 - 1;
};

const normalize = (s, peak = 0.9) => {
  const max = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  return s.map((v) => (v / max) * peak);
};

/** Noise through a one-pole low-pass whose cutoff sweeps — the classic air whoosh. */
const sweep = (seconds, fromHz, toHz, attack) => {
  const n = Math.floor(seconds * RATE);
  const out = new Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const hz = fromHz + (toHz - fromHz) * Math.sin(t * Math.PI);
    const a = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
    lp += a * (noise() - lp);
    const env = t < attack ? t / attack : Math.pow(1 - (t - attack) / (1 - attack), 2);
    out[i] = lp * env;
  }
  return normalize(out, 0.8);
};

const pop = () => {
  const n = Math.floor(0.14 * RATE);
  let phase = 0;
  return normalize(
    Array.from({ length: n }, (_, i) => {
      const t = i / RATE;
      phase += (2 * Math.PI * (180 + 700 * Math.exp(-t * 45))) / RATE;
      return Math.sin(phase) * Math.exp(-t * 30) + (i < 40 ? noise() * 0.3 : 0);
    }),
  );
};

const click = () => {
  const n = Math.floor(0.06 * RATE);
  return normalize(
    Array.from({ length: n }, (_, i) => {
      const t = i / RATE;
      return (Math.sin(2 * Math.PI * 1800 * t) * 0.6 + (i < 60 ? noise() : 0)) * Math.exp(-t * 90);
    }),
    0.7,
  );
};

/** 96 bpm lo-fi loop: pad chords, kick on 1 & 3, off-beat hats. 8 bars = 20 s. */
const bgm = () => {
  const bpm = 96;
  const beat = 60 / bpm;
  const bars = 8;
  const n = Math.floor(bars * 4 * beat * RATE);
  const out = new Float64Array(n);
  const chords = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
    [164.81, 196, 246.94],
  ];
  for (let bar = 0; bar < bars; bar++) {
    const start = Math.floor(bar * 4 * beat * RATE);
    const len = Math.floor(4 * beat * RATE);
    for (const f of chords[bar % 4]) {
      for (let i = 0; i < len; i++) {
        const t = i / RATE;
        const env = Math.min(1, t / 0.3) * Math.min(1, (len - i) / RATE / 0.4);
        const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * t));
        out[start + i] += tri * 0.07 * env;
      }
    }
    for (let b = 0; b < 4; b++) {
      const at = start + Math.floor(b * beat * RATE);
      if (b % 2 === 0) {
        let phase = 0;
        for (let i = 0; i < 0.3 * RATE && at + i < n; i++) {
          const t = i / RATE;
          phase += (2 * Math.PI * (40 + 100 * Math.exp(-t * 25))) / RATE;
          out[at + i] += Math.sin(phase) * 0.5 * Math.exp(-t * 12);
        }
      }
      const hat = at + Math.floor((beat / 2) * RATE);
      for (let i = 0; i < 0.05 * RATE && hat + i < n; i++) out[hat + i] += noise() * 0.08 * (1 - i / (0.05 * RATE));
    }
  }
  return normalize(Array.from(out), 0.7);
};

writeWav(path.join(root, "sfx", "whoosh.wav"), sweep(0.55, 300, 3200, 0.55));
writeWav(path.join(root, "sfx", "swoosh.wav"), sweep(0.32, 900, 6000, 0.35));
writeWav(path.join(root, "sfx", "pop.wav"), pop());
writeWav(path.join(root, "sfx", "click.wav"), click());
writeWav(path.join(root, "bgm", "lofi-96.wav"), bgm());
