// Link-cluster envelopes at one time, ported from legacy/js/20-geo.js (`hull`, `components`,
// `envelopesAt`). `splitTimes` lives in geo.ts (event driven); this file holds only the snapshot.
// Pure: metres and seconds, no catalog, no DOM, no store.

import { dist3, posAt } from './geo';
import type { TimedPoint } from './geo';

export type Hull = [number, number][];

/** One convex hull per connected link component; `members` are the threat ids inside it. */
export type Envelope = { hull: Hull; members: string[] };

/** Andrew's monotone chain, as the legacy `G.hull`: fewer than three points come back sorted. */
export function hull(pts: readonly (readonly [number, number])[]): Hull {
  const s = pts
    .map((p) => [p[0], p[1]] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  const up: [number, number][] = [];
  for (const q of s) {
    while (lo.length > 1 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = s.length - 1; i >= 0; i--) {
    const q = s[i]!;
    while (up.length > 1 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Depth-first component labels in first-seen order, as the legacy `components`. */
export function components(n: number, linked: (a: number, b: number) => boolean) {
  const lab = new Array<number>(n).fill(-1);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (lab[i]! >= 0) continue;
    const stack = [i];
    lab[i] = c;
    while (stack.length) {
      const k = stack.pop()!;
      for (let j = 0; j < n; j++)
        if (lab[j]! < 0 && linked(k, j)) {
          lab[j] = c;
          stack.push(j);
        }
    }
    c++;
  }
  return { count: c, lab };
}

/**
 * The envelopes at time `t`: the grouped threats (a non-empty `groupOf`) are linked when their 3D
 * separation is at or under `dLink`; each component gets the hull of its members' positions.
 * Threat order follows `timed` insertion order, as the legacy `Object.keys(byPath)`.
 */
export function envelopesAt(
  timed: Readonly<Record<string, readonly TimedPoint[]>>,
  groupOf: Readonly<Record<string, string>>,
  t: number,
  dLink: number | null,
): Envelope[] {
  const ids = Object.keys(timed).filter((id) => !!groupOf[id]);
  const ps = ids.map((id) => posAt(timed[id]!, t));
  const cmp = components(ids.length, (a, b) => dLink != null && dist3(ps[a]!, ps[b]!) <= dLink);
  const out: Envelope[] = [];
  for (let c = 0; c < cmp.count; c++) {
    const members: string[] = [];
    const pts: [number, number][] = [];
    cmp.lab.forEach((l, i) => {
      if (l === c) {
        members.push(ids[i]!);
        pts.push([ps[i]!.x, ps[i]!.y]);
      }
    });
    out.push({ hull: hull(pts), members });
  }
  return out;
}
