// Three cameras, legacy 40-cameras.js one to one: plan, elev, axon. The port is literal, so the
// legacy names stay (elev is the Elevation view, axon the 3D view). Each setup(scene, derived,
// size, view, opts) returns a cam. Every camera applies the viewer transform after its base
// mapping: sx = base_x * zoom + px, sy = base_y * zoom + py.
//
// Added to legacy: the elevation camera has two modes. From asset is the legacy reading (range
// from the reference). Along path puts along-track distance of one path on x, with the math of
// src/features/build/profile/along.ts copied below (not imported: src/board stays pure).
import type { Pt3, TimedPoint } from '../engine/geo';
import type { ElevationMode, View } from '../state/ui';
import { bounds as geoBounds, gridStep, type Bounds } from './geo';
import { clamp, r1 } from './svg';
import type { CamKind, DerivedView, SceneObjects, Size } from './types';

const D2R = Math.PI / 180;

/** The MVP view names to the legacy camera kinds, and back. */
export const VIEW_TO_CAM: Record<View, CamKind> = { plan: 'plan', elevation: 'elev', '3d': 'axon' };
export const CAM_TO_VIEW: Record<CamKind, View> = { plan: 'plan', elev: 'elevation', axon: '3d' };

export type CamView = {
  yaw?: number;
  pitch?: number;
  ref?: string;
  bounds?: Bounds;
  zoom?: number;
  px?: number;
  py?: number;
  /** Elevation only: 'fromAsset' (legacy, default) or 'alongPath'. */
  elevationMode?: ElevationMode;
  /** Elevation along path: the path display id; the first path when absent. */
  path?: string | null;
};

export type Tick = { v: number; px: number | null };

export type Cam = {
  kind: CamKind;
  W: number;
  H: number;
  scale: number;
  zoom: number;
  frame: { x0: number; y0: number; x1: number; y1: number };
  project(x: number, y: number, z?: number): [number, number];
  unproject(sx: number, sy: number): { x: number; y: number } | { r: number; z: number } | null;
  axes: { xTicks: Tick[]; yTicks: Tick[]; xLabel: string; yLabel: string };
  preserveAspectRatio: string;
  hint: string | null;
  north: number;
  origin: Pt3;
  bounds?: Bounds;
  // elevation
  scaleZ?: number;
  maxR?: number;
  maxZ?: number;
  projectRZ?(r: number, z: number): [number, number];
  mode?: ElevationMode;
  path?: string | null;
  /** Along path: along-track distance and height at t on the path. */
  alongAt?(t: number): { s: number; z: number };
  // axonometric
  zx?: number;
  yaw?: number;
  pitch?: number;
};

export type CamSetup = (
  scene: SceneObjects,
  derived: DerivedView,
  size: Size,
  view?: CamView | null,
  opts?: { thumb?: boolean },
) => Cam;

function viewer(view?: CamView | null) {
  const z = view && typeof view.zoom === 'number' && view.zoom > 0 ? view.zoom : 1;
  return { zoom: z, px: (view && view.px) || 0, py: (view && view.py) || 0 };
}

function boundsOf(scene: SceneObjects, view?: CamView | null): Bounds {
  if (view && view.bounds) return view.bounds;
  return geoBounds(scene);
}

function originOf(derived: DerivedView | null | undefined, ref?: string): Pt3 {
  if (derived && typeof derived.originAt === 'function')
    return derived.originAt(ref || 'asset', null, null);
  return (derived && derived.origin) || { x: 0, y: 0, z: 0 };
}

function allPts(scene: SceneObjects) {
  const out: { x: number; y: number; z: number }[] = [];
  for (const p of (scene && scene.paths) || []) for (const q of p.pts || []) out.push(q);
  return out;
}

function maxZOf(scene: SceneObjects): number {
  let m = 0;
  for (const q of allPts(scene)) m = Math.max(m, q.z || 0);
  for (const v of (scene && scene.volumes) || []) m = Math.max(m, v.zmax || 0);
  for (const p of (scene && scene.planes) || []) m = Math.max(m, p.z || 0);
  return m;
}

// ---------------------------------------------------------------- along path (copied from along.ts)

/** Cumulative horizontal distance in metres at each waypoint. */
export function cumulative(w: readonly TimedPoint[]): number[] {
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < w.length; i++) {
    if (i > 0) s += Math.hypot(w[i]!.x - w[i - 1]!.x, w[i]!.y - w[i - 1]!.y);
    out.push(s);
  }
  return out;
}

