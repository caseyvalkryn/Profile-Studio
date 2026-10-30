// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  angleDiffDeg,
  bearingDeg,
  destination,
  dist,
  formatDistance,
  formatSpeed,
  formationOffsets,
  gridStepM,
  pathLength,
  pointInSector,
  pointInWedge,
  posAlongPath,
  posAtTime,
  rotatePoint,
  wedgePoints,
} from './geo';

const O = { x: 0, y: 0 };

describe('bearing and destination', () => {
  it('computes cardinal bearings (north = 0, clockwise, +y south)', () => {
    expect(bearingDeg(O, { x: 0, y: -100 })).toBeCloseTo(0);
    expect(bearingDeg(O, { x: 100, y: 0 })).toBeCloseTo(90);
    expect(bearingDeg(O, { x: 0, y: 100 })).toBeCloseTo(180);
    expect(bearingDeg(O, { x: -100, y: 0 })).toBeCloseTo(270);
  });

  it('destination inverts bearing', () => {
    const p = destination(O, 37, 1234);
    expect(bearingDeg(O, p)).toBeCloseTo(37);
    expect(dist(O, p)).toBeCloseTo(1234);
  });
});

describe('angleDiffDeg', () => {
  it('wraps across north', () => {
    expect(angleDiffDeg(350, 10)).toBeCloseTo(20);
    expect(angleDiffDeg(10, 350)).toBeCloseTo(20);
    expect(angleDiffDeg(180, 0)).toBeCloseTo(180);
  });
});

describe('pointInSector', () => {
  it('rejects points beyond range', () => {
    expect(pointInSector(O, 0, 90, 1000, { x: 0, y: -1001 })).toBe(false);
    expect(pointInSector(O, 0, 90, 1000, { x: 0, y: -999 })).toBe(true);
  });

  it('respects sector edges', () => {
    // Heading north, 90 deg sector: covers bearings 315..45.
    expect(pointInSector(O, 0, 90, 1000, destination(O, 44, 500))).toBe(true);
    expect(pointInSector(O, 0, 90, 1000, destination(O, 46, 500))).toBe(false);
    expect(pointInSector(O, 0, 90, 1000, destination(O, 316, 500))).toBe(true);
  });

  it('treats 360 as full circle', () => {
    expect(pointInSector(O, 0, 360, 1000, { x: 500, y: 500 })).toBe(true);
  });

  it('pointInWedge tests bearing only, at any range', () => {
    expect(pointInWedge(O, 0, 90, { x: 0, y: -1e9 })).toBe(true);
    expect(pointInWedge(O, 0, 90, destination(O, 46, 500))).toBe(false);
    expect(pointInWedge(O, 0, 360, { x: 500, y: 500 })).toBe(true);
  });
});

describe('wedgePoints', () => {
  it('starts at center and spans the sector at the given range', () => {
    const pts = wedgePoints(O, 90, 60, 1000, 4);
    expect(pts[0]).toBe(0);
    expect(pts[1]).toBe(0);
    for (let i = 2; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i]!, pts[i + 1]!)).toBeCloseTo(1000);
    }
    const first = { x: pts[2]!, y: pts[3]! };
    const last = { x: pts[pts.length - 2]!, y: pts[pts.length - 1]! };
    expect(bearingDeg(O, first)).toBeCloseTo(60);
    expect(bearingDeg(O, last)).toBeCloseTo(120);
  });
});

