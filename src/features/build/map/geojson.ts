// GeoJSON builders for the map layers. Pure: metres in, longitude and latitude out through the
// frame. Per-record features are cached by record identity: immer keeps an unchanged record the
// same object, so a drag rebuilds only the dragged record's features.
import type { Area, Effector, Node, Sensor, Threat, Vignette } from '../../../domain/types';
import type { TimedPoint } from '../../../engine/geo';
import { posAt } from '../../../engine/geo';
import type { Preview } from '../../../engine/preview';
import type { BoundsM, Frame, LngLat, XY } from './frame';

export type Props = Record<string, string | number | boolean>;
export type Geometry =
  | { type: 'Point'; coordinates: LngLat }
  | { type: 'LineString'; coordinates: LngLat[] }
  | { type: 'Polygon'; coordinates: LngLat[][] };
export type Feature = { type: 'Feature'; geometry: Geometry; properties: Props };
export type FC = { type: 'FeatureCollection'; features: Feature[] };

export const fc = (features: Feature[]): FC => ({ type: 'FeatureCollection', features });

/** Arc points per full circle. */
const CIRCLE_STEPS = 72;

/** The point at range `r` and bearing `b` (degrees clockwise from north) from (cx, cy). */
export function polar(cx: number, cy: number, r: number, b: number): XY {
  const a = (b * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy + r * Math.cos(a) };
}

/** A closed ring of points. */
export function circlePts(cx: number, cy: number, r: number, n = CIRCLE_STEPS): XY[] {
  const out: XY[] = [];
  for (let i = 0; i < n; i++) out.push(polar(cx, cy, r, (360 * i) / n));
  out.push({ ...out[0]! });
  return out;
}

/** A closed sector: centre, arc from bearing - fov/2 to bearing + fov/2, centre. */
export function sectorPts(cx: number, cy: number, r: number, bearingDeg: number, fovDeg: number) {
  const n = Math.max(4, Math.ceil((fovDeg / 360) * CIRCLE_STEPS));
  const out: XY[] = [{ x: cx, y: cy }];
  const b0 = bearingDeg - fovDeg / 2;
  for (let i = 0; i <= n; i++) out.push(polar(cx, cy, r, b0 + (fovDeg * i) / n));
  out.push({ x: cx, y: cy });
  return out;
}

export type ReachShape = {
  x: number;
  y: number;
  rangeM: number;
  fovDeg: number;
  bearingDeg: number;
};

export function reachPts(s: ReachShape): XY[] {
  return s.fovDeg >= 360
    ? circlePts(s.x, s.y, s.rangeM)
    : sectorPts(s.x, s.y, s.rangeM, s.bearingDeg, s.fovDeg);
}

const ll = (f: Frame, p: XY): LngLat => f.toLngLat(p.x, p.y);

export function reachFeature(f: Frame, s: Sensor | Effector, group: 'sensor' | 'effector') {
  const ring = reachPts(s).map((p) => ll(f, p));
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { key: s.key, group, kind: s.kind, omni: s.fovDeg >= 360 },
  } satisfies Feature;
}

export function bodyFeature(f: Frame, r: Sensor | Effector | Node, group: string): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: f.toLngLat(r.x, r.y) },
    properties: { key: r.key, group, kind: r.kind },
  };
}

export function areaFeature(f: Frame, a: Area): Feature {
  const ring = a.pts.map(([x, y]) => f.toLngLat(x, y));
  if (ring.length && ring[0]) ring.push(ring[0]);
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { key: a.key, kind: a.kind },
  };
}

export function pathFeature(f: Frame, t: Threat): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: t.path.map((w) => f.toLngLat(w.x, w.y)) },
    properties: { key: t.key },
  };
}

export function waypointFeatures(f: Frame, t: Threat): Feature[] {
  return t.path.map((w, index) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: f.toLngLat(w.x, w.y) },
    properties: { key: w.key, threat: t.key, index },
  }));
}

/** Position of every threat at time t, from the preview's timed paths. */
export function threatPositions(doc: Vignette, p: Preview, tS: number): Map<string, XY> {
  const out = new Map<string, XY>();
  for (const t of doc.threats) {
    const w: TimedPoint[] | undefined = p.threats[t.key]?.timed;
    if (!w || w.length === 0) continue;
    const q = posAt(w, tS);
    out.set(t.key, { x: q.x, y: q.y });
  }
  return out;
}

export function threatsFeature(f: Frame, pos: Map<string, XY>): FC {
  const out: Feature[] = [];
  for (const [key, q] of pos)
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: f.toLngLat(q.x, q.y) },
      properties: { key },
    });
  return fc(out);
}

