// Coverage in and out crossings per threat, ported from legacy/js/21-derive.js (`d.crossings`).

import type { Window } from './geo';

export type Crossing = { t: number; system: string; kind: 'in' | 'out'; r: number };

/**
 * Every window edge of every system against one threat, time sorted. `windows` is ordered by
 * system id in the profile's system order; ties keep that order (stable sort).
 */
export function crossingsFor(windows: readonly [string, readonly Window[]][]): Crossing[] {
  const out: Crossing[] = [];
  for (const [system, ws] of windows)
    for (const x of ws)
      out.push(
        { t: x.tIn, system, kind: 'in', r: x.rIn },
        { t: x.tOut, system, kind: 'out', r: x.rOut },
      );
  return out.sort((a, b) => a.t - b.t);
}
