// Range over time for the chart strip, ported from legacy/js/20-geo.js `G.rangeSeries` and the
// per-pair cache in 21-derive.js `attachFns`.

import { endOf, posAt } from './geo';
import type { Pt2, TimedPoint } from './geo';

export type RangeSample = { t: number; r: number; z: number; spd: number };

/** One sample per `dt` seconds from the path start to its end (the end is always included). */
export function rangeSeriesOf(w: readonly TimedPoint[], o: Pt2, dt = 1): RangeSample[] {
  if (!w.length) return [];
  const step = dt > 0 ? dt : 1;
  const end = endOf(w);
  const out: RangeSample[] = [];
  for (let t = w[0]!.t0; ; t += step) {
    const tt = Math.min(t, end);
    const p = posAt(w, tt);
    out.push({ t: tt, r: Math.hypot(p.x - o.x, p.y - o.y), z: p.z, spd: Math.hypot(p.vx, p.vy) });
    if (tt >= end) break;
  }
  return out;
}

/** A `(threatId, ref)` cache around a series builder; the key is the pair, 'asset' when ref is empty. */
export function rangeSeriesCache(build: (threatId: string, ref: string) => RangeSample[]) {
  const cache = new Map<string, RangeSample[]>();
  return (threatId: string, ref?: string | null): RangeSample[] => {
    const r = ref || 'asset';
    const key = threatId + '\u0000' + r;
    let s = cache.get(key);
    if (!s) {
      s = build(threatId, r);
      cache.set(key, s);
    }
    return s;
  };
}
