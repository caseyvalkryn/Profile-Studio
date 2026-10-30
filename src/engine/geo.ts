// Pure geometry and timing, ported from legacy/js/20-geo.js. Metres, seconds, metres per second.
// x is east, y is north, z is height above ground. Bearings are degrees clockwise from north.
// The numeric behaviour matches the legacy app so that fixtures/legacy-derive/ parity holds.

export type Pt3 = { x: number; y: number; z: number };
export type Pt2 = { x: number; y: number };

/** A waypoint with its arrival time `t0` and departure time `t1` (`t1 - t0` is the hold). */
export type TimedPoint = Pt3 & { t0: number; t1: number };

/** Position and motion at one instant. `hx, hy` is the unit heading, `leg` the current leg index. */
export type Pose = Pt3 & {
  hx: number;
  hy: number;
  vx: number;
  vy: number;
  vz: number;
  leg: number;
  holding: boolean;
};

const DEG = 180 / Math.PI;
const UNIT_H = { hx: 1, hy: 0 };
const V0 = { vx: 0, vy: 0, vz: 0 };
const ORIGIN: Pt3 = { x: 0, y: 0, z: 0 };

// ---------------------------------------------------------------- timing

/** Leg time is 3D length over speed. A hold extends `t1` at that point. Speed defaults to 15 m/s. */
export function timed(
  pts: readonly { x: number; y: number; z: number; holdS?: number }[],
  speedMs: number,
): TimedPoint[] {
  const v = speedMs > 0 ? speedMs : 15;
  let t = 0;
  const out: TimedPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i]!;
    if (i > 0) {
      const a = pts[i - 1]!;
      t += Math.hypot(q.x - a.x, q.y - a.y, q.z - a.z) / v;
    }
    const h = q.holdS ?? 0;
    out.push({ x: q.x, y: q.y, z: q.z, t0: t, t1: t + h });
    t += h;
  }
  return out;
}

export function endOf(w: readonly TimedPoint[]): number {
  return w.length ? w[w.length - 1]!.t1 : 0;
}

/** Latest path end across all paths, floor 60 s. */
export function tmax(list: readonly (readonly TimedPoint[])[]): number {
  let m = 0;
  for (const w of list) if (w.length) m = Math.max(m, endOf(w));
  return Math.max(m, 60);
}

function heading(a: Pt2, b: Pt2): { hx: number; hy: number } {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  return L ? { hx: (b.x - a.x) / L, hy: (b.y - a.y) / L } : UNIT_H;
}

function legVel(a: TimedPoint, b: TimedPoint): { vx: number; vy: number; vz: number } {
  const dt = b.t0 - a.t1;
  if (!(dt > 0)) return V0;
  return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt, vz: (b.z - a.z) / dt };
}

function pose(
  p: Pt3,
  h: { hx: number; hy: number },
  v: { vx: number; vy: number; vz: number },
  leg: number,
  holding: boolean,
): Pose {
  return { x: p.x, y: p.y, z: p.z, hx: h.hx, hy: h.hy, vx: v.vx, vy: v.vy, vz: v.vz, leg, holding };
}

/** Position, heading and velocity at time `t`. Clamped to the path start and end. */
export function posAt(w: readonly TimedPoint[], t: number): Pose {
  const n = w.length;
  if (n === 0) return pose(ORIGIN, UNIT_H, V0, 0, false);
  if (n === 1) {
    const only = w[0]!;
    return pose(only, UNIT_H, V0, 0, only.t1 > only.t0 && t >= only.t0 && t <= only.t1);
  }
  if (t < w[0]!.t0) t = w[0]!.t0;
  for (let i = 0; i < n; i++) {
    const a = w[i]!;
    const b = w[i + 1];
    if (t <= a.t1) {
      const hold = a.t1 > a.t0;
      if (!b) return pose(a, heading(w[i - 1]!, a), V0, i - 1, hold && t >= a.t0);
      return pose(a, heading(a, b), hold ? V0 : legVel(a, b), i, hold);
    }
    if (!b) return pose(a, heading(w[i - 1]!, a), V0, i - 1, false);
    if (t <= b.t0) {
      const f = (t - a.t1) / Math.max(1e-9, b.t0 - a.t1);
      return pose(
        { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f },
        heading(a, b),
        legVel(a, b),
        i,
        false,
      );
    }
  }
  const e = w[n - 1]!;
  return pose(e, heading(w[n - 2]!, e), V0, n - 2, false);
}

export function pathLength(w: readonly Pt3[]): number {
  let L = 0;
  for (let i = 1; i < w.length; i++) L += dist3(w[i - 1]!, w[i]!);
  return L;
}

