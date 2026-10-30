// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RunRow } from '../domain/types';
import { MEASURES } from '../domain/measures';
import { bootstrap, evaluate, MEASURE_FORMULAS, score } from './score';
import { wilson } from './sim/analysis/stats';

function row(over: Partial<RunRow>): RunRow {
  return {
    run: 0,
    threat: 'T-01',
    stage_reached: 'none',
    detect_range_m: null,
    detect_alt_m: null,
    track_continuity_pct: null,
    track_error_m: null,
    id_range_m: null,
    id_time_s: null,
    identified_ok: null,
    engagement_range_m: null,
    time_to_intercept_s: null,
    outcome: 'No Attempt',
    ...over,
  };
}

const detected = (range: number) =>
  row({ stage_reached: 'detect', detect_range_m: range, detect_alt_m: 100 });

describe('score', () => {
  it('scores a proportion with a Wilson interval', () => {
    const rows = [
      ...Array(8)
        .fill(0)
        .map(() => detected(1000)),
      row({}),
      row({}),
    ];
    const [s] = score(rows, [{ id: '1.1.1', op: '>=', threshold: 50, unit: '%' }]);
    const w = wilson(8, 10);
    expect(s!.n).toBe(10);
    expect(s!.value).toBeCloseTo(80);
    expect(s!.interval!.low).toBeCloseTo(100 * w.lo);
    expect(s!.interval!.high).toBeCloseTo(100 * w.hi);
    expect(s!.sourceClass).toBe('simulated');
  });

  it('bootstraps a known sample deterministically', () => {
    const xs = [10, 12, 14, 16, 18, 20];
    const a = bootstrap(xs, (s) => s.reduce((p, q) => p + q, 0) / s.length, 1000, 5);
    const b = bootstrap(xs, (s) => s.reduce((p, q) => p + q, 0) / s.length, 1000, 5);
    expect(a).toEqual(b);
    expect(a.low).toBeGreaterThanOrEqual(10);
    expect(a.high).toBeLessThanOrEqual(20);
    expect(a.low).toBeLessThan(15);
    expect(a.high).toBeGreaterThan(15);
    expect(bootstrap([7], (s) => s[0]!, 100, 1)).toEqual({ low: 7, high: 7 });
  });

  it('evaluates meets, does-not-meet and inconclusive', () => {
    expect(evaluate({ low: 60, high: 90 }, '>=', 50)).toBe('meets');
    expect(evaluate({ low: 10, high: 40 }, '>=', 50)).toBe('does-not-meet');
    expect(evaluate({ low: 40, high: 60 }, '>=', 50)).toBe('inconclusive');
    expect(evaluate({ low: 1, high: 4 }, '<=', 5)).toBe('meets');
    expect(evaluate({ low: 6, high: 9 }, '<=', 5)).toBe('does-not-meet');
    expect(evaluate({ low: 4, high: 6 }, '<=', 5)).toBe('inconclusive');
    const rows = Array(40)
      .fill(0)
      .map(() => detected(3000));
    const [meets] = score(rows, [{ id: '1.1.1', op: '>=', threshold: 80, unit: '%' }]);
    expect(meets!.evaluation).toBe('meets');
    const [range] = score(rows, [{ id: '1.1.2', op: '>=', threshold: 4000, unit: 'm' }]);
    expect(range!.value).toBe(3000);
    expect(range!.evaluation).toBe('does-not-meet');
  });

  it('returns the null pattern for rows the fields cannot produce', () => {
    const rows = [detected(1000)];
    const settings = ['2.1.1', '5.3', '5.8', '2.1.4', '4.1'].map((id) => ({
      id,
      op: '>=' as const,
      threshold: 1,
      unit: '',
    }));
    for (const s of score(rows, settings)) {
      expect(s.value).toBeNull();
      expect(s.interval).toBeNull();
      expect(s.evaluation).toBe('inconclusive');
      expect(s.note).toBeTruthy();
    }
    // A producible row with no qualifying rows is null too.
    const [idRange] = score(rows, [{ id: '2.1.3', op: '>=', threshold: 1, unit: 'm' }]);
    expect(idRange!.value).toBeNull();
    expect(idRange!.note).toMatch(/no row/);
  });

  it('has a formula for every simulated and derived DroneScore row', () => {
    for (const m of MEASURES) {
      if (m.sourceClass === 'simulated' || m.sourceClass === 'derived')
        expect(MEASURE_FORMULAS[m.id], m.id).toBeDefined();
    }
    for (const id of Object.keys(MEASURE_FORMULAS))
      expect(
        MEASURES.some((m) => m.id === id),
        id,
      ).toBe(true);
  });
});
