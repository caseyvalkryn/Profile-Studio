// @vitest-environment node
/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DEFAULT_MEASURES, importLegacyV4, migrateV5ToV6, TARGET_TIME_NOTE } from './migrate';
import { parseVignette } from './schema';
import { templateById } from './templates';
import type { Vignette } from './types';

type Rec = Record<string, unknown> & {
  id: string;
  scene: {
    aircraft: unknown[];
    systems: unknown[];
    volumes: unknown[];
    paths: { pts: unknown[] }[];
  };
};
type Legacy = { seed: { load(): Rec[]; templates: { id: string; make(id: string): Rec }[] } };

// Load the legacy scripts in legacy/index.html order, as legacy/test/golden.js does.
function loadLegacy(): Legacy {
  const root = path.resolve(__dirname, '../../legacy');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]!);
  const ctx = vm.createContext({ console, performance: { now: () => Date.now() } });
  ctx.globalThis = ctx;
  for (const f of order)
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return (ctx as unknown as { PS: Legacy }).PS;
}

// Every free-text string in a legacy v4 record.
function freeText(r: Rec): string[] {
  const s = r.scene as unknown as Record<string, Record<string, unknown>[]>;
  const out: unknown[] = [r.name, r.collection, r.purpose, (r.site as { name: string }).name];
  out.push(...(r.mop as string[]), ...(r.data as string[]), (r.telemetry as { tspi: string }).tspi);
  for (const v of s.volumes!) out.push(v.label);
  for (const p of s.planes!) out.push(p.label);
  for (const e of r.events as Record<string, unknown>[]) out.push(e.label);
  for (const c of r.cards as Record<string, unknown>[]) out.push(c.name, c.caption, c.notes);
  return out.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

const PS = loadLegacy();
const records: [string, Rec][] = [
  ...PS.seed.load().map((r) => [r.id, r] as [string, Rec]),
  ...PS.seed.templates.map((t) => [t.id, t.make(t.id)] as [string, Rec]),
];

describe('importLegacyV4', () => {
  it('covers the 4 seeds and 5 templates', () => {
    expect(records.map(([id]) => id)).toEqual([
      'CUAS-001',
      'MULTI-001',
      'OWA-001',
      'SURR-001',
      'point-defence',
      'fixed-wing-ingress',
      'range-test',
      'swarm',
      'blank',
    ]);
  });

  it.each(records)('%s imports and validates without loss', (_id, rec) => {
    const v = parseVignette(importLegacyV4(JSON.parse(JSON.stringify(rec))));
    const s = rec.scene;
    expect(v.threats).toHaveLength(s.paths.length);
    expect(v.sensors.length + v.effectors.length + v.nodes.length).toBe(s.systems.length);
    expect(v.areas).toHaveLength(s.volumes.length);
    expect(v.threats.map((t) => t.path.length)).toEqual(s.paths.map((p) => p.pts.length));
    const text = JSON.stringify(v);
    for (const t of freeText(rec)) expect(text, t).toContain(JSON.stringify(t).slice(1, -1));
    const keys = [
      ...v.threats.flatMap((t) => [t.key, ...t.path.map((w) => w.key)]),
      ...v.sensors,
      ...v.effectors,
      ...v.nodes,
      ...v.areas,
      ...v.questions,
    ].map((x) => (typeof x === 'string' ? x : x.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('maps MOP text to a question note and truth stations to keys', () => {
    const [, cuas] = records[0]!;
    const v = importLegacyV4(cuas);
    expect(v.questions[0]!.text).toBe(cuas.purpose);
    expect(v.questions[0]!.note.split('\n')).toEqual(cuas.mop);
    expect(v.report.truth.stationKeys).toEqual([v.sensors.find((x) => x.id === 'RDR-1')!.key]);
  });

  it('rejects a record that is not v4', () => {
    expect(() => importLegacyV4({ scene: {}, schema: 'profile-studio/3' })).toThrow(
      /not profile-studio\/4/,
    );
    expect(() => importLegacyV4(42)).toThrow(/not a profile record/);
  });

  it('seeds default measures and notes the unset Target time', () => {
    const [, cuas] = records[0]!;
    const v = importLegacyV4(cuas);
    expect(v.measures.map((m) => m.id)).toEqual(['1.1.1', '1.1.2', '2.1.2', '3.1.2']);
    expect(v.measures).toEqual(DEFAULT_MEASURES);
    expect(v.chainTime).toEqual({ decisionS: 0, assignS: 0 });
    expect(v.report.notes).toContain('Target time not set');
    expect(v.report.notes).toContain(TARGET_TIME_NOTE);
  });
});

// Spec acceptance item 18 as a unit test, on the full v4 records in fixtures/legacy-derive.
type L = Record<string, unknown>;
const FIXTURES = path.resolve(__dirname, '../../fixtures/legacy-derive');
const fixtures: [string, L][] = records.map(([id]) => [
  id,
  (JSON.parse(fs.readFileSync(path.join(FIXTURES, `${id}.json`), 'utf8')) as { input: L }).input,
]);
const PROJ = { plan: 'plan', elevation: 'elev', '3d': 'axon' } as const;

// The v6 record read back into legacy ids and names, for the fields the import maps.
function asLegacy(v: Vignette) {
  const idOf = new Map<string, string>();
  for (const x of [...v.planes, ...v.areas, ...v.sensors, ...v.effectors, ...v.nodes, ...v.threats])
    idOf.set(x.key, x.id);
  for (const e of v.events) idOf.set(e.key, e.id);
  const ev = (type: string) => (type === 'identify' ? 'id' : type);
  const sys = (k: string | null) => (k == null ? null : idOf.get(k));
  return {
    planes: v.planes.map((p) => ({ id: p.id, label: p.label, z: p.zM })),
    volumes: v.areas.map((a) => ({ id: a.id, zmin: a.zMinM, zmax: a.zMaxM })),
    groups: v.threats.map((t) => ({ id: t.id, group: t.group })),
    events: v.events.map((e) => ({
      id: e.id,
      t: e.tS,
      type: ev(e.type),
      label: e.label,
      path: idOf.get(e.threatKey),
      system: sys(e.sensorKey),
    })),
    nodes: v.nodes.map((n) => ({ id: n.id, fov: n.fovDeg, bearing: n.bearingDeg })),
    snapshots: v.snapshots,
    data: v.report.dataSources,
    cards: v.cards.map((c) => ({
      id: c.id,
      name: c.name,
      cam: {
        proj: PROJ[c.view.kind],
        yaw: c.view.yawDeg,
        pitch: c.view.pitchDeg,
        ref: idOf.get(c.view.ref) ?? c.view.ref,
      },
      layers: c.layers,
      // emphasis (2026-11-02) is not a legacy field
      displays: {
        timeline: c.displays.timeline,
        chart: c.displays.chart,
        readout: c.displays.readout,
      },
      clip: c.clip && { t0: c.clip.t0S, t1: c.clip.t1S, rate: c.clip.rate, beats: c.clip.beatsS },
      focus: c.focus.map((k) => idOf.get(k)),
      t: c.tS,
      caption: c.caption,
      notes: c.notes,
    })),
    debrief: v.debrief && {
      tspi: Object.fromEntries(Object.entries(v.debrief.tspi).map(([k, q]) => [idOf.get(k), q])),
      events: v.debrief.events.map((e) => ({
        t: e.tS,
        type: ev(e.type),
        path: idOf.get(e.threatKey),
        system: sys(e.sensorKey),
      })),
    },
  };
}

// The same fields as the legacy record holds them.
function legacyFields(r: L) {
  const s = r.scene as Record<string, L[]>;
  const db = r.debrief as { tspi: L; events: L[] } | undefined;
  return {
    planes: s.planes!.map((p) => ({ id: p.id, label: p.label, z: p.z })),
    volumes: s.volumes!.map((a) => ({ id: a.id, zmin: a.zmin, zmax: a.zmax })),
    groups: s.paths!.map((p) => ({ id: p.id, group: p.group })),
    events: (r.events as L[]).map((e) => ({
      id: e.id,
      t: e.t,
      type: e.type,
      label: e.label,
      path: e.path,
      system: e.system,
    })),
    nodes: s
      .systems!.filter((x) => ['c2', 'tspi', 'truth'].includes(x.kind as string))
      .map((x) => ({ id: x.id, fov: x.fov ?? 0, bearing: x.bearing ?? 0 })),
    snapshots: r.snapshots,
    data: r.data,
    cards: (r.cards as L[]).map((c) => ({
      id: c.id,
      name: c.name,
      cam: c.cam,
      layers: c.layers,
      displays: c.displays,
      clip: c.clip,
      focus: c.focus,
      t: c.t,
      caption: c.caption,
      notes: c.notes,
    })),
    debrief: db
      ? {
          tspi: db.tspi,
          events: db.events.map((e) => ({ t: e.t, type: e.type, path: e.path, system: e.system })),
        }
      : null,
  };
}

const roundTrip = (v: Vignette) => parseVignette(JSON.parse(JSON.stringify(v)));

describe('legacy v4 round trip (acceptance item 18)', () => {
  it.each(fixtures)('%s: import, export, import keeps every mapped field', (_id, rec) => {
    const v = importLegacyV4(rec);
    const back = roundTrip(v);
    expect(back).toEqual(v);
    expect(JSON.stringify(back)).toBe(JSON.stringify(v));
    expect(asLegacy(back)).toEqual(legacyFields(rec));
  });

  it('SURR-001 TM-1 keeps its fov 360 and range; a node without fov gets the legacy 0', () => {
    const rec = structuredClone(fixtures.find(([id]) => id === 'SURR-001')![1]) as L;
    const v = importLegacyV4(rec);
    expect(v.nodes.find((n) => n.id === 'TM-1')).toMatchObject({
      fovDeg: 360,
      bearingDeg: 0,
      rangeM: 3500,
    });
    const rtk = (rec.scene as { systems: L[] }).systems.find((x) => x.id === 'RTK')!;
    delete rtk.fov;
    delete rtk.bearing;
    const w = importLegacyV4(rec);
    expect(w.nodes.find((n) => n.id === 'RTK')).toMatchObject({ fovDeg: 0, bearingDeg: 0 });
    expect(asLegacy(roundTrip(w))).toEqual(legacyFields(rec));
  });

  it('CUAS-001 cards arrive with camera, layers, time, caption and notes', () => {
    const [, rec] = fixtures[0]!;
    const v = importLegacyV4(rec);
    expect(v.cards.map((c) => [c.id, c.view.kind, c.tS])).toEqual([
      ['c1', 'plan', null],
      ['c2', '3d', 200],
      ['c3', 'plan', 300],
    ]);
    const c2 = v.cards[1]!;
    expect(c2.view).toEqual({
      kind: '3d',
      centre: { x: 0, y: 0 },
      zoom: 1,
      yawDeg: -35,
      pitchDeg: 55,
      ref: 'asset',
      elevationMode: 'fromAsset',
    });
    expect(c2.layers).toEqual({
      reach: false,
      events: true,
      envelopes: false,
      tracks: true,
      telemetry: false,
      labels: true,
      rings: false,
      target: true,
    });
    expect(c2.focus).toEqual([v.events.find((e) => e.id === 'e4')!.key]);
    expect(c2.caption).toMatch(/^At t\+200 s the aircraft is hovering/);
    expect(c2.notes).toMatch(/^Pause here/);
    expect(v.events.find((e) => e.id === 'e3')!.type).toBe('identify');
    expect(v.planes).toMatchObject([{ id: 'P1', label: '120 m ceiling', zM: 120 }]);
    expect(v.report.notes).not.toMatch(/Height plane|Event e1/);
  });

  it('maps collection, class and the version counter to their fields', () => {
    const [, base] = fixtures[0]!;
    const v = importLegacyV4(base);
    expect([v.collection, v.class, v.version, v.site.name]).toEqual([
      'Toughstump',
      'Counter-UAS',
      3,
      '',
    ]);
    expect(v.report.notes).not.toMatch(/Collection|Class/);

    const named = structuredClone(base) as L & { site: L };
    named.site.name = 'North range';
    named.cls = 'Tank';
    const w = importLegacyV4(named);
    expect([w.collection, w.site.name, w.class]).toEqual(['Toughstump', 'North range', 'Custom']);
    expect(w.questions[0]!.note).not.toMatch(/Collection/);
    expect(w.report.notes).toMatch(/^Class: Tank$/m);
  });

  it('maps a debrief, a clip and a system origin by key', () => {
    const [, base] = fixtures[0]!;
    const rec = structuredClone(base) as L & { cards: L[]; events: L[] };
    rec.debrief = {
      tspi: {
        T1: [
          [0, 3100, 3000, 120],
          [10, 3000, 2970, 120],
        ],
      },
      events: [{ id: 'd1', t: 30, type: 'id', path: 'T1', system: 'EO-1' }],
    };
    rec.events[0]!.system = 'RDR-1';
    rec.cards[0]!.clip = { t0: 0, t1: 120, rate: 4, beats: [28, 46] };
    (rec.cards[0]!.cam as L).ref = 'EO-1';
    const v = importLegacyV4(rec);
    const t1 = v.threats[0]!.key;
    const eo = v.sensors.find((s) => s.id === 'EO-1')!.key;
    expect(v.debrief).toEqual({
      source: '',
      loadedAt: '',
      tspi: {
        [t1]: [
          [0, 3100, 3000, 120],
          [10, 3000, 2970, 120],
        ],
      },
      events: [{ tS: 30, type: 'identify', threatKey: t1, sensorKey: eo }],
    });
    expect(v.events[0]!.sensorKey).toBe(v.sensors.find((s) => s.id === 'RDR-1')!.key);
    expect(v.cards[0]!.clip).toEqual({ t0S: 0, t1S: 120, rate: 4, beatsS: [28, 46] });
    expect(v.cards[0]!.view.ref).toBe(eo);
    expect(asLegacy(roundTrip(v))).toEqual(legacyFields(rec));
  });

  it('keeps a debrief event on an unknown system with no sensor, with a note', () => {
    const [, base] = fixtures[0]!;
    const rec = structuredClone(base) as L;
    rec.debrief = {
      tspi: {},
      events: [{ id: 'd1', t: 30, type: 'id', path: 'T1', system: 'RDR-9' }],
    };
    const v = importLegacyV4(rec);
    expect(v.debrief!.events[0]!.sensorKey).toBeNull();
    expect(v.report.notes).toContain(
      'A debrief event refers to system RDR-9 that does not exist; it has no sensor.',
    );
  });

  it('imports legacy cards to cards', () => {
    const [, base] = fixtures[0]!;
    const v = importLegacyV4(structuredClone(base));
    expect(v.cards.length).toBeGreaterThan(0);
  });

  it('rejects what the legacy validator rejects', () => {
    const [, base] = fixtures[0]!;
    const bad = (edit: (r: L & { cards: L[]; events: L[] }) => void) => {
      const r = structuredClone(base) as L & { cards: L[]; events: L[] };
      edit(r);
      return () => importLegacyV4(r);
    };
    expect(bad((r) => (r.events[0]!.path = 'T9'))).toThrow(
      'e1 refers to path T9 that does not exist.',
    );
    expect(bad((r) => (r.events[0]!.system = 'X'))).toThrow(
      'e1 refers to system X that does not exist.',
    );
    expect(bad((r) => (r.events[0]!.type = 'boom'))).toThrow('e1 has the type boom');
    expect(bad((r) => ((r.cards[0]!.cam as L).proj = 'iso'))).toThrow('c1 has a camera');
    expect(bad((r) => (r.cards[0]!.clip = { t0: 5, t1: 5, rate: 1, beats: [] }))).toThrow(
      /slice start must be before/,
    );
    expect(bad((r) => (r.debrief = { tspi: { T9: [] }, events: [] }))).toThrow(
      'Debrief refers to path T9 that does not exist.',
    );
    expect(bad((r) => (r.debrief = { tspi: { T1: [[0, 1, 2]] }, events: [] }))).toThrow(
      'Debrief TSPI for T1 needs t, x, y, z samples.',
    );
  });
});

describe('migrateV5ToV6', () => {
  it('takes a v5 record to v8: empty lists, a null debrief and empty threat groups', () => {
    const v6 = templateById('swarm-split')!.make();
    const v5 = JSON.parse(JSON.stringify(v6)) as Record<string, unknown> & {
      threats: Record<string, unknown>[];
      areas: Record<string, unknown>[];
    };
    v5.schema = 'profile-studio/5';
    for (const k of ['planes', 'events', 'snapshots', 'cards', 'debrief']) delete v5[k];
    for (const t of v5.threats) delete t.group;
    v5.areas.push({ ...v5.areas[0]!, key: 'nfz-key', id: 'NFZ-1', kind: 'nfz' });
    delete v5.areas[1]!.zMinM;
    delete v5.areas[1]!.zMaxM;

    // The template is v7: a stored v5 record has no collection, class or version.
    for (const k of ['collection', 'class', 'version']) delete v5[k];
    const v = parseVignette(v5);
    expect(v.schema).toBe('profile-studio/8');
    expect([v.collection, v.class, v.version]).toEqual([v6.site.name, 'Custom', 1]);
    expect([v.planes, v.events, v.snapshots, v.cards, v.debrief]).toEqual([[], [], [], [], null]);
    expect(v.threats.length).toBeGreaterThan(0);
    expect(v.threats.every((t) => t.group === '')).toBe(true);
    expect(v.areas[0]).toEqual(v6.areas[0]);
    expect(v.areas[1]).toMatchObject({ id: 'NFZ-1', zMinM: 0, zMaxM: 150 });
    expect({ ...v, areas: [] }).toEqual({
      ...v6,
      areas: [],
      collection: v6.site.name,
      class: 'Custom',
    });
    expect(migrateV5ToV6(v6)).toBe(v6);
  });
});
