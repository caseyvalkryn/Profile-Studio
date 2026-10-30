// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { betaQuantile, meanInterval, quantile, sortedMeanInterval, wilson } from './stats';

describe('wilson', () => {
  it('reports p-hat 16/20 = 0.80', () => {
    expect(wilson(16, 20).p).toBe(0.8);
  });

  it('16/20 at 95% gives about 0.58 to 0.92', () => {
    const w = wilson(16, 20);
    expect(w.lo).toBeCloseTo(0.58, 2);
    expect(w.hi).toBeCloseTo(0.92, 2);
    expect(w.method).toBe('wilson');
  });

  it('25/28 gives 0.893 with about 0.73 to 0.96', () => {
    const w = wilson(25, 28);
    expect(w.p).toBeCloseTo(0.893, 3);
    expect(w.lo).toBeCloseTo(0.73, 2);
    expect(w.hi).toBeCloseTo(0.96, 2);
  });

  it('stays inside [0, 1] at the extremes', () => {
    expect(wilson(0, 10).lo).toBe(0);
    expect(wilson(10, 10).hi).toBe(1);
  });
});

describe('betaQuantile', () => {
  it('matches the analytic quantiles of Beta(2, 1)', () => {
    expect(betaQuantile(0.025, 2, 1)).toBeCloseTo(Math.sqrt(0.025), 6);
    expect(betaQuantile(0.975, 2, 1)).toBeCloseTo(Math.sqrt(0.975), 6);
  });

  it('Beta(17, 5) equal-tailed 95% interval is (0.5809, 0.9178)', () => {
    expect(betaQuantile(0.025, 17, 5)).toBeCloseTo(0.5809, 4);
    expect(betaQuantile(0.975, 17, 5)).toBeCloseTo(0.9178, 4);
  });

  it('clamps p outside (0, 1) to the support', () => {
    expect(betaQuantile(0, 3, 4)).toBe(0);
    expect(betaQuantile(1, 3, 4)).toBe(1);
  });
});

describe('meanInterval', () => {
  it('uses the exact t quantile (df 3, t = 3.1824)', () => {
    const mi = meanInterval([1, 2, 3, 4]);
    expect(mi.mean).toBe(2.5);
    expect(mi.n).toBe(4);
    expect(mi.sd).toBeCloseTo(1.29099, 4);
    expect(mi.lo).toBeCloseTo(0.44574, 4);
    expect(mi.hi).toBeCloseTo(4.55426, 4);
  });

  it('degenerates to the point at n = 1', () => {
    const mi = meanInterval([7]);
    expect(mi.mean).toBe(7);
    expect(mi.lo).toBe(7);
    expect(mi.hi).toBe(7);
    expect(mi.sd).toBe(0);
  });

  it('returns NaN fields for an empty sample', () => {
    expect(meanInterval([]).mean).toBeNaN();
  });

  it('memoizes the t quantile without moving any bit', () => {
    const cold = meanInterval([1, 2, 3, 4, 5, 6]);
    const warm = meanInterval([1, 2, 3, 4, 5, 6]);
    expect(Object.is(warm.lo, cold.lo)).toBe(true);
    expect(Object.is(warm.hi, cold.hi)).toBe(true);
    const other = meanInterval([1, 2, 3, 4]);
    expect(other.lo).toBeCloseTo(0.44574, 4);
    expect(other.hi).toBeCloseTo(4.55426, 4);
  });

  it('reads a sorted buffer in place', () => {
    const sorted = Float64Array.from([1, 2, 3, 4]);
    expect(sortedMeanInterval(sorted)).toEqual(meanInterval([1, 2, 3, 4]));
    expect(Array.from(sorted)).toEqual([1, 2, 3, 4]);
  });
});

describe('quantile', () => {
  it('interpolates linearly', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
  });

  it('handles the endpoints and unsorted input', () => {
    expect(quantile([3, 1, 2], 0)).toBe(1);
    expect(quantile([3, 1, 2], 1)).toBe(3);
    expect(quantile([], 0.5)).toBeNaN();
  });
});
