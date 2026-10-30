import { testVignette } from '../../../engine/testVignette';
import { hitAll, nextHit, pickHit, type Hit } from './hit';

const none = new Map();
const keys = (hs: Hit[]) => hs.map((h) => h.key);

describe('stacked hits (FR-01)', () => {
  // S-01 (radar) and E-01 (effector) share the origin; the node sits 42 m away; the defended
  // asset A-01 covers all three. No threats, so no path runs through the origin.
  const v = testVignette({ threats: [] });

  it('lists every target under the pointer, top-most first, one hit per key', () => {
    const hs = hitAll(v, { x: 2, y: 1 }, 10, [], none);
    expect(keys(hs)).toEqual(['k-S-01', 'k-E-01', 'k-A-01']);
    expect(hs.map((h) => h.handle)).toEqual(['move', 'move', 'move']);
  });

  it('a repeat click cycles through the stack and wraps to the top', () => {
    const hs = hitAll(v, { x: 0, y: 0 }, 10, [], none);
    expect(nextHit(hs, ['k-S-01'])!.key).toBe('k-E-01');
    expect(nextHit(hs, ['k-E-01'])!.key).toBe('k-A-01');
    expect(nextHit(hs, ['k-A-01'])!.key).toBe('k-S-01');
    // no cycle for a single target, a selection outside the stack, or a multi-selection
    expect(nextHit(hs.slice(0, 1), ['k-S-01'])).toBeNull();
    expect(nextHit(hs, ['k-S-02'])).toBeNull();
    expect(nextHit(hs, ['k-S-01', 'k-E-01'])).toBeNull();
  });

  it('a press acts on the selected point target in the stack, else the top-most', () => {
    const hs = hitAll(v, { x: 0, y: 0 }, 10, [], none);
    expect(pickHit(hs, [])!.key).toBe('k-S-01');
    expect(pickHit(hs, ['k-E-01'])!.key).toBe('k-E-01');
    // a selected area under a point stack does not take the press from the points
    expect(pickHit(hs, ['k-A-01'])!.key).toBe('k-S-01');
    expect(pickHit([], ['k-E-01'])).toBeNull();
  });

  it('a ring or edge is not displaced by a selected point elsewhere in the stack', () => {
    // on the radar ring due south, inside nothing else
    const hs = hitAll(v, { x: 0, y: -4995 }, 10, [], none);
    expect(hs[0]).toMatchObject({ key: 'k-S-01', handle: 'range' });
    expect(pickHit(hs, ['k-S-01'])).toBe(hs[0]);
  });
});

describe('area interiors (FR-05)', () => {
  // A-01 is a 200 m square at the origin; give it a ring running through it and a second area.
  const v = testVignette({ threats: [] });
  v.sensors[1]!.x = 0;
  v.sensors[1]!.rangeM = 80; // S-02's ring crosses A-01 at 80 m
  v.areas.push({
    ...v.areas[0]!,
    key: 'k-A-02',
    id: 'WEZ-1',
    kind: 'wez',
    pts: [
      [50, 50],
      [400, 50],
      [400, 400],
      [50, 400],
    ],
  });

  it('selects an area from inside, away from points and rings', () => {
    expect(hitAll(v, { x: -40, y: 40 }, 10, [], none)[0]).toMatchObject({
      target: 'area',
      key: 'k-A-01',
    });
    // inside a sensor's reach but off its ring: the reach is not a target, the area is
    expect(hitAll(v, { x: 300, y: 300 }, 10, [], none)[0]).toMatchObject({ key: 'k-A-02' });
  });

  it('puts a ring above the area only within tolerance of the ring', () => {
    const onRing = hitAll(v, { x: -80, y: 3 }, 10, [], none);
    expect(onRing[0]).toMatchObject({ key: 'k-S-02', handle: 'range' });
    expect(keys(onRing)).toContain('k-A-01');
    // so a repeat click on the ring reaches the area beneath it
    expect(nextHit(onRing, ['k-S-02'])!.key).toBe('k-A-01');
    expect(hitAll(v, { x: -65, y: 3 }, 10, [], none)[0]).toMatchObject({ key: 'k-A-01' });
  });

  it('orders overlapping areas top (last drawn) first', () => {
    expect(keys(hitAll(v, { x: 75, y: 75 }, 10, [], none))).toEqual(['k-A-02', 'k-A-01']);
  });

  it('keeps handles, points and edges above an area interior', () => {
    const s = v.sensors[1]!;
    s.fovDeg = 90;
    s.bearingDeg = 90;
    s.rangeM = 1000;
    // S-02 is now a selected sector at the origin: its body stays a point above the area
    const order = keys(hitAll(v, { x: 0, y: 0 }, 10, ['k-S-02'], none));
    expect(order.slice(0, 3)).toEqual(['k-S-01', 'k-S-02', 'k-E-01']);
    expect(order.at(-1)).toBe('k-A-01');
  });
});
