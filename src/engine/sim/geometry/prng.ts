/** Deterministic PRNG (mulberry32) so bootstrap results reproduce exactly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string id over its UTF-16 code units. Pure; the caller caches it. */
export function idHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** murmur3 fmix32 finalizer: a 32-bit bijection that spreads every input bit. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Uniform [0, 1) from integer parts. Each part is folded as a 32-bit unsigned integer
 * (`part >>> 0`) into a 32-bit mixer; the result is `state >>> 0` over 2^32. Pure: the
 * same parts give the same value; one part changed gives an unrelated value.
 * The mixer xors each part into the state and runs fmix32 after every fold, from a
 * nonzero start so a leading zero part still moves the state.
 */
export function hashU01(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) h = fmix32((h ^ (part >>> 0)) >>> 0);
  return h / 4294967296;
}