/** Keys of the sensors and effectors that cover at least one threat at time t. */
export function coveringAt(p: Preview, tS: number): Set<string> {
  const out = new Set<string>();
  for (const [sys, byThreat] of Object.entries(p.windows))
    for (const ws of Object.values(byThreat))
      if (ws.some((w) => w.tIn <= tS && tS <= w.tOut)) {
        out.add(sys);
        break;
      }
  return out;
}

// ---- cached layer builders ----

/** Per-record feature cache for one frame. Drop it when the site changes. */
export class FeatureCache {
  private one = new WeakMap<object, Feature>();
  private many = new WeakMap<object, Feature[]>();
  private bodies = new WeakMap<object, Feature>();
  constructor(readonly frame: Frame) {}

  reach(s: Sensor | Effector, group: 'sensor' | 'effector'): Feature {
    let x = this.one.get(s);
    if (!x) this.one.set(s, (x = reachFeature(this.frame, s, group)));
    return x;
  }
  body(r: Sensor | Effector | Node, group: string): Feature {
    let x = this.bodies.get(r);
    if (!x) this.bodies.set(r, (x = bodyFeature(this.frame, r, group)));
    return x;
  }
  area(a: Area): Feature {
    let x = this.one.get(a);
    if (!x) this.one.set(a, (x = areaFeature(this.frame, a)));
    return x;
  }
  path(t: Threat): Feature {
    let x = this.one.get(t);
    if (!x) this.one.set(t, (x = pathFeature(this.frame, t)));
    return x;
  }
  waypoints(t: Threat): Feature[] {
    let x = this.many.get(t);
    if (!x) this.many.set(t, (x = waypointFeatures(this.frame, t)));
    return x;
  }
}

export type LayerName = 'areas' | 'sensors' | 'effectors' | 'paths' | 'waypoints' | 'systems';

/** The document arrays each static layer reads. A layer rebuilds only when one of them changes. */
export const LAYER_DEPS: Record<LayerName, (d: Vignette) => readonly unknown[]> = {
  areas: (d) => [d.areas],
  sensors: (d) => [d.sensors],
  effectors: (d) => [d.effectors],
  paths: (d) => [d.threats],
  waypoints: (d) => [d.threats],
  systems: (d) => [d.sensors, d.effectors, d.nodes],
};

export function buildLayer(name: LayerName, d: Vignette, c: FeatureCache): FC {
  switch (name) {
    case 'areas':
      return fc(d.areas.map((a) => c.area(a)));
    case 'sensors':
      return fc(d.sensors.map((s) => c.reach(s, 'sensor')));
    case 'effectors':
      return fc(d.effectors.map((e) => c.reach(e, 'effector')));
    case 'paths':
      return fc(d.threats.map((t) => c.path(t)));
    case 'waypoints':
      return fc(d.threats.flatMap((t) => c.waypoints(t)));
    case 'systems':
      return fc([
        ...d.sensors.map((s) => c.body(s, 'sensor')),
        ...d.effectors.map((e) => c.body(e, 'effector')),
        ...d.nodes.map((n) => c.body(n, 'node')),
      ]);
  }
}

export const LAYER_NAMES: readonly LayerName[] = [
  'areas',
  'sensors',
  'effectors',
  'paths',
  'waypoints',
  'systems',
];

/** The static layers to update between two documents: only those whose arrays changed. */
export function layerUpdates(
  prev: Vignette | null,
  next: Vignette,
  cache: FeatureCache,
): [LayerName, FC][] {
  const out: [LayerName, FC][] = [];
  for (const n of LAYER_NAMES) {
    const deps = LAYER_DEPS[n];
    if (prev) {
      const a = deps(prev);
      const b = deps(next);
      if (a.every((x, i) => x === b[i])) continue;
    }
    out.push([n, buildLayer(n, next, cache)]);
  }
  return out;
}

/** Every static layer at once, for a first load. */
export function buildAll(d: Vignette, c: FeatureCache): Record<LayerName, FC> {
  const out = {} as Record<LayerName, FC>;
  for (const n of LAYER_NAMES) out[n] = buildLayer(n, d, c);
  return out;
}

/** Selection and hover outlines: the record geometry tagged with its role. */
export function highlightFeature(
  d: Vignette,
  c: FeatureCache,
  selected: readonly string[],
  hover: string | null,
): FC {
  const out: Feature[] = [];
  const add = (key: string, role: 'selected' | 'hover') => {
    for (const g of featuresOf(d, c, key))
      out.push({ ...g, properties: { ...g.properties, role } });
  };
  if (hover && !selected.includes(hover)) add(hover, 'hover');
  for (const k of selected) add(k, 'selected');
  return fc(out);
}

