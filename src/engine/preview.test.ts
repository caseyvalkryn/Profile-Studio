// @vitest-environment node
/// <reference types="node" />
// Parity of preview() against the frozen legacy derive output in fixtures/legacy-derive/.
// Fixture numbers are rounded to 6 decimals; tolerance is 1e-3 s and 1e-3 m beyond that.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { importLegacyV4 } from '../domain/migrate';
import { preview } from './preview';
import type { Preview } from './preview';

type Rec = Record<string, unknown> & { id: string };
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

type Win = { tIn: number; tOut: number; rIn: number; rOut: number };
type Fixture = {
  derived: {
    tmax: number;
    timed: Record<string, { x: number; y: number; z: number; t0: number; t1: number }[]>;
    windows: Record<string, Record<string, Win[]>>;
    first: Record<string, Record<string, { t: number; r: number; pos: { z: number } } | null>>;
    firstSensor: Record<string, { system: string; t: number } | null>;
    firstEffector: Record<string, { system: string; t: number } | null>;
    vols: Record<string, Record<string, { tIn: number; tOut: number }[]>>;
    daEntry: Record<string, number | null>;
    dLink: { value: number | null; auto: boolean };
    splits: { t: number; from: number; to: number }[];
    ladder: Record<string, Record<string, { t: number | null; source: string | null }>>;
    window: Record<string, { latest: number | null; margin: number | null }>;
  };
};

