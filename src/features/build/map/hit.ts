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
 * What lies under the pointer `p` within `tolM` metres. `threatPos` gives each threat's position
 * at the current time. Returns null for empty map.
 */
export function hitTest(
  d: Vignette,
  p: XY,
  tolM: number,
  selected: readonly string[],
  threatPos: Map<string, XY>,
): Hit | null {
  const near = (q: XY) => Math.hypot(q.x - p.x, q.y - p.y) <= tolM;
  const systems = [
    ...d.sensors.map((s) => ({ s, target: 'sensor' as const })),
    ...d.effectors.map((s) => ({ s, target: 'effector' as const })),
  ];

  // bearing handles of the selected sectors
  for (const { s, target } of systems)
    if (selected.includes(s.key) && s.fovDeg < 360 && near(bearingHandle(s)))
      return { target, key: s.key, handle: 'bearing' };

  for (const t of d.threats)
    for (const w of t.path) if (near(w)) return { target: 'waypoint', key: w.key, handle: 'move' };

  for (const [key, q] of threatPos) if (near(q)) return { target: 'threat', key, handle: 'move' };

  for (const { s, target } of systems) if (near(s)) return { target, key: s.key, handle: 'move' };
  for (const n of d.nodes) if (near(n)) return { target: 'node', key: n.key, handle: 'move' };

  // sector edges, away from the centre
  for (const { s, target } of systems) {
    if (s.fovDeg >= 360) continue;
    if (Math.hypot(p.x - s.x, p.y - s.y) < 2 * tolM) continue;
    for (const side of [-1, 1]) {
      const e = polar(s.x, s.y, s.rangeM, s.bearingDeg + (side * s.fovDeg) / 2);
      if (segDist(p, s, e) <= tolM) return { target, key: s.key, handle: 'fov' };
    }
  }

  // rings and sector arcs
  for (const { s, target } of systems) {
    const r = Math.hypot(p.x - s.x, p.y - s.y);
    if (Math.abs(r - s.rangeM) > tolM) continue;
    if (s.fovDeg < 360 && angleDiff(bearingTo(s, p), s.bearingDeg) > s.fovDeg / 2) continue;
    return { target, key: s.key, handle: 'range' };
  }

  for (const t of d.threats)
    for (let i = 0; i + 1 < t.path.length; i++)
      if (segDist(p, t.path[i]!, t.path[i + 1]!) <= tolM)
        return { target: 'threat', key: t.key, handle: 'move' };

  for (let i = d.areas.length - 1; i >= 0; i--) {
    const a = d.areas[i]!;
    if (a.pts.length >= 3 && pointInPolygon(p, a.pts))
      return { target: 'area', key: a.key, handle: 'move' };
  }
  return null;
}