function featuresOf(d: Vignette, c: FeatureCache, key: string): Feature[] {
  for (const t of d.threats) {
    if (t.key === key) return [c.path(t)];
    const w = c.waypoints(t).find((x) => x.properties.key === key);
    if (w) return [w];
  }
  const s = d.sensors.find((x) => x.key === key);
  if (s) return [c.reach(s, 'sensor'), c.body(s, 'sensor')];
  const e = d.effectors.find((x) => x.key === key);
  if (e) return [c.reach(e, 'effector'), c.body(e, 'effector')];
  const n = d.nodes.find((x) => x.key === key);
  if (n) return [c.body(n, 'node')];
  const a = d.areas.find((x) => x.key === key);
  if (a) return [c.area(a)];
  return [];
}

/** Where the bearing handle of a sector sits: half range along the bearing. */
export function bearingHandle(s: ReachShape): XY {
  return polar(s.x, s.y, s.rangeM / 2, s.bearingDeg);
}

/** Handles of the selected sectors: the bearing handle with its stem, and the two edge ends. */
export function handleFeatures(f: Frame, d: Vignette, selected: readonly string[]): FC {
  const out: Feature[] = [];
  for (const s of [...d.sensors, ...d.effectors]) {
    if (!selected.includes(s.key) || s.fovDeg >= 360) continue;
    const h = bearingHandle(s);
    out.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [f.toLngLat(s.x, s.y), ll(f, h)] },
      properties: { key: s.key, handle: 'stem' },
    });
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ll(f, h) },
      properties: { key: s.key, handle: 'bearing' },
    });
    for (const side of [-1, 1]) {
      const e = polar(s.x, s.y, s.rangeM, s.bearingDeg + (side * s.fovDeg) / 2);
      out.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: ll(f, e) },
        properties: { key: s.key, handle: 'fov' },
      });
    }
  }
  return fc(out);
}

// ---- grid ----

const GRID_STEPS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
/** Minimum screen spacing of grid lines. */
const GRID_MIN_PX = 28;

/** Line spacing for a scale: 500 m at the working zoom, coarser or finer as the view changes. */
export function gridStep(mPerPx: number): number {
  for (const s of GRID_STEPS) if (s / mPerPx >= GRID_MIN_PX) return s;
  return GRID_STEPS[GRID_STEPS.length - 1]!;
}

export type GridLabel = { axis: 'x' | 'y'; value: number; text: string };

/** Grid lines over the visible bounds, labels every second line (every 1 km at 500 m lines). */
export function gridFeatures(f: Frame, b: BoundsM, mPerPx: number) {
  const step = gridStep(mPerPx);
  const labelStep = step * 2;
  const lines: Feature[] = [];
  const labels: GridLabel[] = [];
  const x0 = Math.floor(b[0] / step) * step;
  const y0 = Math.floor(b[1] / step) * step;
  for (let x = x0; x <= b[2]; x += step) {
    const major = Math.abs(x % labelStep) < 1e-6;
    lines.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [f.toLngLat(x, b[1]), f.toLngLat(x, b[3])] },
      properties: { major, origin: Math.abs(x) < 1e-6 },
    });
    if (major) labels.push({ axis: 'x', value: x, text: gridText(x, 'E', 'W') });
  }
  for (let y = y0; y <= b[3]; y += step) {
    const major = Math.abs(y % labelStep) < 1e-6;
    lines.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [f.toLngLat(b[0], y), f.toLngLat(b[2], y)] },
      properties: { major, origin: Math.abs(y) < 1e-6 },
    });
    if (major) labels.push({ axis: 'y', value: y, text: gridText(y, 'N', 'S') });
  }
  return { lines: fc(lines), labels, step };
}

function gridText(v: number, pos: string, neg: string): string {
  if (Math.abs(v) < 1e-6) return '0 km';
  const km = Math.abs(v) / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km ${v > 0 ? pos : neg}`;
}

/** Bounds of every asset in metres, or null when the vignette is empty. */
export function assetBounds(d: Vignette): BoundsM | null {
  let b: BoundsM | null = null;
  const add = (x: number, y: number, r = 0) => {
    if (!b) b = [x - r, y - r, x + r, y + r];
    else
      b = [
        Math.min(b[0], x - r),
        Math.min(b[1], y - r),
        Math.max(b[2], x + r),
        Math.max(b[3], y + r),
      ];
  };
  for (const t of d.threats) for (const w of t.path) add(w.x, w.y);
  for (const s of [...d.sensors, ...d.effectors]) add(s.x, s.y, s.rangeM);
  for (const n of d.nodes) add(n.x, n.y);
  for (const a of d.areas) for (const [x, y] of a.pts) add(x, y);
  return b;
}
