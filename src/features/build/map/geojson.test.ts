import { produce } from 'immer';
import { testVignette } from '../../../engine/testVignette';
import { makeFrame } from './frame';
import {
  FeatureCache,
  assetBounds,
  buildAll,
  circlePts,
  gridFeatures,
  gridStep,
  handleFeatures,
  highlightFeature,
  sectorPts,
  type Feature,
} from './geojson';

const f = makeFrame({ lat: 35, lon: -117 });
const toM = (c: [number, number]) => f.fromLngLat(c[0], c[1]);
const ringOf = (x: Feature) =>
  x.geometry.type === 'Polygon' ? x.geometry.coordinates[0]!.map(toM) : [];

describe('geometry', () => {
  it('builds a closed ring at the range', () => {
    const pts = circlePts(100, 200, 1000);
    expect(pts[0]).toEqual(pts[pts.length - 1]);
    for (const p of pts) expect(Math.hypot(p.x - 100, p.y - 200)).toBeCloseTo(1000, 6);
  });

  it('builds a sector from the centre along bearing - fov/2 to bearing + fov/2', () => {
    const pts = sectorPts(0, 0, 1000, 90, 60);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 0, y: 0 });
    const first = pts[1]!;
    const last = pts[pts.length - 2]!;
    // 060 and 120 degrees clockwise from north
    expect(first.x).toBeCloseTo(1000 * Math.sin(Math.PI / 3), 6);
    expect(first.y).toBeCloseTo(1000 * Math.cos(Math.PI / 3), 6);
    expect(last.y).toBeCloseTo(-500, 6);
    for (const p of pts.slice(1, -1)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1000, 6);
  });
});

describe('layer builders', () => {
  const v = testVignette();
  v.sensors[1]!.fovDeg = 30;
  v.sensors[1]!.bearingDeg = 45;
  const c = new FeatureCache(f);
  const all = buildAll(v, c);

  it('builds one reach per sensor and effector, omni as a ring and sectors as a wedge', () => {
    expect(all.sensors.features).toHaveLength(2);
    expect(all.effectors.features).toHaveLength(1);
    const omni = ringOf(all.sensors.features[0]!);
    for (const p of omni) expect(Math.hypot(p.x, p.y)).toBeCloseTo(5000, 3);
    const sector = ringOf(all.sensors.features[1]!);
    expect(sector[0]!.x).toBeCloseTo(50, 3);
    expect(all.sensors.features[1]!.properties.omni).toBe(false);
  });

  it('builds paths, waypoints and closed areas', () => {
    expect(all.paths.features).toHaveLength(2);
    expect(all.paths.features[0]!.geometry.type).toBe('LineString');
    expect(all.waypoints.features).toHaveLength(4);
    expect(all.waypoints.features[0]!.properties).toMatchObject({ threat: 'k-T-01', index: 0 });
    const ring = ringOf(all.areas.features[0]!);
    expect(ring).toHaveLength(5);
    expect(ring[0]!.x).toBeCloseTo(-100, 6);
    expect(ring[4]!.x).toBeCloseTo(ring[0]!.x, 9);
    expect(all.systems.features).toHaveLength(4); // 2 sensors, 1 effector, 1 node
  });

  it('reuses features of unchanged records', () => {
    const next = produce(v, (d) => {
      d.sensors[0]!.rangeM = 6000;
    });
    const again = buildAll(next, c);
    expect(again.sensors.features[1]).toBe(all.sensors.features[1]);
    expect(again.sensors.features[0]).not.toBe(all.sensors.features[0]);
    expect(again.paths.features[0]).toBe(all.paths.features[0]);
  });

  it('tags selection and hover, and gives handles to selected sectors only', () => {
    const h = highlightFeature(v, c, ['k-S-02'], 'k-T-01');
    expect(h.features.map((x) => x.properties.role)).toEqual(['hover', 'selected', 'selected']);
    const hs = handleFeatures(f, v, ['k-S-01', 'k-S-02']);
    expect(hs.features.map((x) => x.properties.handle)).toEqual(['stem', 'bearing', 'fov', 'fov']);
  });

  it('bounds every asset including reach', () => {
    expect(assetBounds(v)).toEqual([-5000, -5000, 5000, 6000]);
  });
});

describe('grid', () => {
  it('draws 500 m lines with labels every 1 km at the working scale', () => {
    expect(gridStep(10)).toBe(500);
    const g = gridFeatures(f, [-1000, -1000, 1000, 1000], 10);
    expect(g.step).toBe(500);
    expect(g.lines.features).toHaveLength(10);
    expect(g.labels.map((l) => l.text)).toContain('1 km E');
    expect(g.labels.filter((l) => l.axis === 'x')).toHaveLength(3);
  });

  it('adapts the spacing to the zoom', () => {
    expect(gridStep(1)).toBe(100);
    expect(gridStep(100)).toBe(5000);
  });
});
