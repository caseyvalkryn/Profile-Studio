// Handle math (spec section 8, Handles). Pure: the drag start, the pointer in map metres and the
// modifiers give the new value and an immer recipe. Each recipe sets values from the drag start,
// never adds to the live value, so a drag does not drift. Alt disables snap.
import { angleDiff, bearingTo } from '../../../engine/geo';
import type { Recipe } from '../../../state/document';
import type { Units } from '../../../state/ui';
import { find } from '../../../commands/select';
import type { XY } from './frame';
import { formatAltitude, formatAngle, formatBearing, formatRange } from '../../shared/units';

export const SNAP = { gridM: 10, bearingDeg: 1, fovDeg: 5, altitudeM: 10 } as const;
/** Altitude change per screen pixel of a Shift-drag. */
export const ALT_M_PER_PX = 2;
const MIN_RANGE_M = 10;
const MIN_FOV_DEG = 5;
const MAX_FOV_DEG = 355;

export const snap = (v: number, step: number, alt: boolean) =>
  alt ? v : Math.round(v / step) * step;

const norm360 = (d: number) => ((d % 360) + 360) % 360;

export type Centre = { x: number; y: number };
export type Aimed = Centre & { bearingDeg: number };

export function rangeFromDrag(s: Centre, p: XY, alt: boolean): number {
  return Math.max(MIN_RANGE_M, snap(Math.hypot(p.x - s.x, p.y - s.y), SNAP.gridM, alt));
}

/** Field of view, symmetric about the bearing: twice the angle from the bearing to the pointer. */
export function fovFromDrag(s: Aimed, p: XY, alt: boolean): number {
  const v = snap(2 * angleDiff(bearingTo(s, p), s.bearingDeg), SNAP.fovDeg, alt);
  return Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, v));
}

export function bearingFromDrag(s: Centre, p: XY, alt: boolean): number {
  return norm360(snap(bearingTo(s, p), SNAP.bearingDeg, alt));
}

/** The moved position: the start position plus the pointer delta, snapped to the grid. */
export function moveFromDrag(start: XY, from: XY, p: XY, alt: boolean): XY {
  return {
    x: snap(start.x + (p.x - from.x), SNAP.gridM, alt),
    y: snap(start.y + (p.y - from.y), SNAP.gridM, alt),
  };
}

/** Shift-drag altitude: up on screen is higher. Never below ground. */
export function altitudeFromDrag(z0: number, dyPx: number, alt: boolean): number {
  return Math.max(0, snap(z0 - dyPx * ALT_M_PER_PX, SNAP.altitudeM, alt));
}

export type HandleKind = 'range' | 'fov' | 'bearing' | 'move' | 'altitude';
export type TargetKind = 'threat' | 'waypoint' | 'sensor' | 'effector' | 'node' | 'area';

/** A drag in progress: what was grabbed, where, and the record as it was at the start. */
export type DragStart = {
  handle: HandleKind;
  target: TargetKind;
  key: string;
  from: XY; // pointer at the start, map metres
  fromPx: { x: number; y: number }; // pointer at the start, screen pixels
  /** Snapshot of the grabbed geometry at the start. */
  base: {
    x: number;
    y: number;
    z: number;
    rangeM: number;
    fovDeg: number;
    bearingDeg: number;
    pts: [number, number][];
    path: { key: string; x: number; y: number }[];
  };
};

export type DragStep = { recipe: Recipe; label: string };

export const DRAG_LABELS: Record<HandleKind, string> = {
  range: 'Set range',
  fov: 'Set field of view',
  bearing: 'Rotate',
  move: 'Move',
  altitude: 'Set altitude',
};

/** One pointer move of a drag: the recipe to apply and the value to show beside the cursor. */
export function dragStep(
  d: DragStart,
  p: XY,
  px: { x: number; y: number },
  alt: boolean,
  units: Units,
): DragStep {
  const b = d.base;
  const key = d.key;
  switch (d.handle) {
    case 'range': {
      const r = rangeFromDrag(b, p, alt);
      return { recipe: sys(key, (s) => (s.rangeM = r)), label: formatRange(r, units) };
    }
    case 'fov': {
      const v = fovFromDrag(b, p, alt);
      return { recipe: sys(key, (s) => (s.fovDeg = v)), label: `FOV ${formatAngle(v)}` };
    }
    case 'bearing': {
      const v = bearingFromDrag(b, p, alt);
      return { recipe: sys(key, (s) => (s.bearingDeg = v)), label: formatBearing(v) };
    }
    case 'altitude': {
      const z = altitudeFromDrag(b.z, px.y - d.fromPx.y, alt);
      const recipe: Recipe = (doc) => {
        const f = find(doc, key);
        if (f?.kind === 'waypoint') f.value.z = z;
      };
      return { recipe, label: formatAltitude(z, units) };
    }
    case 'move': {
      const q = moveFromDrag(b, d.from, p, alt);
      const dx = q.x - b.x;
      const dy = q.y - b.y;
      const recipe: Recipe = (doc) => {
        const f = find(doc, key);
        if (!f) return;
        if (f.kind === 'area') f.value.pts = b.pts.map(([x, y]) => [x + dx, y + dy]);
        else if (f.kind === 'threat')
          f.value.path.forEach((w, i) => {
            const w0 = b.path[i];
            if (w0) {
              w.x = w0.x + dx;
              w.y = w0.y + dy;
            }
          });
        else {
          f.value.x = q.x;
          f.value.y = q.y;
        }
      };
      return {
        recipe,
        label: `${formatRange(Math.hypot(q.x, q.y), units)} ${formatBearing(bearingTo({ x: 0, y: 0 }, q))}`,
      };
    }
  }
}

function sys(key: string, fn: (s: { rangeM: number; fovDeg: number; bearingDeg: number }) => void) {
  const recipe: Recipe = (doc) => {
    const f = find(doc, key);
    if (f && (f.kind === 'sensor' || f.kind === 'effector')) fn(f.value);
  };
  return recipe;
}

/** The drag that a press on `hit` starts. Shift on a waypoint drags altitude instead of position. */
export function startDrag(
  doc: Parameters<typeof find>[0],
  hit: { target: TargetKind; key: string; handle: HandleKind },
  from: XY,
  fromPx: { x: number; y: number },
  shift: boolean,
): DragStart | null {
  const f = find(doc, hit.key);
  if (!f) return null;
  const handle: HandleKind =
    hit.target === 'waypoint' && shift && hit.handle === 'move' ? 'altitude' : hit.handle;
  const base: DragStart['base'] = {
    x: 0,
    y: 0,
    z: 0,
    rangeM: 0,
    fovDeg: 360,
    bearingDeg: 0,
    pts: [],
    path: [],
  };
  if (f.kind === 'area') {
    base.pts = f.value.pts.map(([x, y]) => [x, y]);
    base.x = base.pts[0]?.[0] ?? 0;
    base.y = base.pts[0]?.[1] ?? 0;
  } else if (f.kind === 'threat') {
    base.path = f.value.path.map((w) => ({ key: w.key, x: w.x, y: w.y }));
    base.x = base.path[0]?.x ?? 0;
    base.y = base.path[0]?.y ?? 0;
  } else {
    base.x = f.value.x;
    base.y = f.value.y;
    base.z = f.value.z;
    if (f.kind === 'sensor' || f.kind === 'effector') {
      base.rangeM = f.value.rangeM;
      base.fovDeg = f.value.fovDeg;
      base.bearingDeg = f.value.bearingDeg;
    }
  }
  return { handle, target: hit.target, key: hit.key, from, fromPx, base };
}