/** Along-track distance and altitude at time `t`, clamped to the path. */
export function alongAt(
  w: readonly TimedPoint[],
  cum: readonly number[],
  t: number,
): { s: number; z: number } {
  const n = w.length;
  if (n === 0) return { s: 0, z: 0 };
  if (t <= w[0]!.t1) return { s: 0, z: w[0]!.z };
  for (let i = 1; i < n; i++) {
    const a = w[i - 1]!;
    const b = w[i]!;
    if (t <= b.t0) {
      const span = b.t0 - a.t1;
      const f = span > 0 ? (t - a.t1) / span : 1;
      return { s: cum[i - 1]! + f * (cum[i]! - cum[i - 1]!), z: a.z + f * (b.z - a.z) };
    }
    if (t <= b.t1) return { s: cum[i]!, z: b.z };
  }
  return { s: cum[n - 1]!, z: w[n - 1]!.z };
}

/** Along-track distance of the point on the path nearest (x, y) in plan. */
export function nearestAlong(
  w: readonly TimedPoint[],
  cum: readonly number[],
  x: number,
  y: number,
): number {
  if (w.length < 2) return 0;
  let best = Infinity;
  let s = 0;
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i]!;
    const b = w[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const f = L > 0 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / L, 0, 1) : 0;
    const d = Math.hypot(a.x + f * dx - x, a.y + f * dy - y);
    if (d < best) {
      best = d;
      s = cum[i]! + f * (cum[i + 1]! - cum[i]!);
    }
  }
  return s;
}

// ---------------------------------------------------------------- plan

const plan: { kind: 'plan'; setup: CamSetup } = {
  kind: 'plan',
  setup(scene, derived, size, view, opts) {
    const W = size.W;
    const H = size.H;
    const m = opts?.thumb ? 8 : 28;
    const b = boundsOf(scene, view);
    const { cx, cy, ext } = b;
    const k = (Math.min(W, H) - 2 * m) / ext;
    const ox = (W - ext * k) / 2;
    const oy = (H - ext * k) / 2;
    const v = viewer(view);
    const project = (x: number, y: number): [number, number] => {
      const bx = ox + (x - cx + ext / 2) * k;
      const by = H - oy - (y - cy + ext / 2) * k;
      return [bx * v.zoom + v.px, by * v.zoom + v.py];
    };
    const unproject = (sx: number, sy: number) => {
      const bx = (sx - v.px) / v.zoom;
      const by = (sy - v.py) / v.zoom;
      return { x: (bx - ox) / k + cx - ext / 2, y: cy - ext / 2 + (H - oy - by) / k };
    };
    const st = gridStep(ext);
    const xTicks: Tick[] = [];
    const yTicks: Tick[] = [];
    for (let g = Math.ceil((cx - ext / 2) / st) * st; g <= cx + ext / 2; g += st)
      xTicks.push({ v: g, px: r1(project(g, cy)[0]) });
    for (let g = Math.ceil((cy - ext / 2) / st) * st; g <= cy + ext / 2; g += st)
      yTicks.push({ v: g, px: r1(project(cx, g)[1]) });
    const a = project(cx - ext / 2, cy + ext / 2);
    const c = project(cx + ext / 2, cy - ext / 2);
    return {
      kind: 'plan',
      W,
      H,
      scale: k * v.zoom,
      zoom: v.zoom,
      bounds: { cx, cy, ext },
      frame: { x0: a[0], y0: a[1], x1: c[0], y1: c[1] },
      project,
      unproject,
      axes: { xTicks, yTicks, xLabel: 'East', yLabel: 'North' },
      preserveAspectRatio: 'xMidYMid meet',
      hint: null,
      north: 0,
      origin: originOf(derived, view?.ref),
    };
  },
};

// ---------------------------------------------------------------- elevation

function refName(scene: SceneObjects, ref?: string): string {
  const sys = ((scene && scene.systems) || []).filter((s) => s.id === ref)[0];
  return sys ? sys.id : 'asset';
}

