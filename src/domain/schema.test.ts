import { defaultSensorModel } from './catalog';
import { newKey } from './ids';
import { isVignette, parseVignette } from './schema';
import type { Vignette } from './types';

/** A v7 record without the fields v7 added, as a v6 record would carry it. */
function withoutV7<T extends { collection?: unknown; class?: unknown; version?: unknown }>(
  v: T,
): Omit<T, 'collection' | 'class' | 'version'> {
  const out: Partial<T> = { ...v };
  delete out.collection;
  delete out.class;
  delete out.version;
  return out as Omit<T, 'collection' | 'class' | 'version'>;
}

function small(): Vignette {
  const q = newKey();
  const t1 = newKey();
  const rdr = newKey();
  return {
    schema: 'profile-studio/8',
    id: 'V-1',
    name: 'Round trip',
    updated: '2026-10-30T00:00:00.000Z',
    collection: 'Range',
    class: 'Counter-UAS',
    version: 3,
    site: { name: 'Range', lat: 35.1, lon: -117.6, elevM: 700 },
    questions: [{ key: q, id: 'Q-01', text: 'Does detection reach 3 km?', note: '' }],
    threats: [
      {
        key: t1,
        id: 'T1',
        type: 'g1-quad-isr',
        speedMs: 12,
        group: 'A',
        path: [
          { key: newKey(), x: 3000, y: 3000, z: 120, holdS: 0 },
          { key: newKey(), x: 0, y: 0, z: 120, holdS: 10 },
        ],
      },
    ],
    sensors: [
      {
        key: rdr,
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
    nodes: [
      {
        key: newKey(),
        id: 'C2-1',
        kind: 'c2',
        x: 10,
        y: 10,
        z: 0,
        rangeM: 0,
        fovDeg: 0,
        bearingDeg: 0,
      },
    ],
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
    planes: [{ key: newKey(), id: 'P1', label: '120 m ceiling', zM: 120 }],
    events: [
      {
        key: newKey(),
        id: 'e1',
        tS: 28,
        type: 'detect',
        label: 'Radar detect',
        threatKey: t1,
        sensorKey: rdr,
      },
    ],
    snapshots: [10, 95],
    cards: [
      {
        key: newKey(),
        id: 'c1',
        name: 'Overview',
        view: {
          kind: '3d',
          centre: { x: 0, y: 0 },
          zoom: 1,
          yawDeg: -35,
          pitchDeg: 55,
          ref: 'asset',
          elevationMode: 'fromAsset',
        },
        layers: { reach: true, rings: false },
        displays: { timeline: true, chart: false, readout: false },
        clip: { t0S: 0, t1S: 60, rate: 2, beatsS: [10, 60] },
        focus: [t1],
        tS: null,
        caption: 'One threat from the north east.',
        notes: '',
      },
    ],
    debrief: {
      source: 'flight-1.csv',
      loadedAt: '2026-10-31T00:00:00.000Z',
      tspi: { [t1]: [[0, 3000, 3000, 120]] },
      events: [{ tS: 30, type: 'identify', threatKey: t1, sensorKey: null }],
    },
    chainTime: { decisionS: 5, assignS: 3 },
    measures: [{ id: '1.1.2', op: '>=', threshold: 3000, unit: 'm' }],
    report: {
      notes: '',
      dataSources: [],
      truth: { source: 'GPS', intervalS: 20, stationKeys: [] },
    },
  };
}

/** `small()` as a stored v6 record: no collection, class or version, with the run fields. */
function smallV6(base: Vignette = small()): Record<string, unknown> {
  const rest = withoutV7(base);
  return {
    ...JSON.parse(JSON.stringify(rest)),
    schema: 'profile-studio/6',
    hypotheses: [
      {
        key: newKey(),
        id: 'H-01',
        question: rest.questions[0]!.key,
        measure: '1.1.2',
        op: '>=',
        value: 3000,
        prediction: { low: 2800, high: 3600 },
        lockedAt: null,
      },
    ],
    runs: [{ key: newKey(), id: 'R-1', createdAt: '', n: 1, seed: 1, rows: [] }],
    sweep: { factors: [{ kind: 'threat-speed', levels: [10, 20] }] },
    report: {
      summary: 'Old summary',
      notes: '',
      dataSources: ['Radar log'],
      truth: { source: 'GPS', intervalS: 20, stationKeys: [] },
      slides: [{ key: newKey(), name: 'S', caption: '', notes: '' }],
      sections: { results: 'x' },
      charts: ['1.1.2'],
    },
  };
}

describe('v6 to v7', () => {
  it('takes the collection from the site name and drops the run fields', () => {
    const base = small();
    const v = parseVignette(smallV6(base));
    expect(v.schema).toBe('profile-studio/8');
    expect([v.collection, v.class, v.version]).toEqual(['Range', 'Custom', 1]);
    expect(v.site.name).toBe('Range');
    for (const k of ['hypotheses', 'runs', 'sweep']) expect(k in v).toBe(false);
    expect(v.report).toEqual({
      notes: '',
      dataSources: ['Radar log'],
      truth: { source: 'GPS', intervalS: 20, stationKeys: [] },
    });
    const rest = withoutV7(v);
    const want = withoutV7(base);
    expect(rest).toEqual({ ...want, report: v.report });
  });

  it('keeps a collection the v6 record already has', () => {
    const v = parseVignette({ ...smallV6(), collection: 'Toughstump' });
    expect([v.collection, v.site.name]).toEqual(['Toughstump', 'Range']);
  });

  it('refuses a class outside the catalog', () => {
    expect(() => parseVignette({ ...small(), class: 'Tank' })).toThrow(/class/);
  });
});

describe('v7 to v8', () => {
  it('restamps a v7 record and changes nothing else', () => {
    const v = small();
    const v7 = { ...JSON.parse(JSON.stringify(v)), schema: 'profile-studio/7' };
    expect(isVignette(v7)).toBe(false);
    expect(parseVignette(v7)).toEqual(v);
  });

  it('parses a v8 record with a range area', () => {
    const v = small();
    v.areas.push({
      key: newKey(),
      id: 'RNG-1',
      kind: 'range',
      label: 'Fly area',
      pts: [
        [-300, -200],
        [300, -200],
        [300, 200],
        [-300, 200],
      ],
      zMinM: 0,
      zMaxM: 0,
    });
    const back = parseVignette(JSON.parse(JSON.stringify(v)));
    expect(back).toEqual(v);
    expect(back.areas.at(-1)!.kind).toBe('range');
  });
});

describe('vignette schema', () => {
  it('round-trips a small vignette', () => {
    const v = small();
    const back = parseVignette(JSON.parse(JSON.stringify(v)));
    expect(back).toEqual(v);
    expect(isVignette(back)).toBe(true);
  });

  it('loads a stored v6 node without fovDeg and bearingDeg with the catalog defaults', () => {
    const v = small();
    const stored = JSON.parse(JSON.stringify(v)) as { nodes: Record<string, unknown>[] };
    delete stored.nodes[0]!.fovDeg;
    delete stored.nodes[0]!.bearingDeg;
    expect(parseVignette(stored)).toEqual(v);
    expect(isVignette(stored)).toBe(true);
  });

  it('throws a readable error', () => {
    const bad = { ...small(), schema: 'profile-studio/4' };
    expect(() => parseVignette(bad)).toThrow(/not a valid profile[\s\S]*schema/);
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

  it('rejects the clips the legacy validator rejects', () => {
    const clip = (c: Partial<NonNullable<Vignette['cards'][number]['clip']>>) => {
      const v = small();
      v.cards[0]!.clip = { ...v.cards[0]!.clip!, ...c };
      return v;
    };
    expect(() => parseVignette(clip({ t0S: 60, t1S: 60 }))).toThrow(/slice start must be before/);
    expect(() => parseVignette(clip({ t0S: 70 }))).toThrow(/slice start must be before/);
    expect(() => parseVignette(clip({ rate: 3 }))).toThrow(/not in the rate menu/);
    expect(() => parseVignette(clip({ beatsS: [61] }))).toThrow(/beat is outside the slice/);
    expect(() => parseVignette(clip({ beatsS: [-1] }))).toThrow(/beat is outside the slice/);
    for (const rate of [0.25, 0.5, 1, 2, 4, 8, 16, 32])
      expect(isVignette(clip({ rate }))).toBe(true);
    expect(isVignette(clip({ beatsS: [0, 60] }))).toBe(true);
    const cam = small() as unknown as { cards: { view: { kind: string } }[] };
    cam.cards[0]!.view.kind = 'axon';
    expect(() => parseVignette(cam)).toThrow(/not plan, elevation or 3D/);
  });

  it('rejects an unknown event type and a short TSPI sample', () => {
    const ev = small() as unknown as { events: { type: string }[] };
    ev.events[0]!.type = 'id';
    expect(() => parseVignette(ev)).toThrow(/event type is not in the catalog/);
    const db = small();
    db.debrief!.tspi[db.threats[0]!.key] = [
      [0, 1, 2] as unknown as [number, number, number, number],
    ];
    expect(() => parseVignette(db)).toThrow(/t, x, y and z/);
  });
});
