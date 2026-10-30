// @vitest-environment node
import { coverageWindows, inCoverage, posAt, splitTimes, timed, tmax, windowsOf } from './geo';
import type { CoverageSystem, TimedPoint } from './geo';

const wp = (x: number, y: number, z: number, holdS = 0) => ({ x, y, z, holdS });

describe('timed', () => {
  it('uses 3D leg length over speed and extends t1 by the hold', () => {
    const w = timed([wp(0, 0, 0), wp(300, 400, 0, 30), wp(300, 400, 120)], 10);
    expect(w.map((q) => [q.t0, q.t1])).toEqual([
      [0, 0],
      [50, 80],
      [92, 92],
    ]);
  });

  it('defaults a non-positive speed to 15 m/s', () => {
    expect(timed([wp(0, 0, 0), wp(150, 0, 0)], 0)[1]!.t0).toBe(10);
  });

  it('tmax floors at 60 s', () => {
    expect(tmax([timed([wp(0, 0, 0), wp(10, 0, 0)], 10)])).toBe(60);
  });
});

describe('posAt', () => {
  const w = timed([wp(0, 0, 0), wp(100, 0, 0, 20), wp(100, 100, 0)], 10);
  it('interpolates on a leg and holds at a waypoint', () => {
    expect(posAt(w, 5)).toMatchObject({ x: 50, y: 0, vx: 10, vy: 0, holding: false });
    expect(posAt(w, 20)).toMatchObject({ x: 100, y: 0, vx: 0, vy: 0, holding: true });
    expect(posAt(w, 35)).toMatchObject({ x: 100, y: 50, vx: 0, vy: 10 });
  });
  it('clamps before the start and after the end', () => {
    expect(posAt(w, -5)).toMatchObject({ x: 0, y: 0 });
    expect(posAt(w, 500)).toMatchObject({ x: 100, y: 100, vx: 0, vy: 0 });
  });
});

describe('inCoverage', () => {
  const base: CoverageSystem = { kind: 'radar', x: 0, y: 0, z: 0, rangeM: 1000 };
  it('needs an active system with range and a slant range in [rmin, range]', () => {
    expect(inCoverage(base, { x: 500, y: 0, z: 0 })).toBe(true);
    expect(inCoverage(base, { x: 1000.1, y: 0, z: 0 })).toBe(false);
    expect(inCoverage({ ...base, minRangeM: 600 }, { x: 500, y: 0, z: 0 })).toBe(false);
    expect(inCoverage({ ...base, active: false }, { x: 500, y: 0, z: 0 })).toBe(false);
    expect(inCoverage({ ...base, rangeM: 0 }, { x: 0, y: 0, z: 0 })).toBe(false);
    expect(inCoverage(base, { x: 800, y: 0, z: 600 })).toBe(true); // 3D range 1000 exactly
  });
  it('checks the FOV against bearing only when fov < 360', () => {
    const eo = { ...base, kind: 'eoir', fovDeg: 30, bearingDeg: 90 }; // looking east
    expect(inCoverage(eo, { x: 500, y: 0, z: 0 })).toBe(true);
    expect(inCoverage(eo, { x: 500, y: 500 * Math.tan((14 * Math.PI) / 180), z: 0 })).toBe(true);
    expect(inCoverage(eo, { x: 500, y: 500 * Math.tan((16 * Math.PI) / 180), z: 0 })).toBe(false);
    expect(inCoverage({ ...eo, fovDeg: 360 }, { x: -500, y: 0, z: 0 })).toBe(true);
  });
  it('checks elevation and target height limits', () => {
    expect(inCoverage({ ...base, elMinDeg: 5 }, { x: 500, y: 0, z: 20 })).toBe(false);
    expect(inCoverage({ ...base, elMinDeg: 5 }, { x: 500, y: 0, z: 60 })).toBe(true);
    expect(inCoverage({ ...base, elMaxDeg: 30 }, { x: 100, y: 0, z: 100 })).toBe(false);
    expect(inCoverage({ ...base, zMinM: 50 }, { x: 500, y: 0, z: 40 })).toBe(false);
    expect(inCoverage({ ...base, zMaxM: 50 }, { x: 500, y: 0, z: 60 })).toBe(false);
    expect(inCoverage({ ...base, zMinM: 50, zMaxM: 100 }, { x: 500, y: 0, z: 60 })).toBe(true);
  });
  it('rf and ew systems skip a threat that does not emit', () => {
    const p = { x: 500, y: 0, z: 0 };
    expect(inCoverage({ ...base, kind: 'rf' }, p, { emitsRf: false })).toBe(false);
    expect(inCoverage({ ...base, kind: 'ew' }, p, { emitsRf: false })).toBe(false);
    expect(inCoverage({ ...base, kind: 'rf' }, p, { emitsRf: true })).toBe(true);
    expect(inCoverage(base, p, { emitsRf: false })).toBe(true);
    expect(inCoverage({ ...base, kind: 'rf', fovDeg: 10 }, p, { ringOnly: true })).toBe(true);
  });
});