describe('paths', () => {
  const square: { x: number; y: number }[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('measures length', () => {
    expect(pathLength(square)).toBeCloseTo(200);
  });

  it('interpolates along segments', () => {
    const s = posAlongPath(square, 150);
    expect(s.pos.x).toBeCloseTo(100);
    expect(s.pos.y).toBeCloseTo(50);
    expect(s.headingDeg).toBeCloseTo(180);
    expect(s.done).toBe(false);
  });

  it('clamps at the end', () => {
    const s = posAlongPath(square, 500);
    expect(s.pos).toEqual({ x: 100, y: 100 });
    expect(s.done).toBe(true);
  });

  it('honors speed and start delay', () => {
    const s = posAtTime(square, 10, 5, 10);
    expect(s.pos.x).toBeCloseTo(50);
    expect(s.pos.y).toBeCloseTo(0);
  });
});

describe('rotatePoint', () => {
  it('rotates clockwise on screen about a center', () => {
    // North of center rotated 90 deg -> east of center.
    const p = rotatePoint({ x: 0, y: -100 }, O, 90);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
  });

  it('keeps distance and returns the center unchanged', () => {
    const c = { x: 50, y: -20 };
    const p = rotatePoint({ x: 90, y: 10 }, c, 137);
    expect(dist(c, p)).toBeCloseTo(dist(c, { x: 90, y: 10 }));
    expect(rotatePoint(c, c, 90)).toEqual(c);
  });
});

describe('formationOffsets', () => {
  it('puts the lead at the origin and returns one offset per ship', () => {
    for (const shape of ['line', 'wedge', 'column', 'echelon', 'cluster'] as const) {
      const offs = formationOffsets(shape, 5, 50, 45);
      expect(offs).toHaveLength(5);
      expect(offs[0]!.x).toBeCloseTo(0);
      expect(offs[0]!.y).toBeCloseTo(0);
    }
  });

  it('column trails the lead opposite the heading', () => {
    // Heading north: trailers sit south (+y).
    const offs = formationOffsets('column', 3, 100, 0);
    expect(offs[1]!.x).toBeCloseTo(0);
    expect(offs[1]!.y).toBeCloseTo(100);
    expect(offs[2]!.y).toBeCloseTo(200);
  });

  it('line spreads abreast, perpendicular to the heading', () => {
    // Heading north: wingmen sit east/west of the lead.
    const offs = formationOffsets('line', 3, 100, 0);
    expect(offs[1]!.x).toBeCloseTo(100);
    expect(offs[1]!.y).toBeCloseTo(0);
    expect(offs[2]!.x).toBeCloseTo(-100);
  });

  it('wedge trails behind and outboard', () => {
    const offs = formationOffsets('wedge', 3, 100, 0);
    expect(offs[1]!.y).toBeCloseTo(100);
    expect(offs[1]!.x).toBeCloseTo(100);
    expect(offs[2]!.y).toBeCloseTo(100);
    expect(offs[2]!.x).toBeCloseTo(-100);
  });

  it('cluster stays within ring radius for the count', () => {
    const offs = formationOffsets('cluster', 7, 50, 90);
    for (const o of offs) {
      expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(50 + 1e-9);
    }
  });

  it('clamps count to at least one', () => {
    expect(formationOffsets('line', 0, 50, 0)).toHaveLength(1);
  });
});

describe('grid and formatting', () => {
  it('picks 1-2-5 steps', () => {
    expect(gridStepM(0.1)).toBe(1000);
    expect(gridStepM(1)).toBe(100);
    expect(gridStepM(0.05)).toBe(2000);
  });

  it('formats distances', () => {
    expect(formatDistance(950)).toBe('950 m');
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(25000)).toBe('25 km');
  });

  it('formats aviation distances', () => {
    expect(formatDistance(450, 'aviation')).toBe('450 m');
    expect(formatDistance(926, 'aviation')).toBe('0.5 nm');
    expect(formatDistance(25000, 'aviation')).toBe('13.5 nm');
    expect(formatDistance(37040, 'aviation')).toBe('20 nm');
  });

  it('formats speeds', () => {
    expect(formatSpeed(10)).toBe('10 m/s');
    expect(formatSpeed(10, 'aviation')).toBe('19 kt');
  });

  it('picks nm-friendly aviation grid steps', () => {
    expect(gridStepM(0.1, 90, 'aviation')).toBe(926);
    expect(gridStepM(0.05, 90, 'aviation')).toBe(1852);
    expect(gridStepM(0.225, 90, 'aviation')).toBe(500);
    expect(gridStepM(0.6, 90, 'aviation')).toBe(200);
    expect(gridStepM(10, 90, 'aviation')).toBe(10);
  });
});
