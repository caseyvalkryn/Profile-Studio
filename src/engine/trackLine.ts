// Track lifecycle spans, ported from legacy/js/21-derive.js `trackLineFor` (legacy brief 6.3).
// States: pending (Find to Fix), unknown (Fix to Track), identity (after Track); a sensor coverage
// gap downgrades to coast for the first COAST_S seconds, then lost until coverage resumes.

import { COAST_S } from '../domain/catalog';
import { endOf } from './geo';
import type { TimedPoint, Window } from './geo';

export type TrackState = 'pending' | 'unknown' | 'identity' | 'coast' | 'lost';
export type TrackSpan = { t0: number; t1: number; state: TrackState };

export type TrackLineInput = {
  timed: readonly TimedPoint[];
  /** Find, Fix and Track times (the legacy detect, track and id rungs); null when not reached. */
  findT: number | null;
  fixT: number | null;
  trackT: number | null;
  /** Coverage windows of every sensor against this threat (effectors and nodes excluded). */
  sensorWindows: readonly (readonly Window[])[];
  coastS?: number;
};

export function trackLineFor(input: TrackLineInput): TrackSpan[] {
  const w = input.timed;
  const end = endOf(w);
  const tD = input.findT;
  const tT = input.fixT;
  const tI = input.trackT;
  const coast = input.coastS ?? COAST_S;
  if (tD == null || !w.length) return [];

  const cover: [number, number][] = [];
  for (const ws of input.sensorWindows) for (const x of ws) cover.push([x.tIn, x.tOut]);
  cover.sort((a, b) => a[0] - b[0]);
  const U: [number, number][] = [];
  for (const c of cover) {
    const l = U[U.length - 1];
    if (l && c[0] <= l[1]) l[1] = Math.max(l[1], c[1]);
    else U.push([c[0], c[1]]);
  }
  const gaps: [number, number][] = [];
  U.forEach((u, i) => {
    const next = U[i + 1] ? U[i + 1]![0] : end;
    if (next - u[1] > 0.01) gaps.push([u[1], next]);
  });

  let cuts: number[] = [tD, end];
  for (const x of [tT, tI]) if (x != null) cuts.push(x);
  for (const g of gaps) cuts.push(g[0], Math.min(g[0] + coast, g[1]), g[1]);
  cuts = cuts.filter((x) => x >= tD - 1e-9 && x <= end + 1e-9).sort((a, b) => a - b);

  const stateAt = (t: number): TrackState => {
    for (const g of gaps) if (t > g[0] && t < g[1]) return t < g[0] + coast ? 'coast' : 'lost';
    if (tI != null && t >= tI) return 'identity';
    if (tT != null && t >= tT) return 'unknown';
    return 'pending';
  };

  const spans: TrackSpan[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i]!;
    const b = cuts[i + 1]!;
    if (b - a < 1e-9) continue;
    const st = stateAt((a + b) / 2);
    const last = spans[spans.length - 1];
    if (last && last.state === st && Math.abs(last.t1 - a) < 1e-9) last.t1 = b;
    else spans.push({ t0: a, t1: b, state: st });
  }
  if (!spans.length) spans.push({ t0: tD, t1: Math.max(tD, end), state: stateAt(tD) });
  return spans;
}
