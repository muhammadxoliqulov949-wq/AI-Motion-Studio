/** Deterministic 0..1 pseudo-random number from a seed (same idea as remotion's `random`, but server-safe). */
export const seeded = (seed: string | number): number => {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h += h << 13;
  h ^= h >>> 7;
  h += h << 3;
  h ^= h >>> 17;
  h += h << 5;
  return ((h >>> 0) % 1_000_000) / 1_000_000;
};