// ---------------------------------------------------------------- ranges and angles

export function dist3(a: Pt3, b: Pt3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function horizontalRange(a: Pt2, b: Pt2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function slantRange(s: Pt3, p: Pt3): number {
  return Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z);
}

/** Bearing from `from` to `to`, degrees clockwise from north in [0, 360). */
export function bearingTo(from: Pt2, to: Pt2): number {
  return (((90 - Math.atan2(to.y - from.y, to.x - from.x) * DEG) % 360) + 360) % 360;
}

/** Smallest angle between two bearings, in [0, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Elevation angle from `s` to `p` in degrees, positive upward. */
export function elevAngle(s: Pt3, p: Pt3): number {
  return Math.atan2(p.z - s.z, Math.hypot(p.x - s.x, p.y - s.y)) * DEG;
}

/** Horizontal range from `o` to the path position at `t`. */
export function rangeAt(w: readonly TimedPoint[], t: number, o: Pt2): number {
  const p = posAt(w, t);
  return Math.hypot(p.x - o.x, p.y - o.y);
}

/** Closing speed toward `o` at `t`: the negative radial velocity. Motion away is negative. */
export function closingSpeed(w: readonly TimedPoint[], t: number, o: Pt2): number {
  const p = posAt(w, t);
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  const r = Math.hypot(dx, dy);
  if (!r) return 0;
  return -(dx * p.vx + dy * p.vy) / r;
}

// ---------------------------------------------------------------- coverage predicate

/** What the coverage predicate reads from a sensor or effector. Missing limits are open. */
export type CoverageSystem = Pt3 & {
  kind: string;
  rangeM: number;
  minRangeM?: number;
  fovDeg?: number;
  bearingDeg?: number;
  elMinDeg?: number;
  elMaxDeg?: number;
  zMinM?: number;
  zMaxM?: number | null;
  active?: boolean;
};

export type CoverageOpts = {
  /** False for a threat that does not emit RF: `rf` and `ew` systems never cover it. */
  emitsRf?: boolean;
  /** Keep only the status and range terms (the static ring). */
  ringOnly?: boolean;
};

const RF_KINDS = new Set(['rf', 'ew']);

export function inCoverage(s: CoverageSystem, p: Pt3, opts: CoverageOpts = {}): boolean {
  if (s.active === false || !(s.rangeM > 0)) return false;
  const R = slantRange(s, p);
  if (R < (s.minRangeM ?? 0) || R > s.rangeM) return false;
  if (opts.ringOnly) return true;
  if (opts.emitsRf === false && RF_KINDS.has(s.kind)) return false;
  const fov = s.fovDeg ?? 360;
  if (fov < 360 && angleDiff(bearingTo(s, p), s.bearingDeg ?? 0) > fov / 2) return false;
  const el = elevAngle(s, p);
  if (el < (s.elMinDeg ?? -90) || el > (s.elMaxDeg ?? 90)) return false;
  if (p.z < (s.zMinM ?? 0)) return false;
  if (s.zMaxM != null && p.z > s.zMaxM) return false;
  return true;
}

// ---------------------------------------------------------------- windows

/** The shared sample set of one path: 1 s steps from the start, every waypoint t0 and t1, the end. */
export type PathSamples = { times: number[]; poses: Pose[] };

export function samplePath(w: readonly TimedPoint[], dt = 1): PathSamples {
  if (!w.length) return { times: [], poses: [] };
  const step = dt > 0 ? dt : 1;
  const start = w[0]!.t0;
  const end = endOf(w);
  const ts: number[] = [];
  for (let t = start; t < end; t += step) ts.push(t);
  for (const q of w) ts.push(q.t0, q.t1);
  ts.push(end);
  ts.sort((a, b) => a - b);
  const times: number[] = [];
  for (const t of ts) if (!times.length || t - times[times.length - 1]! > 1e-9) times.push(t);
  return { times, poses: times.map((t) => posAt(w, t)) };
}

/**
 * Time windows over which `pred` holds along the path. Samples at `dt` (default 1 s) plus the
 * waypoint times, bisects each state change to 0.1 s, merges gaps under 1 s and drops windows
 * under 0.2 s. Pass `samples` from `samplePath` to share the sample set across predicates.
 */
export function windowsOf(
  pred: (p: Pose) => boolean,
  w: readonly TimedPoint[],
  dt = 1,
  samples?: PathSamples,
): [number, number][] {
  if (!w.length) return [];
  const S = samples ?? samplePath(w, dt);
  const times = S.times;
  const end = endOf(w);
  const at = (t: number) => pred(posAt(w, t));
  const edge = (lo: number, hi: number, loState: boolean) => {
    while (hi - lo > 0.1) {
      const mid = (lo + hi) / 2;
      if (at(mid) === loState) lo = mid;
      else hi = mid;
    }
    return loState ? lo : hi; // the covered side
  };
  const raw: [number, number][] = [];
  let prevT = times[0]!;
  let prev = pred(S.poses[0]!);
  let tIn: number | null = prev ? prevT : null;
  for (let i = 1; i < times.length; i++) {
    const tt = times[i]!;
    const cur = pred(S.poses[i]!);
    if (cur !== prev) {
      const b = edge(prevT, tt, prev);
      if (cur) tIn = b;
      else {
        raw.push([tIn!, b]);
        tIn = null;
      }
    }
    prev = cur;
    prevT = tt;
  }
  if (tIn != null) raw.push([tIn, end]);
  const merged: [number, number][] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < 1) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }
  return merged.filter((r) => r[1] - r[0] >= 0.2);
}

