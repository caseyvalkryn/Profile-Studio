/**
 * Threat behaviours (spec section 9): pure path generators in the site frame. Metres, x east,
 * y north, z metres above ground level. Bearings are degrees clockwise from north. Every
 * function is deterministic in its geometry; only the waypoint `key`s are minted fresh.
 *
 * Speed is not a path property. It lives on `Threat.speedMs` or the archetype cruise speed,
 * so no generator takes a speed argument.
 *
 * What the Monte Carlo run cannot honour today (`LOSSES` in src/engine/adapter.ts):
 * - Altitude profile. The run flies flat at the first waypoint's z. A pop-up, a climb or a
 *   terminal dive is kept in the path for the preview and the profile view, and is lost in
 *   the run rows (`detect_alt_m` is the first waypoint's z).
 * - Waypoint holds (`holdS`). The run flies through every waypoint. A hover dwells in the
 *   preview timeline only.
 * The template questions therefore rest on horizontal geometry and speed, and say so where
 * a behaviour is a hover or a dive.
 */
import { newKey } from './ids';
import type { Waypoint } from './types';

export type Pt = { x: number; y: number };

const DEG = Math.PI / 180;

/** Waypoint at `p`, altitude `z`, with an optional dwell. */
export function wp(p: Pt, z: number, holdS = 0): Waypoint {
  return { key: newKey(), x: p.x, y: p.y, z, holdS };
}

/** Point at `bearingDeg` and `rangeM` from `center`. */
export function polar(center: Pt, bearingDeg: number, rangeM: number): Pt {
  const b = bearingDeg * DEG;
  return { x: center.x + rangeM * Math.sin(b), y: center.y + rangeM * Math.cos(b) };
}

/** Bearing from `a` to `b`, degrees clockwise from north in [0, 360). */
export function bearingDeg(a: Pt, b: Pt): number {
  const d = Math.atan2(b.x - a.x, b.y - a.y) / DEG;
  return (d + 360) % 360;
}

/** Point `distM` back from `to` along the line `from` to `to`. */
export function backAlong(from: Pt, to: Pt, distM: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: to.x - (dx / len) * distM, y: to.y - (dy / len) * distM };
}

/** Straight run-in from `from` to `to` at one altitude. Two waypoints. */
export function directApproach(from: Pt, to: Pt, altM: number): Waypoint[] {
  return [wp(from, altM), wp(to, altM)];
}

/**
 * Low ingress at `lowAltM`, a pop-up to `popUpAltM` at `popUpDistM` short of the target, then
 * the target at `terminalAltM`. Four waypoints. The run flies the whole path at `lowAltM`.
 */
export function terrainFollowingIngress(
  from: Pt,
  target: Pt,
  lowAltM: number,
  popUpAltM: number,
  popUpDistM: number,
  terminalAltM = lowAltM,
): Waypoint[] {
  const popUp = backAlong(from, target, popUpDistM);
  const popUpStart = backAlong(from, target, popUpDistM * 1.5);
  return [
    wp(from, lowAltM),
    wp(popUpStart, lowAltM),
    wp(popUp, popUpAltM),
    wp(target, terminalAltM),
  ];
}

/**
 * Clockwise orbit about `center`, starting due north of it. `turns` full turns sampled at
 * `segments` points per turn, plus the closing point: `turns * segments + 1` waypoints.
 */
export function orbit(
  center: Pt,
  radiusM: number,
  altM: number,
  turns: number,
  segments = 12,
): Waypoint[] {
  const n = Math.max(1, Math.round(turns * segments));
  const out: Waypoint[] = [];
  for (let i = 0; i <= n; i++) out.push(wp(polar(center, (360 * i) / segments, radiusM), altM));
  return out;
}

/**
 * Racetrack about `center`, straights along east-west of `lengthM`, `widthM` between them,
 * with chamfered turns as in the legacy reference pattern. Eight points per lap plus the
 * closing point: `laps * 8 + 1` waypoints. Starts at the south-west corner, runs east first.
 */
