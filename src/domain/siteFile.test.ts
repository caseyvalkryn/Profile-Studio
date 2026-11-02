import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { testVignette } from '../engine/testVignette';
import { centreOf, localFrom, parseKml, readKmz, siteAreas, type SitePolygon } from './siteFile';

const fixture = (name: string) => readFileSync(resolve(process.cwd(), 'fixtures/kml', name));
const arrayBuffer = (b: Uint8Array): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const KML = fixture('site.kml').toString('utf-8');
const KMZ = arrayBuffer(fixture('site.kmz'));

/** A zip of stored (method 0) entries; the CRC is left 0, which the reader does not check. */
function storedZip(entries: { name: string; text: string }[]): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = enc.encode(e.text);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, at, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    central.push(new Uint8Array(ch.buffer), name);
    at += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, at, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out.buffer;
}

const kmlOf = (placemarks: string) =>
  `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`;
const square = (name: string) =>
  `<Placemark>${name}<Polygon><outerBoundaryIs><LinearRing><coordinates>
  -79,35,0 -78.999,35,0 -78.999,35.001,0 -79,35.001,0 -79,35,0
  </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;

function extent(pts: [number, number][]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    cx: (Math.max(...xs) + Math.min(...xs)) / 2,
    cy: (Math.max(...ys) + Math.min(...ys)) / 2,
  };
}

describe('the platform', () => {
  it('has DecompressionStream and DOMParser in the test environment', () => {
    expect(typeof DecompressionStream).toBe('function');
    expect(typeof DOMParser).toBe('function');
  });
});

describe('readKmz', () => {
  it('inflates the deflated doc.kml of the fixture to the KML text', async () => {
    expect(await readKmz(KMZ)).toBe(KML);
  });

  it('copies a stored entry and picks the first name ending in .kml, any case', async () => {
    const zip = storedZip([
      { name: 'files/readme.txt', text: 'no' },
      { name: 'doc.KML', text: '<kml/>' },
      { name: 'other.kml', text: 'second' },
    ]);
    expect(await readKmz(zip)).toBe('<kml/>');
  });

  it('refuses a file that is not a zip', async () => {
    await expect(readKmz(arrayBuffer(new TextEncoder().encode(KML)))).rejects.toThrow(
      'This file is not a KMZ.',
    );
    await expect(readKmz(new ArrayBuffer(0))).rejects.toThrow('This file is not a KMZ.');
  });

  it('refuses a zip with no KML document', async () => {
    const zip = storedZip([{ name: 'images/a.png', text: 'x' }]);
    await expect(readKmz(zip)).rejects.toThrow('The KMZ has no KML document.');
  });
});

describe('parseKml', () => {
  it('reads both polygons of the fixture: names trimmed, rings unclosed, holes and points ignored', () => {
    const pgs = parseKml(KML);
    expect(pgs.map((p) => [p.name, p.ring.length])).toEqual([
      ['Test rectangle', 4],
      ['Fly area', 8],
    ]);
    expect(pgs[0]!.ring[0]).toEqual([-79.0032899, 34.9981913]);
  });

  it('gives an empty name when a Placemark has none and skips a ring under three vertices', () => {
    const two = `<Placemark><name>Line</name><Polygon><outerBoundaryIs><LinearRing>
      <coordinates>-79,35 -78.9,35 -79,35</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
    const pgs = parseKml(kmlOf(square('') + two));
    expect(pgs).toHaveLength(1);
    expect(pgs[0]!.name).toBe('');
    expect(pgs[0]!.ring).toHaveLength(4);
  });

  it('refuses text that is not KML', () => {
    expect(() => parseKml('this is not xml <')).toThrow('This file is not KML.');
    expect(() => parseKml('<html><body/></html>')).toThrow('This file is not KML.');
  });

  it('refuses KML with no polygon', () => {
    const point =
      '<Placemark><name>P</name><Point><coordinates>-79,35,0</coordinates></Point></Placemark>';
    expect(() => parseKml(kmlOf(point))).toThrow('The file has no polygon.');
  });
});

