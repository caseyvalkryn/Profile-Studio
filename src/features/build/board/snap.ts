// Snapping and the drag and ghost labels, legacy/js/45-tools.js (snap, snapBead, dragLabel,
// legText) one to one, plus PS.geo.tAtPoint and tAtRZ (20-geo.js). Pure: no store, no DOM.
// The scene is the legacy record (src/board/types Scene), so the legacy names stay (systems,
// volumes, planes). Units come from makeUnits(mode); legacy read a global.
import { archetypeById } from '../../../domain/catalog';
import { bearingTo, type TimedPoint } from '../../../engine/geo';
import type { Cam } from '../../../board/cameras';
import { makeUnits, fmtN } from '../../../board/format';
import { bounds as geoBounds, gridStep } from '../../../board/geo';
import type { SceneObjects } from '../../../board';
import type { Units } from '../../../state/ui';

export type PlanPt = { x: number; y: number; z?: number };
export type ElevPt = { r: number; z: number };
export type World = PlanPt | ElevPt;
export type Snapped = { x: number; y: number; label: string | null };
export type SnappedElev = { r: number; z: number; label: string | null };
export type Modifiers = { alt?: boolean; shift?: boolean; sx?: number; sy?: number };

export function isElev(w: World | null | undefined): w is ElevPt {
  return !!w && (w as PlanPt).x == null && (w as ElevPt).r != null;
}

const hyp = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const DEG = 180 / Math.PI;

/** Legacy snapStep: a fifth of the grid step for the scene extent. */
export function snapStep(ext: number): number {
  return gridStep(ext) / 5;
}

export function nearestOnSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy || 1;
  let f = ((px - ax) * dx + (py - ay) * dy) / L;
  f = Math.max(0, Math.min(1, f));
  const x = ax + dx * f;
  const y = ay + dy * f;
  return { x, y, f, d: hyp(px, py, x, y) };
}

/** Legacy PS.geo.tAtPoint: the time of the nearest point on the path in plan. */
export function tAtPoint(w: readonly TimedPoint[], x: number, y: number): number {
  if (!w || !w.length) return 0;
  if (w.length === 1) return w[0]!.t0;
  let best = { d: Infinity, t: 0 };
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i]!;
    const b = w[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy || 1;
    let f = ((x - a.x) * dx + (y - a.y) * dy) / L;
    f = Math.max(0, Math.min(1, f));
    const d = Math.hypot(a.x + dx * f - x, a.y + dy * f - y);
    if (d < best.d) best = { d, t: a.t1 + (b.t0 - a.t1) * f };
  }
  return best.t;
}

/** Legacy PS.geo.tAtRZ: nearest in (range from origin, height) space, legs sampled at 64 steps. */
export function tAtRZ(
  w: readonly TimedPoint[],
  r: number,
  z: number,
  origin: { x: number; y: number } | null | undefined,
): number {
  if (!w || !w.length) return 0;
  const o = origin || { x: 0, y: 0 };
  let best = { d: Infinity, t: w[0]!.t0 };
  const test = (p: { x: number; y: number; z: number }, t: number) => {
    const d = Math.hypot(Math.hypot(p.x - o.x, p.y - o.y) - r, p.z - z);
    if (d < best.d) best = { d, t };
  };
  test(w[0]!, w[0]!.t0);
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i]!;
    const b = w[i + 1]!;
    for (let k = 1; k <= 64; k++) {
      const f = k / 64;
      test(
        { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f },
        a.t1 + (b.t0 - a.t1) * f,
      );
    }
  }
  return best.t;
}

// ---------------------------------------------------------------- labels

/** Legacy vDual: the height with its twin, "328 ft AGL (100 m)". */
export function vDual(m: number, units: Units): string {
  const U = makeUnits(units);
  return U.mode === 'si'
    ? U.v(m, 'AGL') + ' (' + fmtN(m / U.FT, 0) + ' ft)'
    : U.v(m, 'AGL') + ' (' + fmtN(m, 0) + ' m)';
}

