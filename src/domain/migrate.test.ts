// @vitest-environment node
/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DEFAULT_MEASURES, importLegacyV4, TARGET_TIME_NOTE } from './migrate';
import { parseVignette } from './schema';

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