describe('the projection', () => {
  it('draws the 600 by 400 m test rectangle at 600 by 400 m, north as positive y', () => {
    const [rect] = parseKml(KML);
    const pts = rect!.ring.map((p) => localFrom({ lat: 35, lon: -79 }, p));
    const e = extent(pts);
    expect(Math.abs(e.w - 600)).toBeLessThan(1);
    expect(Math.abs(e.h - 400)).toBeLessThan(1);
    expect(Math.hypot(e.cx, e.cy)).toBeLessThan(1);
    // the ring runs SW, SE, NE, NW: the northern vertices have the larger y
    expect(pts[2]![1]).toBeGreaterThan(pts[1]![1]);
    expect(pts[2]![1]).toBeCloseTo(200, 0);
    expect(localFrom({ lat: 35, lon: -79 }, [-79, 35.001])[1]).toBeGreaterThan(0);
    expect(localFrom({ lat: 35, lon: -79 }, [-78.999, 35])[0]).toBeGreaterThan(0);
  });

  it('centres the bounding box of every vertex', () => {
    const pgs: SitePolygon[] = [
      {
        name: 'a',
        ring: [
          [-79, 35],
          [-78.9, 35],
          [-79, 35.2],
        ],
      },
      {
        name: 'b',
        ring: [
          [-78.8, 35.1],
          [-78.7, 35.1],
          [-78.7, 35.4],
        ],
      },
    ];
    expect(centreOf(pgs)).toEqual({ lat: 35.2, lon: -78.85 });
  });
});

describe('siteAreas', () => {
  const pgs = parseKml(KML);

  it('sets an unset site to the centre of the file and centres the areas near 0, 0', () => {
    const doc = testVignette({ site: { name: '', lat: 0, lon: 0, elevM: 0 } });
    const before = JSON.stringify(doc);
    const { areas, site } = siteAreas(doc, pgs, 'site');
    expect(site).toEqual(centreOf(pgs));
    const e = extent(areas.flatMap((a) => a.pts));
    expect(Math.hypot(e.cx, e.cy)).toBeLessThan(0.01);
    expect(Math.abs(extent(areas[0]!.pts).w - 600)).toBeLessThan(1);
    expect(Math.abs(extent(areas[0]!.pts).h - 400)).toBeLessThan(1);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('projects against a set site and returns no site: a second file lands at its offset', () => {
    const doc = testVignette({ site: { name: 'Synthetic', lat: 35, lon: -79, elevM: 90 } });
    const { areas, site } = siteAreas(doc, pgs, 'site');
    expect(site).toBeUndefined();
    const r = extent(areas[0]!.pts);
    expect(Math.hypot(r.cx, r.cy)).toBeLessThan(1);
    // the fly area's first vertex sits 450 m east and 150 m north of the site
    expect(areas[1]!.pts[0]![0]).toBeCloseTo(450, 0);
    expect(areas[1]!.pts[0]![1]).toBeCloseTo(150, 0);

    const east = testVignette({ site: { name: 'Synthetic', lat: 35, lon: -79.01, elevM: 90 } });
    const moved = extent(siteAreas(east, pgs, 'site').areas[0]!.pts);
    expect(moved.cx).toBeCloseTo(0.01 * Math.cos((35 * Math.PI) / 180) * 111320, 0);
  });

  it('makes range areas with unique RNG ids, flat footprints and the stem for an empty name', () => {
    const doc = testVignette();
    doc.areas.push({ ...doc.areas[0]!, key: 'k-rng', id: 'RNG-1', kind: 'range' });
    const { areas } = siteAreas(doc, [{ ...pgs[0]!, name: '' }, pgs[1]!], 'TST Ranch');
    expect(areas.map((a) => [a.id, a.kind, a.label, a.zMinM, a.zMaxM])).toEqual([
      ['RNG-2', 'range', 'TST Ranch', 0, 0],
      ['RNG-3', 'range', 'Fly area', 0, 0],
    ]);
    expect(new Set(areas.map((a) => a.key)).size).toBe(2);
    expect(areas[1]!.pts).toHaveLength(8);
  });
});