export type LabelValue = number | { r: number; brg: number } | string | null | undefined;

/** Legacy tools.dragLabel(role, obj, value). */
export function dragLabel(
  role: string,
  obj: { id?: string } | null | undefined,
  value: LabelValue,
  units: Units,
): string {
  const U = makeUnits(units);
  const id = obj && obj.id ? obj.id + ' ' : '';
  const n = typeof value === 'number' ? value : 0;
  switch (role) {
    case 'range':
      return id + U.hDual(n);
    case 'hold':
      return 'hold ' + Math.round(n) + ' s';
    case 'arcEnd0':
    case 'arcEnd1':
    case 'fov':
      return id + 'fov ' + Math.round(n) + '°';
    case 'arcMid':
    case 'bearing':
      return id + 'bearing ' + U.brg(n);
    case 'elRay0':
    case 'elMin':
      return id + 'elMin ' + Math.round(n) + '°';
    case 'elRay1':
    case 'elMax':
      return id + 'elMax ' + Math.round(n) + '°';
    case 'bead':
      return id + U.t(n);
    case 'top':
    case 'line':
    case 'z':
      return id + vDual(n, units);
    default:
      if (typeof value === 'number') return id + vDual(value, units);
      if (value && typeof value === 'object' && value.r != null)
        return id + U.h(value.r) + ' ' + U.brg(value.brg);
      return id + (value == null ? '' : String(value));
  }
}

/** Legacy cruiseHeight: the middle of the archetype's altitude band. */
export function cruiseHeight(arch: string | undefined): number {
  const a = arch ? archetypeById(arch) : undefined;
  const alt = a ? a.altM : [100, 100];
  return Math.round(((alt[0] ?? 100) + (alt[1] ?? 100)) / 2);
}

/** Legacy legText: "1.40 nm, 93 s" from the last placed point to `cur`. */
export function legText(
  placing: { kind: string; arch?: string; pts?: readonly (PlanPt | number[])[] } | null,
  cur: PlanPt | null | undefined,
  units: Units,
): string {
  if (!placing || placing.kind !== 'aircraft' || !placing.pts || !placing.pts.length || !cur)
    return '';
  const last = placing.pts[placing.pts.length - 1]!;
  const a = Array.isArray(last)
    ? { x: last[0]!, y: last[1]!, z: last[2] || 0 }
    : { x: last.x, y: last.y, z: last.z || 0 };
  const arch = placing.arch ? archetypeById(placing.arch) : undefined;
  const z = cruiseHeight(placing.arch);
  const len = Math.hypot(cur.x - a.x, cur.y - a.y, z - a.z);
  const spd = (arch && arch.cruiseMs) || 1;
  return makeUnits(units).h(len) + ', ' + Math.round(len / spd) + ' s';
}

// ---------------------------------------------------------------- snapping

export type SnapContext = {
  modifiers?: Modifiers;
  cam?: Cam | null;
  scene?: SceneObjects | null;
  /** Display id left out of the ring, vertex and edge search (the object being dragged). */
  exclude?: string | null;
  /** The previous waypoint for the Shift 15 degree bearing. */
  from?: PlanPt | null;
  ext?: number;
  units: Units;
};

