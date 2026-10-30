// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hashU01, idHash, mulberry32 } from './prng';

describe('mulberry32', () => {
  it('gives the same first values the stats.ts private copy gave for seed 1', () => {
    const r = mulberry32(1);
    expect([r(), r(), r()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  it('two generators with the same seed agree', () => {
    const a = mulberry32(4821);
    const b = mulberry32(4821);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
});

describe('idHash', () => {
  it('is FNV-1a 32-bit: the empty string is the offset basis and "a" one step from it', () => {
    // FNV-1a: h = 0x811c9dc5; h ^= byte; h *= 0x01000193 (mod 2^32).
    // "a": (0x811c9dc5 ^ 0x61) * 0x01000193 mod 2^32 = 0xe40c292c.
    expect(idHash('')).toBe(0x811c9dc5);
    expect(idHash('a')).toBe(0xe40c292c);
  });

  it('pins the seed radar id so a future change is visible', () => {
    expect(idHash('lib-giraffe1x')).toBe(idHash('lib-giraffe1x'));
    expect(idHash('lib-giraffe1x')).toBe(PINNED_ID_HASH);
    expect(idHash('lib-giraffe1x')).not.toBe(idHash('lib-giraffe1y'));
  });
});

/** idHash('lib-giraffe1x'): FNV-1a over the 13 code units. */
const PINNED_ID_HASH = 2432424072;
/** hashU01(4821, 0, 1, 7, 11, 0, 3): xor fold, fmix32 per part. */
const PINNED_U01 = 0.9256280576810241;

describe('hashU01', () => {
  it('pins one value and repeats it', () => {
    expect(hashU01(4821, 0, 1, 7, 11, 0, 3)).toBe(hashU01(4821, 0, 1, 7, 11, 0, 3));
    expect(hashU01(4821, 0, 1, 7, 11, 0, 3)).toBe(PINNED_U01);
  });

  it('is uniform over 1e5 draws: mean within 0.005 of 0.5, chi-square within 3 sd', () => {
    // 1e5 draws over 100 bins, 1000 expected per bin. The mean of 1e5
    // uniforms has sd 1 / sqrt(12e5) = 0.00091, so 0.005 is over 5 sd. The
    // chi-square statistic over 100 bins has 99 degrees of freedom: mean 99,
    // sd sqrt(2 * 99) = 14.07, so the bound is 99 + 3 * 14.07 = 141.2. One
    // bin has sd sqrt(1000 * 0.99) = 31.5, so a 5 percent band (50) is 1.6 sd
    // and a uniform source breaks it in about 11 of 100 bins; the chi-square
    // bound is the analytic test, and every bin stays within 3 sd (94).
    const N = 100000;
    const bins = new Array<number>(100).fill(0);
    let sum = 0;
    for (let i = 0; i < N; i += 1) {
      const u = hashU01(4821, i % 7, 1 + (i % 4), 0x1234abcd, 0x9e3779b9, i % 3, i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
      bins[Math.floor(u * 100)]! += 1;
    }
    expect(Math.abs(sum / N - 0.5)).toBeLessThan(0.005);
    const chi2 = bins.reduce((acc, b) => acc + ((b - 1000) * (b - 1000)) / 1000, 0);
    expect(chi2).toBeLessThan(99 + 3 * Math.sqrt(2 * 99));
    for (const b of bins) expect(Math.abs(b - 1000)).toBeLessThan(3 * 31.5);
  });

  it('the four draw kinds with the same remaining parts give four distinct values', () => {
    const values = [1, 2, 3, 4].map((kind) => hashU01(4821, 0, kind, 7, 11, 0, 3));
    expect(new Set(values).size).toBe(4);
  });

  it('a change in any single part changes the value', () => {
    const parts = [4821, 0, 1, 7, 11, 0, 3];
    const base = hashU01(...parts);
    for (let i = 0; i < parts.length; i += 1) {
      const moved = [...parts];
      moved[i]! += 1;
      expect(hashU01(...moved)).not.toBe(base);
    }
    // A negative part folds as its 32-bit unsigned image, not as NaN.
    expect(hashU01(-1)).toBe(hashU01(0xffffffff));
  });
});
