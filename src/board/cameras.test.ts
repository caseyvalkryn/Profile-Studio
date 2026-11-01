// @vitest-environment node
// Cameras: orbit rates and pitch clamp (legacy contract 12), the axon hint string, fit, and the
// Along path math against hand-computed numbers.
import { importLegacyV4 } from '../domain/migrate';
import { alongAt, axonHint, cameras, cumulative } from './cameras';
import { toScene } from './scene';
import { FIXTURES, derivedView, fixture } from './testkit';
import type { TimedPoint } from '../engine/geo';
import type { DerivedView, Scene } from './types';

const SIZE = { W: 1440, H: 900 };

function load(id: string): { sc: Scene; d: DerivedView } {
  const f = fixture(id);
  return {
    sc: toScene(importLegacyV4(JSON.parse(JSON.stringify(f.input)))),
    d: derivedView(f.derived),
  };
}

describe('axon orbit', () => {
  it('turns yaw 0.45 degrees and pitch 0.35 degrees per pixel', () => {
    expect(cameras.axon.rotate(30, 40, 10, 0)).toEqual({ yaw: 34.5, pitch: 40 });
    const r = cameras.axon.rotate(30, 40, 0, 10);
    expect(r.yaw).toBe(30);
    expect(r.pitch).toBeCloseTo(43.5, 10);
    expect(cameras.axon.rotate(0, 40, -20, -20).yaw).toBe(-9);
  });

  it('clamps pitch to 8..86 degrees', () => {
    expect(cameras.axon.rotate(0, 40, 0, 1000).pitch).toBe(86);
    expect(cameras.axon.rotate(0, 40, 0, -1000).pitch).toBe(8);
    expect(cameras.axon.rotate(0, 86, 0, 1).pitch).toBe(86);
    expect(cameras.axon.rotate(0, 8, 0, -1).pitch).toBe(8);
  });

  it('writes the hint exactly as legacy', () => {
    expect(axonHint(3, 32.4, 47.6)).toBe('vertical x3  yaw 32°  pitch 48°');
    const { sc, d } = load('CUAS-001');
    const cam = cameras.axon.setup(sc.scene, d, SIZE, { yaw: 45, pitch: 30 });
    expect(cam.hint).toMatch(/^vertical x\d+(\.\d+)? {2}yaw 45° {2}pitch 30°$/);
  });
});

describe('fit', () => {
  for (const id of FIXTURES) {
    it(id + ': plan and elev frames sit inside the board; unproject inverts project', () => {
      const { sc, d } = load(id);
      for (const kind of ['plan', 'elev'] as const) {
        const cam = cameras.get(kind).setup(sc.scene, d, SIZE, {});
        const fr = cam.frame;
        expect(fr.x0).toBeGreaterThanOrEqual(0);
        expect(fr.y0).toBeGreaterThanOrEqual(0);
        expect(fr.x1).toBeLessThanOrEqual(SIZE.W);
        expect(fr.y1).toBeLessThanOrEqual(SIZE.H);
      }
      const plan = cameras.plan.setup(sc.scene, d, SIZE, {});
      const [sx, sy] = plan.project(123, -456, 0);
      const u = plan.unproject(sx, sy) as { x: number; y: number };
      expect(u.x).toBeCloseTo(123, 6);
      expect(u.y).toBeCloseTo(-456, 6);
      const elev = cameras.elev.setup(sc.scene, d, SIZE, {});
      const [ex, ey] = (
        elev as unknown as { projectRZ(r: number, z: number): [number, number] }
      ).projectRZ(800, 120);
      const v = elev.unproject(ex, ey) as { r: number; z: number };
      expect(v.r).toBeCloseTo(800, 6);
      expect(v.z).toBeCloseTo(120, 6);
    });
  }

  it('zoom and pan move the projection as legacy (screen = board * zoom + pan)', () => {
    const { sc, d } = load('CUAS-001');
    const a = cameras.plan.setup(sc.scene, d, SIZE, {}).project(0, 0, 0);
    const b = cameras.plan.setup(sc.scene, d, SIZE, { zoom: 2, px: 10, py: -5 }).project(0, 0, 0);
    expect(b[0]).toBeCloseTo(a[0] * 2 + 10, 6);
    expect(b[1]).toBeCloseTo(a[1] * 2 - 5, 6);
  });
});

describe('Along path', () => {
  it('cumulative and alongAt match hand-computed numbers', () => {
    // Move 0..10 s over 500 m, hold 10..20 s, move 20..30 s over 600 m.
    const w: TimedPoint[] = [
      { x: 0, y: 0, z: 100, t0: 0, t1: 0 },
      { x: 300, y: 400, z: 200, t0: 10, t1: 20 },
      { x: 300, y: 1000, z: 500, t0: 30, t1: 30 },
    ];
    const cum = cumulative(w);
    expect(cum).toEqual([0, 500, 1100]);
    const at = (t: number) => alongAt(w, cum, t);
    expect(at(-5)).toEqual({ s: 0, z: 100 });
    expect(at(0)).toEqual({ s: 0, z: 100 });
    expect(at(5)).toEqual({ s: 250, z: 150 });
    expect(at(15)).toEqual({ s: 500, z: 200 });
    expect(at(25)).toEqual({ s: 800, z: 350 });
    expect(at(30)).toEqual({ s: 1100, z: 500 });
    expect(at(40)).toEqual({ s: 1100, z: 500 });
    expect(alongAt([], [], 3)).toEqual({ s: 0, z: 0 });
  });
  for (const id of FIXTURES) {
    const { sc, d } = load(id);
    const pids = Object.keys(d.timed || {});
    if (!pids.length) continue;
    it(id + ': elev in Along path mode spans the path and names it', () => {
      const pid = pids[0]!;
      const cam = cameras.elev.setup(sc.scene, d, SIZE, { elevationMode: 'alongPath', path: pid });
      const cum = cumulative(d.timed[pid]!);
      const len = cum.length ? cum[cum.length - 1]! : 0;
      expect(cam.maxR).toBeCloseTo(Math.max(1.05 * len, 1000), 6);
      expect(cam.axes.xLabel).toBe('Along ' + pid);
    });
  }
});
