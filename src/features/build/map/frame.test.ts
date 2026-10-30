import { M_PER_DEG_LAT, makeFrame } from './frame';

describe('site frame', () => {
  const f = makeFrame({ lat: 35, lon: -117 });

  it('round-trips metres through longitude and latitude', () => {
    for (const [x, y] of [
      [0, 0],
      [1234.5, -987.25],
      [-20000, 15000],
    ] as const) {
      const [lng, lat] = f.toLngLat(x, y);
      const back = f.fromLngLat(lng, lat);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
  });

  it('puts the origin at the site and scales longitude by cos lat', () => {
    expect(f.toLngLat(0, 0)).toEqual([-117, 35]);
    expect(f.toLngLat(0, M_PER_DEG_LAT)[1]).toBeCloseTo(36, 9);
    const [lng] = f.toLngLat(M_PER_DEG_LAT * Math.cos((35 * Math.PI) / 180), 0);
    expect(lng).toBeCloseTo(-116, 9);
  });
});