describe('windowsOf', () => {
  // 10 m/s along x from 0 to 1000 over 100 s
  const w = timed([wp(0, 0, 0), wp(1000, 0, 0)], 10);
  it('bisects state changes to 0.1 s', () => {
    const ws = windowsOf((p) => p.x >= 333 && p.x <= 666, w);
    expect(ws).toHaveLength(1);
    expect(Math.abs(ws[0]![0] - 33.3)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(ws[0]![1] - 66.6)).toBeLessThanOrEqual(0.1);
  });
  it('merges gaps under 1 s and drops windows under 0.2 s', () => {
    // covered except for a 5 m (0.5 s) hole at x = 500
    const merged = windowsOf((p) => p.x < 500 || p.x > 505, w);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual([0, 100]);
    // two blocks with a 2 s hole stay separate
    expect(windowsOf((p) => p.x < 500 || p.x > 520, w)).toHaveLength(2);
    // a 1 m (0.1 s) blip is dropped
    expect(windowsOf((p) => p.x >= 400 && p.x <= 401, w)).toEqual([]);
  });
  it('coverageWindows reports slant range at entry and exit', () => {
    const s: CoverageSystem = { kind: 'radar', x: 500, y: 0, z: 0, rangeM: 100 };
    const ws = coverageWindows(s, w);
    expect(ws).toHaveLength(1);
    expect(Math.abs(ws[0]!.tIn - 40)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(ws[0]!.tOut - 60)).toBeLessThanOrEqual(0.1);
    expect(ws[0]!.rIn).toBeLessThanOrEqual(100);
    expect(ws[0]!.rOut).toBeLessThanOrEqual(100);
  });
});

describe('splitTimes', () => {
  // a runs north through b, then returns; b and c park 100 m either side of its first leg
  const a: TimedPoint[] = timed([wp(0, 0, 0), wp(500, 0, 0), wp(500, 2000, 0), wp(500, 0, 0)], 10);
  const b: TimedPoint[] = timed([wp(0, 100, 0), wp(500, 100, 0, 350)], 10);
  const c: TimedPoint[] = timed([wp(0, -100, 0), wp(500, -100, 0, 350)], 10);
  it('finds a split once the pair separation passes dLink and a merge at 0.8 dLink', () => {
    const splits = splitTimes([a, b, c], 500, 300);
    expect(splits).toHaveLength(2);
    // a passes through b at t = 60 and leaves it: separation |y - 100| > 300 when y > 400, at t = 90
    expect(splits[0]!).toMatchObject({ from: 1, to: 2 });
    expect(Math.abs(splits[0]!.t - 90)).toBeLessThan(0.05);
    // a rejoins b on the way back: separation under 0.8 * 300 when y < 340, at t = 250 + (2000 - 340) / 10
    expect(splits[1]!).toMatchObject({ from: 2, to: 1 });
    expect(Math.abs(splits[1]!.t - 416)).toBeLessThan(0.05);
  });
  it('ignores a count change that does not hold for 3 s and needs 2 paths', () => {
    // d (100 m/s) joins a parked partner at t = 2.82 and then dips out of dLink for about 1 s
    const d = timed([wp(0, 0, 0), wp(500, 0, 0), wp(500, 300, 0), wp(500, 0, 0)], 100);
    const parked = timed([wp(500, 100, 0, 400)], 10);
    const splits = splitTimes([d, parked], 400, 300);
    expect(splits).toHaveLength(1);
    expect(splits[0]!).toMatchObject({ from: 2, to: 1 });
    expect(Math.abs(splits[0]!.t - 2.82)).toBeLessThan(0.05);
    expect(splitTimes([a], 400, 300)).toEqual([]);
  });
});
