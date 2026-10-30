import { describe, expect, it } from 'vitest';
import {
  bearingDeg,
  directApproach,
  hoverAndStare,
  multiAxisSalvo,
  orbit,
  polar,
  racetrack,
  split,
  terminalDive,
  terrainFollowingIngress,
} from './behaviors';

const O = { x: 0, y: 0 };
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('behaviors', () => {
  it('polar and bearingDeg agree, clockwise from north', () => {
    const p = polar(O, 90, 100);
    near(p.x, 100);
    near(p.y, 0);
    near(bearingDeg(O, p), 90);
    near(bearingDeg(O, { x: -1, y: -1 }), 225);
  });

  it('directApproach is two waypoints at one altitude with no hold', () => {
    const w = directApproach({ x: 3000, y: 3000 }, O, 120);
    expect(w).toHaveLength(2);
    expect(w.map((p) => p.z)).toEqual([120, 120]);
    expect(w.map((p) => p.holdS)).toEqual([0, 0]);
    expect(w[0]!.key).not.toBe(w[1]!.key);
  });

  it('terrainFollowingIngress is low, low, pop-up, terminal', () => {
    const w = terrainFollowingIngress({ x: 0, y: 10000 }, O, 100, 300, 2400, 20);
    expect(w.map((p) => p.z)).toEqual([100, 100, 300, 20]);
    near(w[2]!.y, 2400);
    near(w[1]!.y, 3600);
  });

  it('orbit has turns * segments + 1 points on the radius and closes', () => {
    const w = orbit({ x: 1000, y: 1000 }, 120, 120, 1);
    expect(w).toHaveLength(13);
    for (const p of w) near(Math.hypot(p.x - 1000, p.y - 1000), 120, 1e-6);
    near(w[0]!.x, w[12]!.x);
    near(w[0]!.y, w[12]!.y);
    expect(orbit(O, 100, 50, 2)).toHaveLength(25);
  });

  it('racetrack has laps * 8 + 1 points inside the box', () => {
    const w = racetrack({ x: 1900, y: 0 }, 2400, 1600, 300, 1);
    expect(w).toHaveLength(9);
    for (const p of w) {
      expect(p.x).toBeGreaterThanOrEqual(700 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(3100 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(800 + 1e-9);
      expect(p.z).toBe(300);
    }
    expect(racetrack(O, 1000, 400, 100, 3)).toHaveLength(25);
  });

  it('hoverAndStare is one waypoint carrying the hold', () => {
    const w = hoverAndStare({ x: 5, y: 6 }, 120, 60);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ x: 5, y: 6, z: 120, holdS: 60 });
  });

  it('terminalDive holds cruise altitude to the dive start, then the impact altitude', () => {
    const w = terminalDive({ x: 0, y: 9000 }, O, 2400, 300);
    expect(w.map((p) => p.z)).toEqual([300, 300, 20]);
    near(w[1]!.y, 2400);
  });

  it('split makes n paths from one, fanned across track about the group path', () => {
    const group = directApproach({ x: 0, y: 4000 }, O, 100);
    const paths = split(group, 0.25, 3, 200);
    expect(paths).toHaveLength(3);
    for (const p of paths) {
      expect(p).toHaveLength(3);
      expect(p[0]).toMatchObject({ x: 0, y: 4000 });
      near(p[1]!.y, 3000); // the split point
    }
    expect(paths.map((p) => p[2]!.x).sort((a, b) => a - b)).toEqual([-200, 0, 200]);
    const keys = paths.flat().map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('multiAxisSalvo spreads n approaches evenly about the target', () => {
    const paths = multiAxisSalvo(O, 4, 5000, 150);
    expect(paths).toHaveLength(4);
    const bearings = paths.map((p) => Math.round(bearingDeg(O, p[0]!)) % 360);
    expect(bearings).toEqual([0, 90, 180, 270]);
    for (const p of paths) {
      near(Math.hypot(p[0]!.x, p[0]!.y), 5000, 1e-6);
      expect(p[1]).toMatchObject({ x: 0, y: 0, z: 150 });
    }
    const custom = multiAxisSalvo(O, 2, 1000, 100, [45, 225]);
    expect(custom.map((p) => Math.round(bearingDeg(O, p[0]!)))).toEqual([45, 225]);
  });
});
