// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { run, stageAtLeast } from './run';
import { testEffector, testSensor, testThreat, testVignette } from './testVignette';

describe('run', () => {
  const v = testVignette();
  const a = run(v, 20, 1);

  it('returns n x threats rows and traces', () => {
    expect(a.rows).toHaveLength(20 * v.threats.length);
    expect(a.trace).toHaveLength(a.rows.length);
    expect(a.rows[0]).toMatchObject({ run: 0, threat: 'T-01' });
    expect(a.rows[1]).toMatchObject({ run: 0, threat: 'T-02' });
  });

  it('keeps the DroneScore null invariants', () => {
    // A mixed vignette: one threat the radar never sees, one it defeats.
    const mixed = testVignette({
      threats: [testThreat('T-01', 'g1-quad-isr'), testThreat('T-02', 'g1-quad-isr', 12000, 2500)],
      sensors: [testSensor('S-01', 'radar', 5000, { elMaxDeg: 20 })],
      effectors: [testEffector('E-01')],
    });
    const m = run(mixed, 10, 3);
    const stages = new Set(m.rows.map((r) => r.stage_reached));
    expect(stages.has('none')).toBe(true);
    for (const r of [...a.rows, ...m.rows]) {
      expect(r.detect_range_m == null).toBe(r.stage_reached === 'none');
      expect(r.detect_alt_m == null).toBe(r.stage_reached === 'none');
      const identified = stageAtLeast(r.stage_reached, 'identify');
      if (!identified) {
        expect(r.id_range_m).toBeNull();
        expect(r.id_time_s).toBeNull();
        expect(r.identified_ok).toBeNull();
      } else {
        expect(r.id_range_m).not.toBeNull();
        expect(r.id_time_s).toBeGreaterThanOrEqual(0);
        expect(r.identified_ok).toBe(true);
      }
      expect(r.outcome === 'Success').toBe(r.stage_reached === 'defeat');
      if (r.outcome === 'No Attempt') expect(stageAtLeast(r.stage_reached, 'engage')).toBe(false);
      expect(r.stage_reached).not.toBe('classify');
    }
  });

  it('carries the Target time in the trace, not the row', () => {
    const t = a.trace[0]!;
    expect(t.times.target).not.toBeNull();
    expect(t.times.target!).toBeGreaterThanOrEqual(t.times.identify!);
    expect(t.times.engage!).toBeGreaterThanOrEqual(t.times.target!);
    expect(Object.keys(a.rows[0]!)).not.toContain('target');
    // Positions are in the vignette frame: the run-in from the north has y > 0 at detection.
    expect(t.positions.detect!.y).toBeGreaterThan(0);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const b = run(v, 20, 1);
    expect(b).toEqual(a);
    const c = run(v, 20, 2);
    expect(c.rows).not.toEqual(a.rows);
  });

  it('reports progress per replicate', () => {
    const seen: number[] = [];
    run(v, 3, 1, (done, total) => {
      expect(total).toBe(3);
      seen.push(done);
    });
    expect(seen).toEqual([1, 2, 3]);
  });
});
