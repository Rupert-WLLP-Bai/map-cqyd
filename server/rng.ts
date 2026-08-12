// server/rng.ts
//
// Deterministic PRNG (mulberry32). Copied verbatim from server/lib/rng.js
// so the TS port produces the same numeric sequence given the same seed —
// that's what keeps generated mock data byte-identical across the JS→TS
// migration. Same seed -> same sequence; no DB, boot-only data.

export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