const elev: { kind: 'elev'; setup: CamSetup } = {
  kind: 'elev',
  setup(scene, derived, size, view, opts) {
    const W = size.W;
    const H = size.H;
    const th = !!opts?.thumb;
    const ml = th ? 8 : 52;
    const mr = th ? 8 : 20;
    const mt = th ? 8 : 24;
    const mb = th ? 8 : 36;
    const o = originOf(derived, view?.ref);
    // Along path: x is along-track distance on one path
    const paths = (scene && scene.paths) || [];
    const along = view?.elevationMode === 'alongPath';
    const pid = along ? (view?.path ?? (paths[0] ? paths[0].id : null)) : null;
    const w = (pid != null && derived && derived.timed && derived.timed[pid]) || [];
    const cum = along ? cumulative(w) : [];
    let maxR = 0;
    let maxZ = 0;
    if (along) {
      maxR = cum.length ? cum[cum.length - 1]! : 0;
      for (const q of allPts(scene)) maxZ = Math.max(maxZ, q.z || 0);
      for (const s of (scene && scene.systems) || []) maxZ = Math.max(maxZ, s.z || 0);
    } else {
      for (const q of allPts(scene)) {
        maxR = Math.max(maxR, Math.hypot(q.x - o.x, q.y - o.y));
        maxZ = Math.max(maxZ, q.z || 0);
      }
      for (const s of (scene && scene.systems) || []) {
        maxR = Math.max(maxR, s.range || 0);
        maxZ = Math.max(maxZ, s.z || 0);
      }
    }
    for (const vv of (scene && scene.volumes) || []) maxZ = Math.max(maxZ, vv.zmax || 0);
    for (const p of (scene && scene.planes) || []) maxZ = Math.max(maxZ, p.z || 0);
    maxR = Math.max(1.05 * maxR, 1000);
    maxZ = Math.max(1.3 * maxZ, 150);
    const v = viewer(view);
    const kx = (W - ml - mr) / maxR;
    const kz = (H - mt - mb) / maxZ;
    const projectRZ = (r: number, z: number): [number, number] => [
      (ml + r * kx) * v.zoom + v.px,
      (H - mb - z * kz) * v.zoom + v.py,
    ];
    const project = along
      ? (x: number, y: number, z?: number) => projectRZ(nearestAlong(w, cum, x, y), z || 0)
      : (x: number, y: number, z?: number) => projectRZ(Math.hypot(x - o.x, y - o.y), z || 0);
    const unproject = (sx: number, sy: number) => {
      const bx = (sx - v.px) / v.zoom;
      const by = (sy - v.py) / v.zoom;
      return { r: (bx - ml) / kx, z: (H - mb - by) / kz };
    };
    const rs = gridStep(maxR);
    const zs = maxZ > 1500 ? 500 : maxZ > 500 ? 200 : 50;
    const xTicks: Tick[] = [];
    const yTicks: Tick[] = [];
    for (let g = 0; g <= maxR; g += rs) xTicks.push({ v: g, px: r1(projectRZ(g, 0)[0]) });
    for (let g = 0; g <= maxZ; g += zs) yTicks.push({ v: g, px: r1(projectRZ(0, g)[1]) });
    const a = projectRZ(0, maxZ);
    const c = projectRZ(maxR, 0);
    return {
      kind: 'elev',
      W,
      H,
      scale: kx * v.zoom,
      scaleZ: kz * v.zoom,
      zoom: v.zoom,
      maxR,
      maxZ,
      frame: { x0: a[0], y0: a[1], x1: c[0], y1: c[1] },
      project,
      projectRZ,
      unproject,
      axes: {
        xTicks,
        yTicks,
        xLabel: along ? 'Along ' + (pid ?? 'path') : 'Range from ' + refName(scene, view?.ref),
        yLabel: 'Height',
      },
      preserveAspectRatio: 'none',
      hint: null,
      north: 0,
      origin: o,
      mode: along ? 'alongPath' : 'fromAsset',
      path: pid,
      alongAt: (t: number) => alongAt(w, cum, t),
    };
  },
};

// ---------------------------------------------------------------- axonometric

/** The axon hint, spacing as 40-cameras.js:172 (two spaces between parts). */
export function axonHint(zx: number, yawD: number, pitchD: number): string {
  return 'vertical x' + zx + '  yaw ' + Math.round(yawD) + '°  pitch ' + Math.round(pitchD) + '°';
}

