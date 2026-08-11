// server/lib/rng.js
//
// Deterministic PRNG (mulberry32). Copied from the legacy js/data.js so the
// server-side generator and the old canned data use the same algorithm.
// Same seed -> same sequence, which keeps the generator reproducible across
// runs (no DB, boot-only data).

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}