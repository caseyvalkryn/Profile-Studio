// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LOSSES } from './adapter';
import { coveredS, run, stageAtLeast } from './run';
import { score } from './score';
import { testEffector, testSensor, testThreat, testVignette } from './testVignette';

function withPCorrect(v: ReturnType<typeof testVignette>, pCorrectId: number) {
  return { ...v, sensors: v.sensors.map((s) => ({ ...s, model: { ...s.model, pCorrectId } })) };
}

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

  // F-01: Identify follows the ID model (dwell plus pCorrectId), not the proximity ladder.
  it('pCorrectId 0 identifies nothing: 2.1.2 is 0 percent or null, rows stop at track', () => {
    const r = run(withPCorrect(v, 0), 10, 1);
    expect(r.rows.every((x) => !stageAtLeast(x.stage_reached, 'identify'))).toBe(true);
    expect(r.rows.some((x) => x.stage_reached === 'track')).toBe(true);
    const [p] = score(r.rows, [{ id: '2.1.2', op: '>=', threshold: 80, unit: '%' }]);
    expect(p!.value === 0 || p!.value === null).toBe(true);
    // The engine still fired on proximity; the trace keeps the shot, the row does not.
    expect(r.trace.some((t) => t.times.engage != null)).toBe(true);
    expect(r.rows.every((x) => x.outcome === 'No Attempt')).toBe(true);
  });

  it('a slow threat with a far-off effector is identified after the dwell', () => {
    const slow = testVignette({
      threats: [{ ...testThreat('T-01', 'g1-quad-isr'), speedMs: 10 }],
      sensors: [testSensor('S-01', 'radar', 5000)],
      effectors: [testEffector('E-01', { x: 3000, rangeM: 400 })],
    });
    const r = run(withPCorrect(slow, 1), 5, 1);
    const dwell = slow.sensors[0]!.model.idDwellS;
    for (const x of r.rows) {
      expect(stageAtLeast(x.stage_reached, 'identify')).toBe(true);
      expect(x.id_time_s!).toBeGreaterThanOrEqual(dwell);
      expect(x.id_time_s!).toBeLessThan(dwell + 20);
    }
  });

  it('default vignette id_time_s is of the order of the dwell, not the reach entry', () => {
    const ids = a.rows.map((r) => r.id_time_s).filter((x): x is number => x != null);
    const mean = ids.reduce((p, q) => p + q, 0) / ids.length;
    expect(mean).toBeLessThan(30);
    expect(mean).toBeGreaterThanOrEqual(v.sensors[0]!.model.idDwellS);
  });

  // F-02: 3.1.3 is the range at defeat; the shot range stays in the trace.
  it('engagement_range_m on a Success row is the range at the kill effect', () => {
    const e = v.effectors[0]!;
    let differ = 0;
    for (let i = 0; i < a.rows.length; i++) {
      const r = a.rows[i]!;
      if (r.outcome !== 'Success') continue;
      const t = a.trace[i]!;
      const shotR = Math.hypot(t.positions.engage!.x - e.x, t.positions.engage!.y - e.y);
      const killR = Math.hypot(t.positions.effect!.x - e.x, t.positions.effect!.y - e.y);
      expect(r.engagement_range_m).toBeCloseTo(killR, 6);
      if (Math.abs(shotR - killR) > 1) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  });

  // F-03: no link latency; Target = declaration start + decisionS + assignS.
  it('Target time is identify (or firm track) plus decisionS plus assignS, no link latency', () => {
    const radarOnly = testVignette({ sensors: [testSensor('S-01', 'radar', 5000)] });
    const r = run(radarOnly, 10, 1);
    const chain = radarOnly.chainTime.decisionS + radarOnly.chainTime.assignS;
    let checked = 0;
    for (const t of r.trace) {
      if (t.times.identify == null || t.times.track == null || t.times.target == null) continue;
      const start = Math.max(t.times.identify, t.times.track);
      expect(Math.abs(t.times.target - (start + chain))).toBeLessThanOrEqual(0.5);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  // F-04: RF-only vignettes reach track by the M x scan hold.
  it('an RF-only vignette reaches track', () => {
    const rf = testVignette({
      threats: [testThreat('T-01', 'g1-quad-isr')],
      sensors: [testSensor('S-01', 'rf', 4000)],
    });
    const r = run(rf, 5, 1);
    expect(r.rows.every((x) => x.stage_reached === 'track')).toBe(true);
    for (let i = 0; i < r.rows.length; i++) {
      const t = r.trace[i]!;
      expect(t.times.track!).toBeGreaterThanOrEqual(t.times.detect!);
      expect(r.rows[i]!.track_continuity_pct).toBeGreaterThan(0);
    }
  });

  // F-05: inclusive sample intervals earn one step each.
  it('coveredS counts one sweep step per sample and merges adjacent holds', () => {
    expect(coveredS([[0, 0]], 0, 10, 0.5)).toBe(0.5);
    expect(
      coveredS(
        [
          [0, 1],
          [1.5, 2],
        ],
        0,
        10,
        0.5,
      ),
    ).toBe(2.5);
    expect(
      coveredS(
        [
          [0, 1],
          [3, 4],
        ],
        0,
        10,
        0.5,
      ),
    ).toBe(3);
    expect(coveredS([[0, 10]], 2, 4, 0.5)).toBe(2.5);
    const full = a.rows.find((r) => r.track_continuity_pct != null)!;
    expect(full.track_continuity_pct).toBeLessThanOrEqual(100);
  });

  // F-06: the trial flies flat; the loss is declared.
  it('a climbing path flies at the first waypoint altitude (declared loss)', () => {
    const t = testThreat('T-01', 'g1-quad-isr', 6000, 30);
    t.path[1]!.z = 400;
    const r = run(testVignette({ threats: [t] }), 3, 1);
    for (const x of r.rows) expect(x.detect_alt_m).toBe(30);
    expect(LOSSES.altitudeProfile).toMatch(/first waypoint/);
  });

  // F-07: observations inside minRangeM are dropped before the ladder.
  it('sensor minRangeM removes the holds inside it', () => {
    const near = testVignette({
      threats: [testThreat('T-01', 'g1-quad-isr')],
      sensors: [testSensor('S-01', 'radar', 5000, { minRangeM: 4000 })],
      effectors: [],
      nodes: [],
    });
    const far = testVignette({
      threats: [testThreat('T-01', 'g1-quad-isr')],
      sensors: [testSensor('S-01', 'radar', 5000)],
      effectors: [],
      nodes: [],
    });
    const n = run(near, 5, 1);
    const f = run(far, 5, 1);
    for (let i = 0; i < n.rows.length; i++) {
      const row = n.rows[i]!;
      expect(row.stage_reached).not.toBe('none');
      expect(row.detect_range_m!).toBeGreaterThanOrEqual(4000);
      expect(row.track_continuity_pct!).toBeLessThan(f.rows[i]!.track_continuity_pct!);
    }
  });
});
