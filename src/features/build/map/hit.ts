// Hit test in map metres. MapLibre feature queries need WebGL, so the map tests its own
// geometry: handles first, then points, then edges, then area interiors.
import type { Vignette } from '../../../domain/types';
import { angleDiff, bearingTo, pointInPolygon } from '../../../engine/geo';
import type { XY } from './frame';
import { bearingHandle, polar } from './geojson';
import type { HandleKind, TargetKind } from './handles';

export type Hit = { target: TargetKind; key: string; handle: HandleKind };

function segDist(p: XY, a: XY, b: XY): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  const f = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
  return Math.hypot(a.x + f * vx - p.x, a.y + f * vy - p.y);
}

/**
 * Everything under the pointer `p` within `tolM` metres, top-most first, one hit per target key
 * (its highest handle). Order: bearing handles, points (waypoints, threats, systems, nodes),
 * sector edges, rings and arcs, path segments, then area interiors, top area first. A ring or
 * edge sits above an area interior only within `tolM` of it. `threatPos` gives each threat's
 * position at the current time.
 */
export function hitAll(
  d: Vignette,
  p: XY,
  tolM: number,
  selected: readonly string[],
  threatPos: Map<string, XY>,
): Hit[] {
  const out: Hit[] = [];
  const seen = new Set<string>();
  const add = (h: Hit) => {
    if (seen.has(h.key)) return;
    seen.add(h.key);
    out.push(h);
  };
  const near = (q: XY) => Math.hypot(q.x - p.x, q.y - p.y) <= tolM;
  const systems = [
    ...d.sensors.map((s) => ({ s, target: 'sensor' as const })),
    ...d.effectors.map((s) => ({ s, target: 'effector' as const })),
  ];

  // bearing handles of the selected sectors
  for (const { s, target } of systems)
    if (selected.includes(s.key) && s.fovDeg < 360 && near(bearingHandle(s)))
      add({ target, key: s.key, handle: 'bearing' });

  for (const t of d.threats)
    for (const w of t.path) if (near(w)) add({ target: 'waypoint', key: w.key, handle: 'move' });

  for (const [key, q] of threatPos) if (near(q)) add({ target: 'threat', key, handle: 'move' });

  for (const { s, target } of systems) if (near(s)) add({ target, key: s.key, handle: 'move' });
  for (const n of d.nodes) if (near(n)) add({ target: 'node', key: n.key, handle: 'move' });

  // sector edges, away from the centre
  for (const { s, target } of systems) {
    if (s.fovDeg >= 360) continue;
    if (Math.hypot(p.x - s.x, p.y - s.y) < 2 * tolM) continue;
    for (const side of [-1, 1]) {
      const e = polar(s.x, s.y, s.rangeM, s.bearingDeg + (side * s.fovDeg) / 2);
      if (segDist(p, s, e) <= tolM) {
        add({ target, key: s.key, handle: 'fov' });
        break;
      }
    }
  }

  // rings and sector arcs
  for (const { s, target } of systems) {
    const r = Math.hypot(p.x - s.x, p.y - s.y);
    if (Math.abs(r - s.rangeM) > tolM) continue;
    if (s.fovDeg < 360 && angleDiff(bearingTo(s, p), s.bearingDeg) > s.fovDeg / 2) continue;
    add({ target, key: s.key, handle: 'range' });
  }

  for (const t of d.threats)
    for (let i = 0; i + 1 < t.path.length; i++)
      if (segDist(p, t.path[i]!, t.path[i + 1]!) <= tolM) {
        add({ target: 'threat', key: t.key, handle: 'move' });
        break;
      }

  for (let i = d.areas.length - 1; i >= 0; i--) {
    const a = d.areas[i]!;
    if (a.pts.length >= 3 && pointInPolygon(p, a.pts))
      add({ target: 'area', key: a.key, handle: 'move' });
  }
  return out;
}

const isPoint = (h: Hit) => h.handle === 'move' && h.target !== 'area';

/**
 * The hit a press acts on: a selected point target in the stack under the pointer, so a drag or
 * a right-click acts on what a repeat click picked, else the top-most hit.
 */
export function pickHit(hits: readonly Hit[], selected: readonly string[]): Hit | null {
  const top = hits[0] ?? null;
  if (!top || !isPoint(top)) return top;
  return hits.find((h) => isPoint(h) && selected.includes(h.key)) ?? top;
}

/**
 * A repeat click on a stack: the hit after the single selected one, wrapping to the top. Null
 * when fewer than two targets lie under the pointer or the selection is not one of them.
 */
export function nextHit(hits: readonly Hit[], selected: readonly string[]): Hit | null {
  if (hits.length < 2 || selected.length !== 1) return null;
  const i = hits.findIndex((h) => h.key === selected[0]);
  return i < 0 ? null : hits[(i + 1) % hits.length]!;
}
