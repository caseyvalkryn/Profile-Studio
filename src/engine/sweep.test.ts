// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyFactor, sweep } from './sweep';
import { testVignette } from './testVignette';

describe('sweep', () => {
  it('three altitude levels give three deterministic cells', () => {
    const v = testVignette();
    const f = { kind: 'threat-altitude' as const, levels: [50, 150, 300] };
    const a = sweep(v, [f], 5, 1);
    expect(a.cells).toHaveLength(3);
    expect(a.cells.map((c) => c.levels)).toEqual([[50], [150], [300]]);
    for (const c of a.cells) expect(c.scores.map((s) => s.id)).toEqual(['1.1.1', '1.1.2', '3.1.2']);
    expect(sweep(v, [f], 5, 1)).toEqual(a);
    // The vignette is untouched.
    expect(v.threats[0]!.path[0]!.z).toBe(100);
  });

  it('two factors make a grid', () => {
    const v = testVignette();
    const s = sweep(
      v,
      [
        { kind: 'threat-speed', levels: [10, 20] },
        { kind: 'sensor-range', levels: [3000, 5000], target: 'S-01' },
      ],
      2,
      1,
    );
    expect(s.cells.map((c) => c.levels)).toEqual([
      [10, 3000],
      [10, 5000],
      [20, 3000],
      [20, 5000],
    ]);
  });

  it('reports progress once per test point', () => {
    const seen: [number, number][] = [];
    sweep(testVignette(), [{ kind: 'threat-speed', levels: [10, 20, 30] }], 2, 1, {}, (d, t) =>
      seen.push([d, t]),
    );
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('applies each factor purely', () => {
    const v = testVignette();
    const bearing = applyFactor(v, { kind: 'approach-bearing', levels: [], target: 'T-01' }, 90);
    const p = bearing.threats[0]!.path[0]!;
    expect(p.x).toBeCloseTo(6200, 3);
    expect(p.y).toBeCloseTo(-200, 3);
    const off = applyFactor(v, { kind: 'sensor-position-offset', levels: [] }, 100);
    expect(off.sensors[0]!.y).toBeCloseTo(100);
    const rng = applyFactor(v, { kind: 'sensor-range', levels: [] }, 2500);
    expect(rng.sensors[0]!.rangeM).toBe(2500);
    const pd = rng.sensors[0]!.model.pd;
    expect(pd.kind === 'swerling' && pd.refRangeM).toBe(2500);
    expect(v.sensors[0]!.rangeM).toBe(5000);
  });
});
