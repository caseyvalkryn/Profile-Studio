import type { FormationShape, Vec2 } from '../model/types';

/** World frame: meters, +x east, +y south (screen-down). Heading 0 = north (up), clockwise. */

const DEG = Math.PI / 180;

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Heading in degrees [0, 360) from a to b. 0 = north, 90 = east. */
export function bearingDeg(a: Vec2, b: Vec2): number {
  const deg = Math.atan2(b.x - a.x, -(b.y - a.y)) / DEG;
  return (deg + 360) % 360;
}

/** Point at the given heading and distance from origin p. */
export function destination(p: Vec2, headingDeg: number, distM: number): Vec2 {
  const r = headingDeg * DEG;
  return { x: p.x + Math.sin(r) * distM, y: p.y - Math.cos(r) * distM };
}

/** Smallest absolute angular difference between two headings, degrees [0, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** True when p lies inside the azimuth wedge of a sector, range ignored: a ground-plane bearing test. */
export function pointInWedge(
  center: Vec2,
  headingDeg: number,
  sectorDeg: number,
  p: Vec2,
): boolean {
  return pointInSector(center, headingDeg, sectorDeg, Number.POSITIVE_INFINITY, p);
}

/** True when p lies inside a sector footprint. sectorDeg >= 360 means a full circle. */
export function pointInSector(
  center: Vec2,
  headingDeg: number,
  sectorDeg: number,
  rangeM: number,
  p: Vec2,
): boolean {
  if (dist(center, p) > rangeM) return false;
  if (sectorDeg >= 360) return true;
  return angleDiffDeg(bearingDeg(center, p), headingDeg) <= sectorDeg / 2;
}

/**
 * Flat [x0, y0, x1, y1, ...] polygon for a sector wedge, starting at the
 * center. For a full circle, use a Konva Circle instead.
 */
export function wedgePoints(
  center: Vec2,
  headingDeg: number,
  sectorDeg: number,
  rangeM: number,
  steps = 32,
): number[] {
  const pts: number[] = [center.x, center.y];
  const start = headingDeg - sectorDeg / 2;
  for (let i = 0; i <= steps; i++) {
    const p = destination(center, start + (sectorDeg * i) / steps, rangeM);
    pts.push(p.x, p.y);
  }
  return pts;
}

/** Rotate p about center by deltaDeg clockwise on screen (heading convention). */
export function rotatePoint(p: Vec2, center: Vec2, deltaDeg: number): Vec2 {
  const d = dist(center, p);
  if (d === 0) return { ...p };
  return destination(center, bearingDeg(center, p) + deltaDeg, d);
}

/**
 * World offsets for each ship of a formation. Ship 0 is the lead at {0,0}.
 * Local frame: along = flight direction, across = right of flight direction.
 */
export function formationOffsets(
  shape: FormationShape,
  count: number,
  spacingM: number,
  headingDeg: number,
): Vec2[] {
  const n = Math.max(1, Math.floor(count));
  const local: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const rank = Math.ceil(i / 2);
    const side = i % 2 === 1 ? 1 : -1;
    switch (shape) {
      case 'line':
        local.push([0, i === 0 ? 0 : side * rank * spacingM]);
        break;
      case 'wedge':
        local.push([-rank * spacingM, i === 0 ? 0 : side * rank * spacingM]);
        break;
      case 'column':
        local.push([-i * spacingM, 0]);
        break;
      case 'echelon':
        local.push([-i * spacingM, i * spacingM]);
        break;
      case 'cluster': {
        // Concentric rings: ring k holds 6k ships at radius k * spacing.
        if (i === 0) {
          local.push([0, 0]);
          break;
        }
        let ring = 1;
        let first = 1;
        while (i >= first + 6 * ring) {
          first += 6 * ring;
          ring += 1;
        }
        const slot = i - first;
        const a = (slot / (6 * ring)) * 2 * Math.PI;
        local.push([Math.cos(a) * ring * spacingM, Math.sin(a) * ring * spacingM]);
        break;
      }
    }
  }
  const r = headingDeg * DEG;
  const fwd = { x: Math.sin(r), y: -Math.cos(r) };
  const right = { x: Math.cos(r), y: Math.sin(r) };
  return local.map(([along, across]) => ({
    x: fwd.x * along + right.x * across,
    y: fwd.y * along + right.y * across,
  }));
}