/** Legacy tools.snap(world, context). Alt returns the point as it is. */
export function snap(world: PlanPt, context: SnapContext): Snapped;
export function snap(world: ElevPt, context: SnapContext): SnappedElev;
export function snap(world: World, context: SnapContext): Snapped | SnappedElev;
export function snap(world: World, context: SnapContext): Snapped | SnappedElev {
  const mods = context.modifiers || {};
  const cam = context.cam;
  const scale = (cam && cam.scale) || 1;
  const scene: SceneObjects = context.scene || {
    systems: [],
    volumes: [],
    planes: [],
    paths: [],
    aircraft: [],
  };
  const ex = context.exclude;

  if (isElev(world)) {
    if (mods.alt) return { r: world.r, z: world.z, label: null };
    let z = world.z;
    let label: string | null = null;
    let best = 6;
    const o = (cam && cam.origin) || { x: 0, y: 0 };
    for (const pl of scene.planes || []) {
      if (pl.id === ex || !cam) continue;
      const a = cam.project(o.x + world.r, o.y, world.z)[1];
      const b = cam.project(o.x + world.r, o.y, pl.z)[1];
      if (Math.abs(a - b) <= best) {
        best = Math.abs(a - b);
        z = pl.z;
        label = 'on ' + pl.id;
      }
    }
    if (label == null) z = Math.round(z / 5) * 5;
    return { r: world.r, z: Math.max(0, z), label };
  }
  if (mods.alt) return { x: world.x, y: world.y, label: null };

  // 1. sensor ring, 8 px
  let hit: Snapped | null = null;
  let hd = 8;
  for (const s of scene.systems || []) {
    if (s.id === ex || !(s.range > 0)) continue;
    const d = hyp(world.x, world.y, s.x, s.y);
    const px = Math.abs(d - s.range) * scale;
    if (d > 0 && px <= hd) {
      hd = px;
      hit = {
        x: s.x + ((world.x - s.x) * s.range) / d,
        y: s.y + ((world.y - s.y) * s.range) / d,
        label: 'on ' + s.id + ' ring',
      };
    }
  }
  if (hit) return hit;
  // 2. volume vertex, then edge, 8 px
  hd = 8;
  for (const v of scene.volumes || []) {
    if (v.id === ex) continue;
    for (const q of v.pts || []) {
      const px = hyp(world.x, world.y, q[0], q[1]) * scale;
      if (px <= hd) {
        hd = px;
        hit = { x: q[0], y: q[1], label: 'on ' + v.id + ' vertex' };
      }
    }
  }
  if (hit) return hit;
  hd = 8;
  for (const v of scene.volumes || []) {
    if (v.id === ex) continue;
    const p = v.pts || [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i]!;
      const b = p[(i + 1) % p.length]!;
      const n = nearestOnSeg(world.x, world.y, a[0], a[1], b[0], b[1]);
      if (n.d * scale <= hd) {
        hd = n.d * scale;
        hit = { x: n.x, y: n.y, label: 'on ' + v.id + ' edge' };
      }
    }
  }
  if (hit) return hit;
  // angle with Shift: 15 degree steps from the previous waypoint
  if (mods.shift && context.from) {
    const f = context.from;
    const dist = hyp(world.x, world.y, f.x, f.y);
    const ang = Math.round(bearingTo(f, world) / 15) * 15;
    return {
      x: f.x + dist * Math.sin(ang / DEG),
      y: f.y + dist * Math.cos(ang / DEG),
      label: makeUnits(context.units).brg(ang),
    };
  }
  // grid
  const step = snapStep(context.ext || geoBounds(scene).ext);
  return { x: Math.round(world.x / step) * step, y: Math.round(world.y / step) * step, label: null };
}

export type Crossing = { t: number; system: string; kind: 'in' | 'out' };
export type BeadSnap = { t: number; system?: string; label?: string };

/** Legacy tools.snapBead: a bead within 3 s of a coverage crossing snaps to it. */
export function snapBead(
  pathId: string,
  t: number,
  derived: { crossings?: Record<string, readonly Crossing[]> } | null | undefined,
): BeadSnap {
  const cr = (derived && derived.crossings && derived.crossings[pathId]) || [];
  let best: Crossing | null = null;
  let bd = 3;
  for (const c of cr) {
    const d = Math.abs(c.t - t);
    if (d <= bd) {
      bd = d;
      best = c;
    }
  }
  if (!best) return { t };
  return {
    t: best.t,
    system: best.system,
    label:
      best.system +
      (best.kind === 'out' ? ' last see, ' : ' first see, ') +
      't+' +
      Math.round(best.t) +
      ' s',
  };
}
