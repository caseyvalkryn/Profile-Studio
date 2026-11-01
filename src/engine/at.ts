// The readout at time t (spec section 6 item 5), ported from legacy/js/21-derive.js `attachFns`.
// The bundle keeps the legacy field names the readout, drag labels and caption tokens read.

import { bearingTo, closingSpeed, pointInPolygon, posAt } from './geo';
import type { Pt3, TimedPoint } from './geo';
import type { Derived, WindowSummary } from './derived';

/** `window` is the threat's window summary; `covering` lists the system ids that hold it at t. */
export type Readout = {
  x: number;
  y: number;
  z: number;
  /** Horizontal range from the reference origin, metres. */
  r: number;
  /** Bearing from the origin to the threat, degrees. */
  brg: number;
  /** Heading, degrees; null while holding or stopped. */
  hdg: number | null;
  /** Ground speed, m/s. */
  spd: number;
  /** Closing speed toward the origin, m/s. */
  vc: number;
  /** Seconds to the defended asset; null when the path never enters it. */
  tta: number | null;
  window: WindowSummary | null;
  margin: number | null;
  covering: string[];
};

/** The reference a range is measured from: 'asset' (the origin), 'asset-edge', or a system id or key. */
export type RangeRef = string;

/** Nearest point on a closed polygon ring to (x, y) (legacy `nearestOnPolyline`, closed). */
export function nearestOnPolygon(
  pts: readonly (readonly [number, number])[],
  x: number,
  y: number,
): { x: number; y: number; d: number } {
  let best = { d: Infinity, x: pts.length ? pts[0]![0] : x, y: pts.length ? pts[0]![1] : y };
  if (pts.length === 1) return { ...best, d: Math.hypot(x - best.x, y - best.y) };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    let f = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0;
    f = Math.max(0, Math.min(1, f));
    const px = a[0] + dx * f;
    const py = a[1] + dy * f;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { d, x: px, y: py };
  }
  return best;
}

/** What `originAt` and the readout need from the derived object. */
export type ReadoutContext = {
  timed: Readonly<Record<string, readonly TimedPoint[]>>;
  origin: Pt3;
  assetPts: readonly (readonly [number, number])[] | null;
  systemAt: (ref: string) => Pt3 | null;
  windows: Readonly<
    Record<string, Readonly<Record<string, readonly { tIn: number; tOut: number }[]>>>
  >;
  systemIds: readonly string[];
  threatIds: readonly string[];
  daEntry: Readonly<Record<string, number | null>>;
  window: Readonly<Record<string, WindowSummary>>;
};

export function originAt(
  c: ReadoutContext,
  ref: string | null | undefined,
  threatId: string | null,
  t: number | null,
): Pt3 {
  const s = ref ? c.systemAt(ref) : null;
  if (s) return { x: s.x, y: s.y, z: s.z };
  const w = threatId != null ? c.timed[threatId] : undefined;
  if (ref === 'asset-edge' && c.assetPts && w && w.length && t != null) {
    const p = posAt(w, t);
    if (pointInPolygon(p, c.assetPts)) return { x: p.x, y: p.y, z: 0 };
    const n = nearestOnPolygon(c.assetPts, p.x, p.y);
    return { x: n.x, y: n.y, z: 0 };
  }
  return { x: c.origin.x, y: c.origin.y, z: c.origin.z };
}

export function closing(
  c: ReadoutContext,
  threatId: string,
  t: number | null,
  ref?: string | null,
): number {
  const w = c.timed[threatId];
  if (!w || !w.length || t == null) return 0;
  return closingSpeed(w, t, ref == null ? c.origin : originAt(c, ref, threatId, t));
}

export function tta(c: ReadoutContext, threatId: string, t: number | null): number | null {
  const tDA = c.daEntry[threatId];
  if (tDA == null) return null;
  const tt = t ?? 0;
  const w = c.timed[threatId];
  if (c.assetPts && w && pointInPolygon(posAt(w, tt), c.assetPts) && tt >= tDA) return 0;
  return tDA > tt ? tDA - tt : 0;
}

function contains(ws: readonly { tIn: number; tOut: number }[] | undefined, t: number): boolean {
  return (ws ?? []).some((w) => t >= w.tIn && t <= w.tOut);
}

export function coveringAt(c: ReadoutContext, threatId: string, t: number | null): string[] {
  if (t == null) return [];
  return c.systemIds.filter((s) => contains(c.windows[s]?.[threatId], t));
}

export function holdsAt(c: ReadoutContext, systemId: string, t: number | null): string[] {
  if (t == null || !c.windows[systemId]) return [];
  return c.threatIds.filter((p) => contains(c.windows[systemId]![p], t));
}

export function readoutAt(
  c: ReadoutContext,
  threatId: string,
  t: number | null,
  ref?: string | null,
): Readout | null {
  const w = c.timed[threatId];
  if (!w || !w.length) return null;
  const tt = t ?? 0;
  const p = posAt(w, tt);
  const o = originAt(c, ref ?? 'asset', threatId, tt);
  const moving = p.vx || p.vy;
  const win = c.window[threatId] ?? null;
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    r: Math.hypot(p.x - o.x, p.y - o.y),
    brg: bearingTo(o, p),
    hdg: moving ? bearingTo({ x: 0, y: 0 }, { x: p.vx, y: p.vy }) : null,
    spd: Math.hypot(p.vx, p.vy),
    vc: closing(c, threatId, tt, ref ?? 'asset'),
    tta: tta(c, threatId, tt),
    window: win,
    margin: win ? win.margin : null,
    covering: coveringAt(c, threatId, tt),
  };
}

/** Spec 6.5 entry: the readout of one threat at t from a derived object. */
export function at(
  d: Derived,
  threatId: string,
  tS: number | null,
  ref?: string | null,
): Readout | null {
  return d.at(threatId, tS, ref);
}