/** One coverage window with the slant range at entry and exit. */
export type Window = { tIn: number; tOut: number; rIn: number; rOut: number };

export function coverageWindows(
  s: CoverageSystem,
  w: readonly TimedPoint[],
  opts: CoverageOpts = {},
  samples?: PathSamples,
): Window[] {
  return windowsOf((p) => inCoverage(s, p, opts), w, 1, samples).map(([tIn, tOut]) => ({
    tIn,
    tOut,
    rIn: slantRange(s, posAt(w, tIn)),
    rOut: slantRange(s, posAt(w, tOut)),
  }));
}

// ---------------------------------------------------------------- areas

/** A polygon (`pts` as [x, y]) or a circle. A `zMaxM` of 0 or null means no top. */
export type AreaShape = (
  { pts: readonly (readonly [number, number])[] } | { center: Pt2; radiusM: number }
) & { zMinM?: number; zMaxM?: number | null };

export type AreaWindow = { tIn: number; tOut: number };

export function pointInPolygon(pt: Pt2, pts: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export function inArea(a: AreaShape, p: Pt3): boolean {
  const bottom = a.zMinM ?? 0;
  const top = a.zMaxM;
  if (p.z < bottom || (top ? p.z > top : false)) return false;
  if ('pts' in a) return pointInPolygon(p, a.pts);
  return Math.hypot(p.x - a.center.x, p.y - a.center.y) <= a.radiusM;
}

/** Entry and exit windows of a path through an area (legacy `volumeEntries`). */
export function areaWindows(
  a: AreaShape,
  w: readonly TimedPoint[],
  samples?: PathSamples,
): AreaWindow[] {
  return windowsOf((p) => inArea(a, p), w, 1, samples).map(([tIn, tOut]) => ({ tIn, tOut }));
}

/** Area centroid (signed-area formula), falling back to the vertex mean for degenerate rings. */
export function centroid(pts: readonly (readonly [number, number])[]): Pt3 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    const c = p[0] * q[1] - q[0] * p[1];
    a += c;
    cx += (p[0] + q[0]) * c;
    cy += (p[1] + q[1]) * c;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (const p of pts) {
      sx += p[0];
      sy += p[1];
    }
    return { x: sx / (pts.length || 1), y: sy / (pts.length || 1), z: 0 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a), z: 0 };
}

// ---------------------------------------------------------------- groups and splits

/** Median nearest-neighbour 3D separation across the paths at time `t`. */
export function medianNN(paths: readonly (readonly TimedPoint[])[], t: number): number {
  const ps = paths.map((w) => posAt(w, t));
  if (ps.length < 2) return 0;
  const nn = ps
    .map((a, i) => {
      let m = Infinity;
      ps.forEach((b, j) => {
        if (i !== j) m = Math.min(m, dist3(a, b));
      });
      return m;
    })
    .sort((a, b) => a - b);
  const h = nn.length >> 1;
  return nn.length % 2 ? nn[h]! : (nn[h - 1]! + nn[h]!) / 2;
}

export type Split = { t: number; from: number; to: number };

/** Union-find component count over `n` nodes with the given adjacency. */
function componentCount(n: number, linked: boolean[][]): number {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  let count = n;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (linked[i]![j]) {
        const a = find(i);
        const b = find(j);
        if (a !== b) {
          parent[a] = b;
          count--;
        }
      }
  return count;
}

