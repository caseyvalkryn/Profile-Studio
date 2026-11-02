import type { Card } from '../../domain/types';
import { ORBIT, ZOOM_MAX, orbitBy, panBy, zoomAt, zoomText } from './stageFrame';
import { testDeck } from './testDeck';

const SZ = { W: 800, H: 600 };
const deck = () => testDeck();
const plan = (v = deck()): Card => v.cards[0]!;

describe('stage frame maths', () => {
  it('a zoom about the stage middle keeps the centre; one about a corner moves it toward the corner', () => {
    const v = deck();
    const mid = zoomAt(v, plan(v), SZ, 2, SZ.W / 2, SZ.H / 2)!;
    expect(mid.zoom).toBe(2);
    expect(mid.centre).toEqual({ x: 0, y: 0 });
    const corner = zoomAt(v, plan(v), SZ, 2, 0, 0)!;
    expect(corner.centre.x).toBeLessThan(0);
    // screen y runs down, plan y runs north: the top-left corner is north-west of the middle
    expect(corner.centre.y).toBeGreaterThan(0);
  });

  it('zooming out again about the same corner returns to the fitted frame', () => {
    const v = deck();
    const c = { ...plan(v), view: { ...plan(v).view, ...zoomAt(v, plan(v), SZ, 2, 0, 0)! } };
    const back = zoomAt(v, c, SZ, 0.5, 0, 0)!;
    expect(back.zoom).toBe(1);
    expect(Math.abs(back.centre.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.centre.y)).toBeLessThanOrEqual(1);
  });

  it('clamps at the zoom limits and returns null at a limit', () => {
    const v = deck();
    expect(zoomAt(v, plan(v), SZ, 100, 0, 0)!.zoom).toBe(ZOOM_MAX);
    const at = { ...plan(v), view: { ...plan(v).view, zoom: ZOOM_MAX } };
    expect(zoomAt(v, at, SZ, 2, 0, 0)).toBeNull();
  });

  it('a 3D card zooms and pans on the ground plane: a zoom about the middle keeps the centre, a corner zoom moves it', () => {
    const v = deck();
    const c = v.cards[1]!;
    const mid = zoomAt(v, c, SZ, 2, SZ.W / 2, SZ.H / 2)!;
    expect(mid).toEqual({ zoom: 2, centre: { x: 0, y: 0 } });
    const corner = zoomAt(v, c, SZ, 2, 0, 0)!;
    expect(corner.centre).not.toEqual({ x: 0, y: 0 });
    const back = zoomAt(v, { ...c, view: { ...c.view, ...corner } }, SZ, 0.5, 0, 0)!;
    expect(back.zoom).toBe(1);
    expect(Math.abs(back.centre.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.centre.y)).toBeLessThanOrEqual(1);
    const p = panBy(v, c, SZ, 100, 0)!;
    expect(p.centre).not.toEqual({ x: 0, y: 0 });
    // the pan undone by the opposite drag
    const q = panBy(v, { ...c, view: { ...c.view, ...p } }, SZ, -100, 0)!;
    expect(Math.abs(q.centre.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(q.centre.y)).toBeLessThanOrEqual(1);
  });

  it('a drag to the right and down moves the centre west and north by the pixels in metres', () => {
    const v = deck();
    const p = panBy(v, plan(v), SZ, 100, 50)!;
    expect(p.zoom).toBe(1);
    expect(p.centre.x).toBeLessThan(0);
    expect(p.centre.y).toBeGreaterThan(0);
    // the same drag at zoom 2 moves half the metres
    const z2 = { ...plan(v), view: { ...plan(v).view, zoom: 2 } };
    expect(panBy(v, z2, SZ, 100, 50)!.centre.x).toBeCloseTo(p.centre.x / 2, -1);
  });

  it('orbit: the board rates, the pitch clamped', () => {
    expect(orbitBy({ yawDeg: -35, pitchDeg: 55 }, 100, -100)).toEqual({
      yawDeg: -35 + 100 * ORBIT.yaw,
      pitchDeg: Math.min(ORBIT.pitchMax, 55 + 100 * ORBIT.pitch),
    });
    expect(orbitBy({ yawDeg: 0, pitchDeg: 10 }, 0, 100).pitchDeg).toBe(ORBIT.pitchMin);
    expect(zoomText(2.5)).toBe('x2.5');
    expect(zoomText(1.004)).toBe('x1');
  });
});