function fixture(id: string): Fixture {
  const file = path.resolve(__dirname, '../../fixtures/legacy-derive', id + '.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Fixture;
}

const TOL = 1e-3 + 1e-6;
const close = (a: number, b: number, where: string) =>
  expect(Math.abs(a - b), `${where}: ${a} vs ${b}`).toBeLessThanOrEqual(TOL);

const PS = loadLegacy();
const seeds = PS.seed.load();
const templates = PS.seed.templates.map((t) => t.make(t.id));

/** Display id to key maps for one imported vignette. */
function keysOf(p: Preview, v: ReturnType<typeof importLegacyV4>) {
  const threatKey = new Map(v.threats.map((t) => [t.id, t.key]));
  const systemKey = new Map([...v.sensors, ...v.effectors].map((s) => [s.id, s.key]));
  const areaKey = new Map(v.areas.map((a) => [a.id, a.key]));
  return { threatKey, systemKey, areaKey, p };
}

describe('preview parity with legacy derive', () => {
  it.each(seeds.map((r) => [r.id, r] as const))('%s', (id, rec) => {
    const F = fixture(id).derived;
    const v = importLegacyV4(JSON.parse(JSON.stringify(rec)));
    const p = preview(v);
    const { threatKey, systemKey, areaKey } = keysOf(p, v);

    close(p.tmaxS, F.tmax, 'tmax');

    // timed paths
    for (const [tid, tw] of Object.entries(F.timed)) {
      const mine = p.threats[threatKey.get(tid)!]!.timed;
      expect(mine).toHaveLength(tw.length);
      tw.forEach((q, i) => {
        const m = mine[i]!;
        for (const f of ['x', 'y', 'z', 't0', 't1'] as const)
          close(m[f], q[f], `timed ${tid}[${i}].${f}`);
      });
    }

    // coverage windows for every sensor and effector (legacy also computed TSPI nodes; skipped)
    for (const [sid, byPath] of Object.entries(F.windows)) {
      const sk = systemKey.get(sid);
      if (!sk) continue;
      for (const [tid, ws] of Object.entries(byPath)) {
        const mine = p.windows[sk]![threatKey.get(tid)!]!;
        expect(mine, `windows ${sid}/${tid}`).toHaveLength(ws.length);
        ws.forEach((w, i) => {
          const m = mine[i]!;
          for (const f of ['tIn', 'tOut', 'rIn', 'rOut'] as const)
            close(m[f], w[f], `windows ${sid}/${tid}[${i}].${f}`);
        });
      }
    }

    // first detection
    for (const [tid, fs] of Object.entries(F.firstSensor)) {
      const t = p.threats[threatKey.get(tid)!]!;
      if (!fs) {
        expect(t.first).toBeNull();
        continue;
      }
      expect(t.first, `first ${tid}`).not.toBeNull();
      expect(t.first!.sensor).toBe(systemKey.get(fs.system));
      close(t.first!.t, fs.t, `first ${tid}.t`);
      const leg = F.first[tid]![fs.system]!;
      close(t.first!.rangeM, leg.r, `first ${tid}.rangeM`);
      close(t.first!.altM, leg.pos.z, `first ${tid}.altM`);
    }
    for (const [tid, fe] of Object.entries(F.firstEffector)) {
      const t = p.threats[threatKey.get(tid)!]!;
      if (!fe) expect(t.firstEffector).toBeNull();
      else {
        expect(t.firstEffector!.effector).toBe(systemKey.get(fe.system));
        close(t.firstEffector!.t, fe.t, `firstEffector ${tid}`);
      }
    }

    // area entry and exit, defended asset entry
    for (const [aid, byPath] of Object.entries(F.vols)) {
      for (const [tid, ws] of Object.entries(byPath)) {
        const mine = p.threats[threatKey.get(tid)!]!.areas[areaKey.get(aid)!]!;
        expect(mine, `vols ${aid}/${tid}`).toHaveLength(ws.length);
        ws.forEach((w, i) => {
          close(mine[i]!.tIn, w.tIn, `vols ${aid}/${tid}[${i}].tIn`);
          close(mine[i]!.tOut, w.tOut, `vols ${aid}/${tid}[${i}].tOut`);
        });
      }
    }
    for (const [tid, da] of Object.entries(F.daEntry)) {
      const mine = p.threats[threatKey.get(tid)!]!.assetEntryS;
      if (da == null) expect(mine).toBeNull();
      else close(mine!, da, `daEntry ${tid}`);
    }

    // geometric stage times where the legacy rung came from geometry (no authored event)
    for (const [tid, L] of Object.entries(F.ladder)) {
      const st = p.threats[threatKey.get(tid)!]!.stages;
      const pairs: [string, (typeof st)[keyof typeof st]][] = [
        ['detect', st.find],
        ['track', st.fix],
        ['id', st.track],
        ['engage', st.engage],
        ['effect', st.assess],
      ];
      for (const [rung, mine] of pairs) {
        const leg = L[rung]!;
        if (leg.source === 'event') continue;
        // the legacy effect rung builds on the engage rung, so an authored engage taints it
        if (rung === 'effect' && L.engage!.source === 'event') continue;
        if (leg.t == null) expect(mine, `${tid}.${rung}`).toBeNull();
        else close(mine!.t, leg.t, `${tid}.${rung}`);
      }
      const W = F.window[tid]!;
      const mine = p.threats[threatKey.get(tid)!]!.window;
      if (L.engage!.source !== 'event') {
        if (W.latest == null) expect(mine.latestEngageS).toBeNull();
        else {
          close(mine.latestEngageS!, W.latest, `${tid}.latest`);
          close(mine.marginS!, W.margin!, `${tid}.margin`);
        }
      }
    }

    // link distance and splits (0.1 s: the legacy walk samples at 0.1 s)
    if (F.dLink.value == null) expect(p.dLink.value).toBeNull();
    else close(p.dLink.value!, F.dLink.value, 'dLink');
    expect(p.splits, 'splits').toHaveLength(F.splits.length);
    F.splits.forEach((s, i) => {
      const m = p.splits[i]!;
      expect(m.from).toBe(s.from);
      expect(m.to).toBe(s.to);
      expect(Math.abs(m.t - s.t), `splits[${i}].t ${m.t} vs ${s.t}`).toBeLessThanOrEqual(
        0.1 + 1e-6,
      );
    });
  });

  it.each(templates.map((r) => [r.id, r] as const))('%s (no paths) runs empty', (_id, rec) => {
    const v = importLegacyV4(JSON.parse(JSON.stringify(rec)));
    const p = preview(v);
    expect(p.tmaxS).toBe(60);
    expect(p.splits).toEqual([]);
    for (const byThreat of Object.values(p.windows))
      for (const ws of Object.values(byThreat)) expect(ws).toEqual([]);
    for (const t of Object.values(p.threats)) {
      expect(t.first).toBeNull();
      expect(t.stages.find).toBeNull();
    }
  });
});