/** Smallest root of a s^2 + b s + c = 0 in (lo, hi] whose derivative has the sign `dir`. */
function firstRoot(a: number, b: number, c: number, lo: number, hi: number, dir: 1 | -1) {
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const q = Math.sqrt(disc);
      roots.push((-b - q) / (2 * a), (-b + q) / (2 * a));
    }
  }
  let best: number | null = null;
  for (const s of roots) {
    if (!(s > lo + 1e-9 && s <= hi + 1e-9)) continue;
    const slope = 2 * a * s + b;
    if (slope * dir <= 0) continue;
    if (best === null || s < best) best = s;
  }
  return best === null ? null : Math.min(best, hi);
}

/**
 * Times at which the number of link clusters among the paths changes. Two paths are linked while
 * their 3D separation is at or under `dLink`; a link forms only once separation drops to
 * 0.8 * dLink (hysteresis, as the legacy sticky graph). A new cluster count must hold for
 * `confirmS` (3 s) before it counts as a split or merge.
 *
 * Event driven: each pair's separation is piecewise quadratic between waypoint times, so the
 * crossing times are solved exactly instead of walked at 0.1 s.
 */
export function splitTimes(
  paths: readonly (readonly TimedPoint[])[],
  tmaxS: number,
  dLink: number,
  confirmS = 3,
): Split[] {
  const n = paths.length;
  if (n < 2 || !(dLink > 0)) return [];
  const unlinkAt2 = dLink * dLink;
  const linkAt2 = 0.64 * dLink * dLink;

  type Ev = { t: number; i: number; j: number; linked: boolean };
  const events: Ev[] = [];
  const link: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const wi = paths[i]!;
      const wj = paths[j]!;
      const marks = [0, tmaxS];
      for (const q of wi) marks.push(q.t0, q.t1);
      for (const q of wj) marks.push(q.t0, q.t1);
      marks.sort((a, b) => a - b);
      const bps: number[] = [];
      for (const t of marks) {
        if (t < 0 || t > tmaxS) continue;
        if (!bps.length || t - bps[bps.length - 1]! > 1e-9) bps.push(t);
      }
      let state = dist3(posAt(wi, 0), posAt(wj, 0)) <= dLink;
      link[i]![j] = link[j]![i] = state;
      let pa = posAt(wi, bps[0]!);
      let pb = posAt(wj, bps[0]!);
      for (let k = 0; k + 1 < bps.length; k++) {
        const ta = bps[k]!;
        const tb = bps[k + 1]!;
        const L = tb - ta;
        const qa = posAt(wi, tb);
        const qb = posAt(wj, tb);
        const r0x = pb.x - pa.x;
        const r0y = pb.y - pa.y;
        const r0z = pb.z - pa.z;
        const dvx = (qb.x - qa.x - r0x) / L;
        const dvy = (qb.y - qa.y - r0y) / L;
        const dvz = (qb.z - qa.z - r0z) / L;
        const a = dvx * dvx + dvy * dvy + dvz * dvz;
        const b = 2 * (r0x * dvx + r0y * dvy + r0z * dvz);
        const r02 = r0x * r0x + r0y * r0y + r0z * r0z;
        let s = 0;
        for (;;) {
          const root = state
            ? firstRoot(a, b, r02 - unlinkAt2, s, L, 1)
            : firstRoot(a, b, r02 - linkAt2, s, L, -1);
          if (root === null) break;
          state = !state;
          events.push({ t: ta + root, i, j, linked: state });
          s = root;
        }
        pa = qa;
        pb = qb;
      }
    }
  }
  events.sort((a, b) => a.t - b.t);

  // cluster count after each batch of simultaneous link changes
  const changes: { t: number; count: number }[] = [];
  let count = componentCount(n, link);
  const count0 = count;
  for (let k = 0; k < events.length;) {
    const t = events[k]!.t;
    while (k < events.length && events[k]!.t - t <= 1e-9) {
      const e = events[k]!;
      link[e.i]![e.j] = link[e.j]![e.i] = e.linked;
      k++;
    }
    const c = componentCount(n, link);
    if (c !== count) {
      count = c;
      changes.push({ t, count: c });
    }
  }

  // confirmation walk: a new count must hold for confirmS before it is reported
  const out: Split[] = [];
  let confirmed = count0;
  let cand: { count: number; t: number } | null = null;
  const settle = (until: number) => {
    if (cand && until > cand.t + confirmS - 1e-9 && cand.t + confirmS <= tmaxS + 1e-9) {
      out.push({ t: cand.t, from: confirmed, to: cand.count });
      confirmed = cand.count;
      cand = null;
    }
  };
  for (const ch of changes) {
    settle(ch.t);
    if (ch.count === confirmed) cand = null;
    else if (!cand || cand.count !== ch.count) cand = { count: ch.count, t: ch.t };
  }
  settle(tmaxS + 1);
  return out;
}
