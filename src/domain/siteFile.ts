// The site from a KML or KMZ file (plan phase 14, readings 1 to 6). Pure functions, no store:
// read the KML out of a KMZ, parse its polygons, project them onto the board's local plane in
// metres about the profile's site, and make one `range` area per polygon.

import { nextId, newKey } from './ids';
import type { Area, Vignette } from './types';

/** One polygon of a KML file: the Placemark name and the outer ring as [lon, lat], unclosed. */
export type SitePolygon = { name: string; ring: [number, number][] };

/** A point in degrees. */
export type LatLon = { lat: number; lon: number };

const NOT_KMZ = 'This file is not a KMZ.';
const NO_KML = 'The KMZ has no KML document.';
const BAD_ENTRY = 'The KML document in the KMZ cannot be read.';
const NOT_KML = 'This file is not KML.';
const NO_POLYGON = 'The file has no polygon.';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

/** Metres per degree: east at the equator (scaled by cos lat) and north. */
const M_PER_DEG_LON = 111320;
const M_PER_DEG_LAT = 110574;

/**
 * The KML text of a KMZ. The zip's central directory gives each entry's method, compressed size
 * and local header offset (a data descriptor may zero the sizes in the local header). The first
 * entry whose name ends in `.kml` is the document; method 0 is copied, method 8 is inflated by the
 * platform DecompressionStream.
 */
export async function readKmz(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (bytes.length < 30 || dv.getUint32(0, true) !== SIG_LOCAL) throw new Error(NOT_KMZ);

  // the end of central directory record: 22 bytes plus a comment of up to 65535
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error(NOT_KMZ);

  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const latin = new TextDecoder('latin1');
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error(NOT_KMZ);
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const name = latin.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.toLowerCase().endsWith('.kml')) continue;

    if (offset + 30 > bytes.length || dv.getUint32(offset, true) !== SIG_LOCAL)
      throw new Error(NOT_KMZ);
    const start = offset + 30 + dv.getUint16(offset + 26, true) + dv.getUint16(offset + 28, true);
    if (start + size > bytes.length) throw new Error(NOT_KMZ);
    const data = bytes.slice(start, start + size);
    if (method === 0) return new TextDecoder('utf-8').decode(data);
    if (method !== 8) throw new Error(BAD_ENTRY);
    try {
      return new TextDecoder('utf-8').decode(await inflateRaw(data));
    } catch {
      throw new Error(BAD_ENTRY);
    }
  }
  throw new Error(NO_KML);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // a write or close failure also errors the readable side, which the read loop throws
  writer.write(data).catch(() => undefined);
  writer.close().catch(() => undefined);
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    chunks.push(r.value);
    total += r.value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const local = (el: Element) => el.localName;
const childrenNamed = (el: Element, name: string) =>
  Array.from(el.children).filter((c) => local(c) === name);
const descendants = (el: Element | Document, name: string) =>
  Array.from(el.getElementsByTagNameNS('*', name));

/**
 * Every polygon of a KML document: each Placemark, each Polygon under it (MultiGeometry
 * included), its outer ring. Inner rings (holes) and every other geometry are ignored. The
 * closing vertex is dropped and a ring of fewer than three vertices is skipped.
 */
export function parseKml(text: string): SitePolygon[] {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml');
  } catch {
    throw new Error(NOT_KML);
  }
  const root = doc.documentElement;
  if (
    !root ||
    descendants(doc, 'parsererror').length > 0 ||
    (local(root) !== 'kml' && local(root) !== 'Document')
  )
    throw new Error(NOT_KML);

  const out: SitePolygon[] = [];
  for (const pm of descendants(root, 'Placemark')) {
    const name = (childrenNamed(pm, 'name')[0]?.textContent ?? '').trim();
    for (const poly of descendants(pm, 'Polygon')) {
      const outer = childrenNamed(poly, 'outerBoundaryIs')[0];
      const coords = outer ? descendants(outer, 'coordinates')[0] : undefined;
      if (!coords) continue;
      const ring: [number, number][] = [];
      for (const tok of (coords.textContent ?? '').split(/\s+/)) {
        if (!tok) continue;
        const [lon, lat] = tok.split(',').map(Number);
        if (Number.isFinite(lon) && Number.isFinite(lat)) ring.push([lon!, lat!]);
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (ring.length > 1 && first![0] === last![0] && first![1] === last![1]) ring.pop();
      if (ring.length >= 3) out.push({ name, ring });
    }
  }
  if (out.length === 0) throw new Error(NO_POLYGON);
  return out;
}

/** [x, y] metres of a [lon, lat] about the origin: east is x, north is y (plan reading 3). */
export function localFrom(origin: LatLon, p: [number, number]): [number, number] {
  const k = Math.cos((origin.lat * Math.PI) / 180) * M_PER_DEG_LON;
  return [(p[0] - origin.lon) * k, (p[1] - origin.lat) * M_PER_DEG_LAT];
}

/** The centre of the bounding box of every vertex. */
export function centreOf(polygons: readonly SitePolygon[]): LatLon {
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let latMin = Infinity;
  let latMax = -Infinity;
  for (const pg of polygons)
    for (const [lon, lat] of pg.ring) {
      lonMin = Math.min(lonMin, lon);
      lonMax = Math.max(lonMax, lon);
      latMin = Math.min(latMin, lat);
      latMax = Math.max(latMax, lat);
    }
  if (lonMin > lonMax) return { lat: 0, lon: 0 };
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2 };
}

/**
 * One `range` area per polygon, projected about the profile's site. When the site is unset
 * (latitude and longitude both 0) the origin is the centre of the polygons and `site` returns
 * it for the caller to set. Labels are the Placemark names, `stem` when a name is empty. Does not
 * change `doc`.
 */
export function siteAreas(
  doc: Vignette,
  polygons: readonly SitePolygon[],
  stem: string,
): { areas: Area[]; site?: LatLon } {
  const unset = doc.site.lat === 0 && doc.site.lon === 0;
  const origin = unset ? centreOf(polygons) : { lat: doc.site.lat, lon: doc.site.lon };
  const used = [
    ...doc.threats.map((x) => x.id),
    ...doc.sensors.map((x) => x.id),
    ...doc.effectors.map((x) => x.id),
    ...doc.nodes.map((x) => x.id),
    ...doc.areas.map((x) => x.id),
  ];
  const areas = polygons.map((pg): Area => {
    const id = nextId('range', used);
    used.push(id);
    return {
      key: newKey(),
      id,
      kind: 'range',
      label: pg.name || stem,
      pts: pg.ring.map((p) => localFrom(origin, p)),
      zMinM: 0,
      zMaxM: 0,
    };
  });
  return unset ? { areas, site: origin } : { areas };
}
