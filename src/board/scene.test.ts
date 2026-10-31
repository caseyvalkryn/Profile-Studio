// @vitest-environment node
// toScene maps a v6 vignette back to the legacy record shape the board reads, keyed by display
// id. Check: toScene(importLegacyV4(fixture.input)) equals fixture.input on the mapped fields,
// with `key` added on every record.
import { importLegacyV4 } from '../domain/migrate';
import { toScene } from './scene';
import { FIXTURES, fixture } from './testkit';

type Obj = Record<string, unknown>;

function stripKeys(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(stripKeys);
  if (x && typeof x === 'object') {
    const o: Obj = {};
    for (const [k, v] of Object.entries(x as Obj)) if (k !== 'key') o[k] = stripKeys(v);
    return o;
  }
  return x;
}

function hasKeys(list: readonly { key?: unknown }[], where: string) {
  for (const r of list) expect(typeof r.key, where).toBe('string');
}

describe('toScene', () => {
  it.each(FIXTURES)('%s', (id) => {
    const input = fixture(id).input as unknown as Obj & {
      scene: Obj;
      events?: Obj[];
      snapshots?: number[];
      site?: Obj;
      units?: string;
    };
    const v = importLegacyV4(JSON.parse(JSON.stringify(input)));
    const sc = toScene(v);
    expect(toScene(v)).toBe(sc); // memoised per vignette

    const L = input.scene as {
      systems: Obj[];
      volumes: Obj[];
      paths: Obj[];
      planes: Obj[];
      aircraft: Obj[];
    };
    for (const k of ['systems', 'volumes', 'paths', 'planes', 'aircraft'] as const)
      hasKeys(sc.scene[k], id + ' ' + k);
    hasKeys(sc.events, id + ' events');
    for (const p of sc.scene.paths) hasKeys(p.pts, id + ' path pts');

    // systems: every field but a node's fov (v6 keeps no node fov; the catalog default stands)
    const nodes = new Set(['c2', 'tspi']);
    const mineSys = stripKeys(sc.scene.systems) as Obj[];
    expect(mineSys.map((s) => s.id)).toEqual(L.systems.map((s) => s.id));
    mineSys.forEach((s, i) => {
      const l = { ...L.systems[i]! };
      if (nodes.has(String(l.kind))) delete l.fov;
      expect(s, id + ' system ' + String(l.id)).toMatchObject(l);
    });

    expect(stripKeys(sc.scene.volumes), id + ' volumes').toEqual(L.volumes);
    expect(stripKeys(sc.scene.planes), id + ' planes').toEqual(L.planes);

    // paths: every field but `aircraft`, which v6 makes one per threat; compare the archetype instead
    const archOf = (list: Obj[], aid: unknown) => list.find((a) => a.id === aid)?.arch;
    const minePaths = stripKeys(sc.scene.paths) as Obj[];
    expect(minePaths.map((p) => p.id)).toEqual(L.paths.map((p) => p.id));
    minePaths.forEach((p, i) => {
      const l = L.paths[i]!;
      const { aircraft: la, ...lrest } = l;
      const { aircraft: ma, ...mrest } = p;
      expect(mrest, id + ' path ' + String(l.id)).toEqual(lrest);
      expect(archOf(stripKeys(sc.scene.aircraft) as Obj[], ma), id + ' arch ' + String(l.id)).toBe(
        archOf(L.aircraft, la),
      );
    });

    expect(stripKeys(sc.events), id + ' events').toEqual(input.events || []);
    expect(sc.snapshots, id + ' snapshots').toEqual(input.snapshots || []);
    // site name: importLegacyV4 names an unnamed site after the collection, so compare datum and elev
    const site = (input.site as Obj) || {};
    expect({ datum: sc.site.datum, elev: sc.site.elev }, id + ' site').toEqual({
      datum: site.datum ?? 'AGL',
      elev: site.elev ?? 0,
    });
    expect(sc.units, id + ' units').toBe(input.units || 'nav');
  });
});
