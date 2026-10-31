// Legacy PS.geo helpers the board needs (20-geo.js), one to one: bounds, gridStep, segmentPoint,
// formationPoints. posAt and bearingTo come from src/engine/geo, which matches legacy.
import type { Pt3 } from '../engine/geo';
import type { SceneObjects } from './types';

export type Bounds = { cx: number; cy: number; ext: number };

type BoundsInput = {
  paths?: readonly { pts?: readonly { x: number; y: number }[] }[];
  systems?: readonly { x: number; y: number; range?: number }[];
  volumes?: readonly { pts?: readonly (readonly [number, number])[] }[];
};

export function bounds(scene: BoundsInput | SceneObjects | null | undefined): Bounds {
  let xs: number[] = [];
  let ys: number[] = [];
  const s: BoundsInput = scene || {};
  for (const p of s.paths || [])
    for (const q of p.pts || []) {
      xs.push(q.x);
      ys.push(q.y);
    }
  for (const b of s.systems || []) {
    const r = b.range || 0;
    xs.push(b.x - r, b.x + r);
    ys.push(b.y - r, b.y + r);
  }
  for (const v of s.volumes || [])
    for (const q of v.pts || []) {
      xs.push(q[0]);
      ys.push(q[1]);
    }
  if (!xs.length) {
    xs = [-2000, 2000];
    ys = [-2000, 2000];
  }
  const a = Math.min(...xs);
  const b2 = Math.max(...xs);
  const c = Math.min(...ys);
  const d = Math.max(...ys);
  return { cx: (a + b2) / 2, cy: (c + d) / 2, ext: Math.max(b2 - a, d - c, 1000) * 1.1 };
}

export function gridStep(ext: number): number {
  return ext > 24000 ? 5000 : ext > 12000 ? 2000 : ext > 4000 ? 1000 : 500;
}

export function segmentPoint(
  w: readonly { x: number; y: number; z?: number }[],
  i: number,
  f: number,
): Pt3 {
  const a = w[i]!;
  const b = w[i + 1] || a;
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * f,
  };
}

export type FormationPt = { x: number; y: number; z: number; hold: number };

export function formationPoints(
  pts: readonly { x: number; y: number; z?: number; hold?: number }[] | null | undefined,
  n: number,
  spacing: number,
): FormationPt[][] {
  if (!pts || pts.length < 2 || !(n > 1)) return [];
  const a = pts[0]!;
  const b = pts[1]!;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / L;
  const ny = (b.x - a.x) / L;
  const out: FormationPt[][] = [];
  for (let k = 1; k <= n - 1; k++) {
    const off = spacing * Math.ceil(k / 2) * (k % 2 ? 1 : -1);
    out.push(
      pts.map((q) => ({
        x: Math.round(q.x + nx * off),
        y: Math.round(q.y + ny * off),
        z: (q.z || 0) + ((k % 3) - 1) * 5,
        hold: q.hold || 0,
      })),
    );
  }
  return out;
}