const axon: {
  kind: 'axon';
  setup: CamSetup;
  rotate(yaw: number, pitch: number, dxPx: number, dyPx: number): { yaw: number; pitch: number };
} = {
  kind: 'axon',
  setup(scene, derived, size, view, opts) {
    const W = size.W;
    const H = size.H;
    const m = opts?.thumb ? 8 : 20;
    const b = boundsOf(scene, view);
    const { cx, cy, ext } = b;
    const maxZ = Math.max(1, maxZOf(scene));
    const zx = Math.max(1, Math.round((0.14 * ext) / maxZ));
    const yawD = view && typeof view.yaw === 'number' ? view.yaw : -35;
    const pitchD = view && typeof view.pitch === 'number' ? view.pitch : 55;
    const yaw = yawD * D2R;
    const pitch = pitchD * D2R;
    const cyw = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const pr = (x: number, y: number, z: number): [number, number] => {
      const dx = x - cx;
      const dy = y - cy;
      return [dx * cyw - dy * syw, (dx * syw + dy * cyw) * sp + (z || 0) * zx * cp];
    };
    const cs = (
      [
        [cx - ext / 2, cy - ext / 2, 0],
        [cx + ext / 2, cy - ext / 2, 0],
        [cx + ext / 2, cy + ext / 2, 0],
        [cx - ext / 2, cy + ext / 2, 0],
        [cx, cy, maxZ],
      ] as const
    ).map((q) => pr(q[0], q[1], q[2]));
    const xs = cs.map((q) => q[0]);
    const ys = cs.map((q) => q[1]);
    const xspan = Math.max(1e-9, Math.max(...xs) - Math.min(...xs));
    const yspan = Math.max(1e-9, Math.max(...ys) - Math.min(...ys));
    const k = Math.min((W - 2 * m) / xspan, (H - 2 * m) / yspan);
    const ox = (Math.max(...xs) + Math.min(...xs)) / 2;
    const oy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const v = viewer(view);
    const project = (x: number, y: number, z?: number): [number, number] => {
      const q = pr(x, y, z || 0);
      return [(W / 2 + (q[0] - ox) * k) * v.zoom + v.px, (H / 2 - (q[1] - oy) * k) * v.zoom + v.py];
    };
    // screen direction of north: the ground vector (0, 1, 0)
    const nx = -syw;
    const ny = -(cyw * sp);
    const north = Math.atan2(nx, -ny) / D2R;
    const st = gridStep(ext);
    const xTicks: Tick[] = [];
    const yTicks: Tick[] = [];
    for (let g = Math.ceil((cx - ext / 2) / st) * st; g <= cx + ext / 2; g += st)
      xTicks.push({ v: g, px: null });
    for (let g = Math.ceil((cy - ext / 2) / st) * st; g <= cy + ext / 2; g += st)
      yTicks.push({ v: g, px: null });
    return {
      kind: 'axon',
      W,
      H,
      scale: k * v.zoom,
      zoom: v.zoom,
      zx,
      yaw: yawD,
      pitch: pitchD,
      bounds: { cx, cy, ext },
      frame: { x0: m, y0: m, x1: W - m, y1: H - m },
      project,
      unproject: () => null,
      axes: { xTicks, yTicks, xLabel: 'East', yLabel: 'North' },
      preserveAspectRatio: 'xMidYMid meet',
      hint: axonHint(zx, yawD, pitchD),
      north,
      origin: originOf(derived, view?.ref),
    };
  },
  // drag rotation (contract 12): yaw += dx * 0.45, pitch = clamp(pitch + dy * 0.35, 8, 86)
  rotate(yaw, pitch, dxPx, dyPx) {
    return { yaw: yaw + dxPx * 0.45, pitch: clamp(pitch + dyPx * 0.35, 8, 86) };
  },
};

/** "x,y x,y" point list through cam.project; pts are {x,y,z} or [x,y(,z)] */
export function poly(
  cam: Cam,
  pts: readonly (readonly number[] | { x: number; y: number; z?: number })[],
): string {
  return pts
    .map((q) => {
      const s = Array.isArray(q)
        ? cam.project(q[0]!, q[1]!, q[2] || 0)
        : cam.project((q as Pt3).x, (q as Pt3).y, (q as Pt3).z || 0);
      return r1(s[0]) + ',' + r1(s[1]);
    })
    .join(' ');
}

export const cameras = {
  plan,
  elev,
  axon,
  get(kind: string | null | undefined) {
    return kind === 'elev' ? elev : kind === 'axon' ? axon : plan;
  },
  poly,
  r1,
};