export function pathLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  return total;
}

export interface PathSample {
  pos: Vec2;
  headingDeg: number;
  /** Distance traveled along the path, meters. */
  distM: number;
  done: boolean;
}

/** Position after traveling distM along the waypoint list. Clamps at both ends. */
export function posAlongPath(points: Vec2[], distM: number): PathSample {
  if (points.length === 0) return { pos: { x: 0, y: 0 }, headingDeg: 0, distM: 0, done: true };
  if (points.length === 1) return { pos: points[0]!, headingDeg: 0, distM: 0, done: true };
  let remaining = Math.max(0, distM);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = dist(a!, b);
    if (remaining <= seg && seg > 0) {
      const t = remaining / seg;
      return {
        pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        headingDeg: bearingDeg(a!, b),
        distM,
        done: false,
      };
    }
    remaining -= seg;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return {
    pos: last!,
    headingDeg: bearingDeg(prev!, last!),
    distM: pathLength(points),
    done: true,
  };
}

/** Position at time t for a path flown at speedMps after startDelayS. */
export function posAtTime(
  points: Vec2[],
  speedMps: number,
  startDelayS: number,
  tS: number,
): PathSample {
  const flightT = Math.max(0, tS - startDelayS);
  return posAlongPath(points, flightT * speedMps);
}

/** Display-only unit convention: aviation (kt, nm, ft) or metric (m/s, km). */
export type DisplayUnits = 'aviation' | 'metric';

const NM_M = 1852;
const MPS_PER_KT = 0.514444;

/** Aviation grid steps: nice nm fractions, with metric values at fine zoom. */
const AVIATION_STEPS_M = [
  25, 50, 100, 200, 500, 926, 1852, 3704, 9260, 18520, 46300, 92600, 185200,
];

/** Grid step in meters that keeps grid lines a readable distance apart on screen. */
export function gridStepM(
  pxPerMeter: number,
  targetPx = 90,
  units: DisplayUnits = 'metric',
): number {
  const raw = targetPx / pxPerMeter;
  if (units === 'aviation' && raw >= 25) {
    for (const step of AVIATION_STEPS_M) {
      if (step >= raw) return step;
    }
    return AVIATION_STEPS_M[AVIATION_STEPS_M.length - 1]!;
  }
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const mult of [1, 2, 5, 10]) {
    if (pow * mult >= raw) return pow * mult;
  }
  return pow * 10;
}

export function formatDistance(m: number, units: DisplayUnits = 'metric'): string {
  if (units === 'aviation') {
    if (m < NM_M / 2) return `${Math.round(m)} m`;
    const nm = m / NM_M;
    return nm < 10 ? `${nm.toFixed(1)} nm` : `${Math.round(nm * 10) / 10} nm`;
  }
  if (m >= 10000) return `${(m / 1000).toFixed(0)} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

/** A distance in nautical miles at two decimals, whatever the units setting. The ring readout. */
export function formatNm(m: number): string {
  return `${(m / NM_M).toFixed(2)} nm`;
}

/**
 * One position axis as a hemisphere letter and an unsigned magnitude, the way a
 * position is read aloud: two decimals of a nautical mile or a kilometer.
 */
export function formatAxis(m: number, units: DisplayUnits, plus: string, minus: string): string {
  const mag = Math.abs(m);
  const value =
    units === 'aviation' ? `${(mag / NM_M).toFixed(2)} nm` : `${(mag / 1000).toFixed(2)} km`;
  return `${m < 0 ? minus : plus} ${value}`;
}

export function formatSpeed(mps: number, units: DisplayUnits = 'metric'): string {
  if (units === 'aviation') return `${Math.round(mps / MPS_PER_KT)} kt`;
  return `${Math.round(mps)} m/s`;
}

export function formatTime(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const mm = Math.floor(abs / 60);
  const ss = Math.floor(abs % 60);
  return `${sign}${mm}:${ss.toString().padStart(2, '0')}`;
}