export function racetrack(
  center: Pt,
  lengthM: number,
  widthM: number,
  altM: number,
  laps: number,
): Waypoint[] {
  const hx = lengthM / 2;
  const hy = widthM / 2;
  const c = Math.min(hy, lengthM / 6); // chamfer
  const lap: Pt[] = [
    { x: -hx + c, y: -hy },
    { x: hx - c, y: -hy },
    { x: hx, y: -hy + c },
    { x: hx, y: hy - c },
    { x: hx - c, y: hy },
    { x: -hx + c, y: hy },
    { x: -hx, y: hy - c },
    { x: -hx, y: -hy + c },
  ].map((p) => ({ x: center.x + p.x, y: center.y + p.y }));
  const out: Waypoint[] = [];
  for (let l = 0; l < Math.max(1, laps); l++) for (const p of lap) out.push(wp(p, altM));
  out.push(wp(lap[0]!, altM));
  return out;
}

/** One waypoint at `point` with a dwell of `holdS`. Append it to an approach. */
export function hoverAndStare(point: Pt, altM: number, holdS: number): Waypoint[] {
  return [wp(point, altM, holdS)];
}

/**
 * Cruise from `approach` at `cruiseAltM`, dive start at `diveStartM` short of `target`, then
 * `target` at `impactAltM`. Three waypoints. The run flies flat at `cruiseAltM`.
 */
export function terminalDive(
  approach: Pt,
  target: Pt,
  diveStartM: number,
  cruiseAltM: number,
  impactAltM = 20,
): Waypoint[] {
  const diveStart = backAlong(approach, target, diveStartM);
  return [wp(approach, cruiseAltM), wp(diveStart, cruiseAltM), wp(target, impactAltM)];
}

/** Position at `fraction` of the path's 3D length, and the index of the leg it lies on. */
function alongPath(path: Waypoint[], fraction: number): { p: Pt; z: number; leg: number } {
  const legs: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    legs.push(d);
    total += d;
  }
  let want = Math.min(1, Math.max(0, fraction)) * total;
  for (let i = 0; i < legs.length; i++) {
    const d = legs[i]!;
    if (want <= d || i === legs.length - 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const f = d > 0 ? Math.min(1, want / d) : 0;
      return {
        p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        z: a.z + (b.z - a.z) * f,
        leg: i,
      };
    }
    want -= d;
  }
  const a = path[0]!;
  return { p: { x: a.x, y: a.y }, z: a.z, leg: 0 };
}

/**
 * One group path becomes `into` element paths. Each shares the prefix up to the split point at
 * `at` (fraction of path length), then flies the rest offset across track by
 * `spreadM * (i - (into - 1) / 2)`, so the elements fan out evenly about the group track.
 * Needs two or more waypoints.
 */
export function split(group: Waypoint[], at: number, into: number, spreadM: number): Waypoint[][] {
  if (group.length < 2 || into < 1) return [group.map((w) => ({ ...w, key: newKey() }))];
  const { p, z, leg } = alongPath(group, at);
  const a = group[leg]!;
  const b = group[leg + 1]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  // Unit vector across track (to the right of the heading).
  const rx = (b.y - a.y) / len;
  const ry = -(b.x - a.x) / len;
  const out: Waypoint[][] = [];
  for (let i = 0; i < into; i++) {
    const off = spreadM * (i - (into - 1) / 2);
    const prefix = group.slice(0, leg + 1).map((w) => wp(w, w.z, w.holdS));
    const splitPoint = wp(p, z);
    const rest = group
      .slice(leg + 1)
      .map((w) => wp({ x: w.x + rx * off, y: w.y + ry * off }, w.z, w.holdS));
    out.push([...prefix, splitPoint, ...rest]);
  }
  return out;
}

/**
 * `n` direct approaches to `target` from `radiusM` out, one per bearing. Bearings default to
 * an even spread starting at 0. Returns `n` two-waypoint paths.
 */
export function multiAxisSalvo(
  target: Pt,
  n: number,
  radiusM: number,
  altM: number,
  bearings?: number[],
): Waypoint[][] {
  const bs = bearings ?? Array.from({ length: n }, (_, i) => (360 * i) / n);
  return Array.from({ length: n }, (_, i) =>
    directApproach(polar(target, bs[i % bs.length]!, radiusM), target, altM),
  );
}
