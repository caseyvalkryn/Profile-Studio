// The site frame (spec section 3 item 4): metres east (x) and north (y) of the site origin.
// A local flat frame at the site latitude converts to longitude and latitude, so a tile basemap
// can sit under the same coordinates later. Every conversion in the map goes through here.

export const M_PER_DEG_LAT = 111320;

export type XY = { x: number; y: number };
export type LngLat = [number, number];

export type Frame = {
  lat0: number;
  lon0: number;
  mPerDegLon: number;
  toLngLat: (x: number, y: number) => LngLat;
  fromLngLat: (lng: number, lat: number) => XY;
};

export function makeFrame(site: { lat: number; lon: number }): Frame {
  const lat0 = site.lat;
  const lon0 = site.lon;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180) || M_PER_DEG_LAT;
  return {
    lat0,
    lon0,
    mPerDegLon,
    toLngLat: (x, y) => [lon0 + x / mPerDegLon, lat0 + y / M_PER_DEG_LAT],
    fromLngLat: (lng, lat) => ({ x: (lng - lon0) * mPerDegLon, y: (lat - lat0) * M_PER_DEG_LAT }),
  };
}

/** Bounds in metres: [minX, minY, maxX, maxY]. */
export type BoundsM = [number, number, number, number];

export function boundsToLngLat(f: Frame, b: BoundsM): [LngLat, LngLat] {
  return [f.toLngLat(b[0], b[1]), f.toLngLat(b[2], b[3])];
}
