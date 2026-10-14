import React from "react";
import { AbsoluteFill, random } from "remotion";
import { SCENES } from "../sample-media";
import type { SceneId } from "../types";

/**
 * Synthetic "footage" drawn in code so the demo project works without uploads.
 * `t` is the source time in seconds, so trimming and speed changes behave like real video.
 */
export const SceneVisual: React.FC<{ scene: SceneId; t: number }> = ({ scene, t }) => {
  const [a, b, c] = SCENES[scene].colors;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${a} 0%, ${b} 70%, ${c} 130%)` }}>
      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
        style={{ width: "100%", height: "100%" }}
      >
        {scene === "city" && <City t={t} />}
        {scene === "mountains" && <Mountains t={t} />}
        {scene === "ocean" && <Ocean t={t} />}
        {scene === "portrait" && <Portrait t={t} accent={c} />}
        {scene === "product" && <Product t={t} accent={b} />}
        {scene === "neon" && <Neon t={t} />}
      </svg>
    </AbsoluteFill>
  );
};

const City: React.FC<{ t: number }> = ({ t }) => (
  <g>
    {Array.from({ length: 60 }, (_, i) => (
      <circle
        key={i}
        cx={random(`sx${i}`) * 1920}
        cy={random(`sy${i}`) * 500}
        r={1 + random(`sr${i}`) * 2}
        fill="#fff"
        opacity={0.3 + 0.5 * Math.abs(Math.sin(t * 2 + i))}
      />
    ))}
    {[0, 1].map((layer) => (
      <g key={layer} transform={`translate(${-((t * (20 + layer * 40)) % 400)} 0)`}>
        {Array.from({ length: 16 }, (_, i) => {
          const w = 90 + random(`w${layer}${i}`) * 80;
          const h = 250 + random(`h${layer}${i}`) * (layer ? 450 : 300);
          const x = i * 160 - 40;
          return (
            <g key={i}>
              <rect x={x} y={1080 - h} width={w} height={h} fill={layer ? "#0b1020" : "#1e1b4b"} />
              {Array.from({ length: 12 }, (_, j) => (
                <rect
                  key={j}
                  x={x + 12 + (j % 3) * 26}
                  y={1080 - h + 20 + Math.floor(j / 3) * 40}
                  width={12}
                  height={18}
                  fill="#fde68a"
                  opacity={random(`win${layer}${i}${j}`) > 0.45 ? 0.85 : 0.08}
                />
              ))}
            </g>
          );
        })}
      </g>
    ))}
  </g>
);

const mountainPath = (seed: string, base: number, amp: number, shift: number) => {
  let d = `M ${-200 - shift} 1080`;
  for (let i = 0; i <= 12; i++) {
    const x = i * 200 - 200 - shift;
    const y = base - random(`${seed}${i}`) * amp;
    d += ` L ${x} ${y}`;
  }
  return `${d} L ${2400 - shift} 1080 Z`;
};

const Mountains: React.FC<{ t: number }> = ({ t }) => (
  <g>
    <circle cx={1400} cy={300 + t * 4} r={90} fill="#fef9c3" opacity={0.9} />
    <path d={mountainPath("m1", 650, 300, (t * 8) % 200)} fill="#1e3a5f" opacity={0.7} />
    <path d={mountainPath("m2", 800, 260, (t * 20) % 200)} fill="#0f2a44" />
    <rect x={0} y={700} width={1920} height={120} fill="#fff" opacity={0.12 + 0.05 * Math.sin(t)} />
    <path d={mountainPath("m3", 980, 160, (t * 45) % 200)} fill="#071a2c" />
  </g>
);

const Ocean: React.FC<{ t: number }> = ({ t }) => (
  <g>
    <circle cx={960} cy={560 + t * 6} r={170} fill="#fdba74" />
    <rect x={0} y={620} width={1920} height={460} fill="#1e3a8a" />
    {Array.from({ length: 9 }, (_, i) => {
      const y = 640 + i * 50;
      let d = `M 0 ${y}`;
      for (let x = 0; x <= 1920; x += 40) {
        d += ` L ${x} ${y + Math.sin(x / 120 + t * (1.5 + i * 0.2) + i) * (6 + i * 2)}`;
      }
      return <path key={i} d={d} stroke="#fdba74" strokeOpacity={0.5 - i * 0.04} strokeWidth={3} fill="none" />;
    })}
  </g>
);

const Portrait: React.FC<{ t: number; accent: string }> = ({ t, accent }) => (
  <g>
    {Array.from({ length: 14 }, (_, i) => (
      <circle
        key={i}
        cx={random(`b${i}`) * 1920}
        cy={random(`by${i}`) * 1080}
        r={40 + random(`br${i}`) * 90}
        fill={accent}
        opacity={0.08 + 0.06 * Math.sin(t + i)}
      />
    ))}
    <g transform={`translate(${960 + Math.sin(t * 0.7) * 8} ${Math.sin(t * 1.3) * 4})`}>
      <ellipse cx={0} cy={1080} rx={360} ry={300} fill="#0c0a09" />
      <rect x={-60} y={640} width={120} height={140} rx={40} fill="#0c0a09" />
      <ellipse cx={0} cy={520} rx={150} ry={185} fill="#0c0a09" />
      <ellipse cx={-110} cy={480} rx={40} ry={140} fill={accent} opacity={0.25} />
    </g>
  </g>
);

const Product: React.FC<{ t: number; accent: string }> = ({ t, accent }) => {
  const rot = Math.sin(t * 0.8) * 12;
  return (
    <g>
      <ellipse cx={960} cy={900} rx={380} ry={50} fill="#000" opacity={0.5} />
      <radialGradient id="spot">
        <stop offset="0%" stopColor="#fff" stopOpacity={0.35} />
        <stop offset="100%" stopColor="#fff" stopOpacity={0} />
      </radialGradient>
      <circle cx={960} cy={480} r={520} fill="url(#spot)" />
      <g transform={`rotate(${rot} 960 600) translate(0 ${Math.sin(t * 2) * 10})`}>
        <rect x={860} y={300} width={200} height={560} rx={60} fill={accent} />
        <rect x={905} y={240} width={110} height={90} rx={20} fill="#e5e7eb" />
        <rect x={880} y={420} width={160} height={180} rx={12} fill="#fff" opacity={0.9} />
        <rect x={880 + ((t * 120) % 300) - 100} y={320} width={30} height={520} fill="#fff" opacity={0.25} />
      </g>
    </g>
  );
};

const Neon: React.FC<{ t: number }> = ({ t }) => (
  <g>
    {Array.from({ length: 80 }, (_, i) => {
      const x = random(`rx${i}`) * 1920;
      const y = ((random(`ry${i}`) * 1080 + t * 900) % 1200) - 100;
      return <line key={i} x1={x} y1={y} x2={x - 8} y2={y + 40} stroke="#a5f3fc" strokeOpacity={0.35} strokeWidth={2} />;
    })}
    <text
      x={960}
      y={480}
      textAnchor="middle"
      fontSize={200}
      fontWeight={800}
      fill="none"
      stroke="#e879f9"
      strokeWidth={8}
      opacity={Math.sin(t * 13) > -0.8 ? 1 : 0.3}
      style={{ filter: "drop-shadow(0 0 24px #e879f9)" }}
    >
      OPEN
    </text>
    <rect x={560} y={600} width={800} height={14} rx={7} fill="#22d3ee" style={{ filter: "drop-shadow(0 0 20px #22d3ee)" }} />
    <rect x={0} y={900} width={1920} height={180} fill="#020617" opacity={0.8} />
  </g>
);
