// Time stops for Previous and Next ([ and ]), ported from legacy/js/34-time.js `stops` (132-146):
// authored event times, stage times (t and tGeo), split times, first sees, 0 and tmax.
// Sorted and deduped; only finite times inside [0, tmax].

import type { Vignette } from '../domain/types';
import type { Derived } from './derived';

export function stops(v: Vignette, d: Derived): number[] {
  const out: (number | null)[] = [0];
  for (const e of v.events) out.push(e.tS);
  for (const st of Object.values(d.stages))
    for (const s of Object.values(st)) if (s) out.push(s.t, s.tGeo);
  for (const s of d.splits) out.push(s.t);
  for (const bySystem of Object.values(d.first))
    for (const f of Object.values(bySystem)) if (f) out.push(f.t);
  out.push(d.tmax);
  const kept = out
    .filter((x): x is number => x != null && isFinite(x) && x >= 0 && x <= d.tmax)
    .sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const x of kept) if (!uniq.length || x - uniq[uniq.length - 1]! > 1e-9) uniq.push(x);
  return uniq;
}

/** The first stop after `t` (the legacy EPS of 0.05 s), else tmax. */
export function nextStop(list: readonly number[], t: number, tmax: number, eps = 0.05): number {
  for (const s of list) if (s > t + eps) return s;
  return tmax;
}

/** The last stop before `t`, else 0. */
export function prevStop(list: readonly number[], t: number, eps = 0.05): number {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]! < t - eps) return list[i]!;
  return 0;
}
