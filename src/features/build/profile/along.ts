// Along-track geometry of a timed flight path: cumulative horizontal distance at each waypoint,
// and the along-track distance and altitude at a time.
import type { TimedPoint } from '../../../engine/geo';

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
