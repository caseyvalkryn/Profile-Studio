import { defaultSensorModel } from './catalog';
import { newKey } from './ids';
import { isVignette, parseVignette } from './schema';
import type { Vignette } from './types';

function small(): Vignette {
  const q = newKey();
  return {
    schema: 'profile-studio/5',
    id: 'V-1',
    name: 'Round trip',
    updated: '2026-10-30T00:00:00.000Z',
    site: { name: 'Range', lat: 35.1, lon: -117.6, elevM: 700 },
    questions: [{ key: q, id: 'Q-01', text: 'Does detection reach 3 km?', note: '' }],
    hypotheses: [
      {
        key: newKey(),
        id: 'H-01',
        question: q,
        measure: '1.1.2',
        op: '>=',
        value: 3000,
        prediction: { low: 2800, high: 3600 },
        lockedAt: null,
      },
    ],
    threats: [
      {
        key: newKey(),
        id: 'T1',
        type: 'g1-quad-isr',
        speedMs: 12,
        path: [
          { key: newKey(), x: 3000, y: 3000, z: 120, holdS: 0 },
          { key: newKey(), x: 0, y: 0, z: 120, holdS: 10 },
        ],
      },
    ],
    sensors: [
      {
        key: newKey(),
        id: 'RDR-1',
        kind: 'radar',
        x: 0,
        y: 0,
        z: 5,
        rangeM: 4000,
        minRangeM: 0,
        fovDeg: 360,
        bearingDeg: 0,
        elMinDeg: -90,
        elMaxDeg: 90,
        model: defaultSensorModel('radar', 4000),
        entered: { '1.3': { value: 360, source: 'Vendor sheet rev B' } },
      },
    ],
    effectors: [
      {
        key: newKey(),
        id: 'EW-1',
        kind: 'ew',
        x: 0,
        y: 0,
        z: 0,
        rangeM: 1500,
        fovDeg: 360,
        bearingDeg: 0,
        timeToEffectS: 10,
        pk: 0.8,
        entered: {},
      },
    ],
    nodes: [{ key: newKey(), id: 'C2-1', kind: 'c2', x: 10, y: 10, z: 0, rangeM: 0 }],
    areas: [
      {
        key: newKey(),
        id: 'DA',
        kind: 'asset',
        label: 'Defended asset',
        pts: [
          [-200, -200],
          [200, -200],
          [200, 200],
        ],
        zMinM: 0,
        zMaxM: 0,
      },
    ],
    chainTime: { decisionS: 5, assignS: 3 },
    measures: [{ id: '1.1.2', op: '>=', threshold: 3000, unit: 'm' }],
    runs: [],
    report: {
      summary: '',
      notes: '',
      dataSources: [],
      truth: { source: 'GPS', intervalS: 20, stationKeys: [] },
      slides: [],
    },
  };
}

describe('vignette schema', () => {
  it('round-trips a small vignette', () => {
    const v = small();
    const back = parseVignette(JSON.parse(JSON.stringify(v)));
    expect(back).toEqual(v);
    expect(isVignette(back)).toBe(true);
  });

  it('throws a readable error', () => {
    const bad = { ...small(), schema: 'profile-studio/4' };
    expect(() => parseVignette(bad)).toThrow(/not a valid vignette[\s\S]*schema/);
    expect(isVignette(bad)).toBe(false);
  });

  it('requires a source note on entered values', () => {
    const v = small();
    v.sensors[0]!.entered['1.3'] = { value: 360, source: '' };
    expect(() => parseVignette(v)).toThrow(/source note/);
  });

  it('rejects inverted and empty envelopes', () => {
    const el = small();
    el.sensors[0]!.elMinDeg = 60;
    el.sensors[0]!.elMaxDeg = 10;
    expect(() => parseVignette(el)).toThrow(/elMinDeg must be below elMaxDeg/);
    const fov = small();
    fov.sensors[0]!.fovDeg = 0;
    expect(() => parseVignette(fov)).toThrow(/fovDeg/);
    const efov = small();
    efov.effectors[0]!.fovDeg = 0;
    expect(() => parseVignette(efov)).toThrow(/fovDeg/);
    const rmin = small();
    rmin.sensors[0]!.minRangeM = 5000;
    expect(() => parseVignette(rmin)).toThrow(/minRangeM must not exceed rangeM/);
    const z = small();
    z.areas[0]!.zMinM = 10;
    z.areas[0]!.zMaxM = 0;
    expect(() => parseVignette(z)).toThrow(/zMinM must not exceed zMaxM/);
    // A flat footprint (zMinM equal to zMaxM) is valid: legacy areas carry zmax 0.
    expect(isVignette(small())).toBe(true);
  });
});
