// Formation (Shift+F): N threats on a line abreast of the selected threat's first leg, ported
// from legacy/js/20-geo.js formationPoints and legacy/js/45-tools.js tools.formation.
import type { Draft } from 'immer';
import { newKey } from '../../../domain/ids';
import type { Vignette, Waypoint } from '../../../domain/types';

export const FORMATION_MIN = 2;
export const FORMATION_MAX = 12;
export const FORMATION_SPACING_M = 120;

type Pt = Pick<Waypoint, 'x' | 'y' | 'z' | 'holdS'>;

/**
 * The member paths for a formation of `n` (the source is member 1). Members alternate sides of
 * the first leg at `spacing` metres steps (right 1, left 1, right 2 ...) and step 5 m in height
 * (-5, 0, +5). Fewer than two points or n < 2 gives none.
 */
export function formationPoints(pts: readonly Pt[], n: number, spacing: number): Pt[][] {
  if (pts.length < 2 || !(n > 1)) return [];
  const a = pts[0]!;
  const b = pts[1]!;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / L;
  const ny = (b.x - a.x) / L;
  const out: Pt[][] = [];
  for (let k = 1; k <= n - 1; k++) {
    const off = spacing * Math.ceil(k / 2) * (k % 2 ? 1 : -1);
    out.push(
      pts.map((q) => ({
        x: Math.round(q.x + nx * off),
        y: Math.round(q.y + ny * off),
        z: (q.z || 0) + ((k % 3) - 1) * 5,
        holdS: q.holdS || 0,
      })),
    );
  }
  return out;
}

/** One letter A to Z from free text; `A` when there is none. */
export function groupLetter(text: string): string {
  return (
    text
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .charAt(0) || 'A'
  );
}

/** Lowest unused `<prefix><n>`, as legacy util.uid. */
function uid(prefix: string, used: Set<string>): string {
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/**
 * Write a formation into a draft: the source joins `group`, and n - 1 members copy its type and
 * speed. Member ids are the group letter and a number (A1, A2), as legacy. Snapshots default to
 * [10, tmax / 2] when the vignette has none. Returns the new ids, or [] when the threat has
 * fewer than two waypoints.
 */
export function applyFormation(
  d: Draft<Vignette>,
  threatKey: string,
  n: number,
  spacing: number,
  group: string,
  tmaxS = 60,
): string[] {
  const src = d.threats.find((t) => t.key === threatKey);
  if (!src || src.path.length < 2) return [];
  const g = groupLetter(group);
  const count = Math.min(FORMATION_MAX, Math.max(FORMATION_MIN, Math.round(Number(n) || 3)));
  const sp = Number(spacing) > 0 ? Number(spacing) : FORMATION_SPACING_M;
  const members = formationPoints(src.path, count, sp);
  src.group = g;
  const used = new Set(d.threats.map((t) => t.id));
  const ids: string[] = [];
  for (const pts of members) {
    const id = uid(g, used);
    used.add(id);
    ids.push(id);
    d.threats.push({
      key: newKey(),
      id,
      type: src.type,
      group: g,
      ...(src.speedMs == null ? {} : { speedMs: src.speedMs }),
      path: pts.map((p) => ({ key: newKey(), ...p })),
    });
  }
  if (!d.snapshots.length) d.snapshots = [10, Math.round(tmaxS / 2)];
  return ids;
}
