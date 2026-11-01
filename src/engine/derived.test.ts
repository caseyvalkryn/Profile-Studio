// @vitest-environment node
/// <reference types="node" />
// Parity of derived() against the frozen legacy derive output in fixtures/legacy-derive/ (the
// `derived` and `samples` members; `input` is the legacy v4 record). Tolerances as preview.test.ts:
// 1e-3 beyond the fixture rounding, 0.1 s for window and split edges. Also the cases of
// legacy/test/cases/derive.js that the field comparison does not cover.
import fs from 'node:fs';
import path from 'node:path';
import { importLegacyV4 } from '../domain/migrate';
import type { Vignette } from '../domain/types';
import { derived, byId } from './derived';
import type { Derived, Rung, RungName } from './derived';
import { preview } from './preview';
import { resolveTokens } from './tokens';

type Num = number | null;
type Fixture = {
  input: unknown;
  derived: {
    speeds: Record<string, number>;
    timed: Record<string, { x: number; y: number; z: number; t0: number; t1: number }[]>;
    groupOf: Record<string, string>;
    emitsRf: Record<string, boolean>;
    tmax: number;
    origin: { x: number; y: number; z: number };
    windows: Record<
      string,
      Record<string, { tIn: number; tOut: number; rIn: number; rOut: number }[]>
    >;
    windowsRing: Record<string, Record<string, { tIn: number; tOut: number }[]>>;
    first: Record<
      string,
      Record<string, { t: number; r: number; pos: { x: number; y: number; z: number } } | null>
    >;
    last: Record<string, Record<string, { t: number; r: number } | null>>;
    firstSensor: Record<string, { system: string; t: number } | null>;
    firstEffector: Record<string, { system: string; t: number } | null>;
    vols: Record<string, Record<string, { tIn: number; tOut: number }[]>>;
    daEntry: Record<string, Num>;
    dLink: { value: Num; auto: boolean };
    splits: { t: number; from: number; to: number }[];
    ladder: Record<string, Record<string, Rung>>;
    window: Record<string, Record<string, Num>>;
    warnings: Record<string, unknown>[];
    crossings: Record<string, { t: number; system: string; kind: string; r: number }[]>;
    trackLine: Record<string, { t0: number; t1: number; state: string }[]>;
    flown: Record<string, unknown>;
  };
  samples: {
    t: number[];
    at: Record<string, (Record<string, unknown> | null)[]>;
    envelopesAt: { hull: number[][]; members: string[] }[][];
  };
};

const IDS = [
  'CUAS-001',
  'MULTI-001',
  'OWA-001',
  'SURR-001',
  'blank',
  'fixed-wing-ingress',
  'point-defence',
  'range-test',
  'swarm',
];

function fixture(id: string): Fixture {
  const file = path.resolve(__dirname, '../../fixtures/legacy-derive', id + '.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Fixture;
}

const TOL = 1e-3 + 1e-6;
const close = (a: Num | undefined, b: Num, where: string, tol = TOL) => {
  if (b == null) {
    expect(a, where).toBeNull();
    return;
  }
  expect(a, where).not.toBeNull();
  expect(Math.abs(a! - b), `${where}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);
};
/** Numbers within TOL, everything else equal; `where` names the path. */
function closeDeep(a: unknown, b: unknown, where: string, tol = TOL): void {
  if (typeof b === 'number') {
    expect(typeof a, where).toBe('number');
    expect(Math.abs((a as number) - b), `${where}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);
  } else if (Array.isArray(b)) {
    expect(Array.isArray(a), where).toBe(true);
    expect(a, where).toHaveLength(b.length);
    b.forEach((x, i) => closeDeep((a as unknown[])[i], x, `${where}[${i}]`, tol));
  } else if (b && typeof b === 'object') {
    expect(a && typeof a === 'object', where).toBe(true);
    for (const k of Object.keys(b))
      closeDeep(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${where}.${k}`,
        tol,
      );
  } else expect(a, where).toBe(b);
}

function build(F: Fixture): { v: Vignette; d: Derived } {
  const v = importLegacyV4(JSON.parse(JSON.stringify(F.input)));
  const p = preview(v);
  return { v, d: derived(v, p) };
}

/** The legacy rung under each F2T2EA stage, as derived.ts ladderFor maps them. */
const RUNG_OF_STAGE = {
  find: 'detect',
  fix: 'track',
  track: 'id',
  engage: 'engage',
  assess: 'effect',
} as const;
type RungView = { t: Num; system: string | null; tGeo: Num; warn: boolean; warnText: string };

/** The legacy rungs of one threat rebuilt from `stages` and the event warnings. */
function rungsOf(v: Vignette, d: Derived, pid: string): Record<RungName, RungView> {
  const st = d.stages[pid]!;
  const keyOfEvent = new Map(v.events.map((e) => [e.id, e.threatKey]));
  const key = v.threats.find((t) => t.id === pid)!.key;
  const out = {} as Record<RungName, RungView>;
  for (const [stage, rung] of Object.entries(RUNG_OF_STAGE)) {
    const s = st[stage as keyof typeof st];
    const w = d.warnings.find(
      (x) => x.kind === 'event' && x.rung === rung && keyOfEvent.get(x.eventId!) === key,
    );
    out[rung] = {
      t: s ? s.t : null,
      system: s ? s.system : null,
      tGeo: s ? s.tGeo : null,
      warn: !!w,
      warnText: w ? w.text : '',
    };
  }
  return out;
}
/** The authored event time of one id. */
const evT = (v: Vignette, id: string) => v.events.find((e) => e.id === id)!.tS;

describe('derived parity with legacy derive', () => {
  it.each(IDS)('%s', (id) => {
    const F = fixture(id);
    const L = F.derived;
    const { v, d } = build(F);

    closeDeep(d.speeds, L.speeds, 'speeds');
    closeDeep(d.timed, L.timed, 'timed');
    expect(d.groupOf).toEqual(L.groupOf);
    expect(d.emitsRf).toEqual(L.emitsRf);
    close(d.tmax, L.tmax, 'tmax');
    closeDeep(d.origin, L.origin, 'origin');

    // windows for every system, nodes included, and the ring-only windows (0.1 s on edges)
    expect(Object.keys(d.windows).sort()).toEqual(Object.keys(L.windows).sort());
    closeDeep(d.windows, L.windows, 'windows', 0.1 + 1e-6);
    closeDeep(d.windowsRing, L.windowsRing, 'windowsRing', 0.1 + 1e-6);
    closeDeep(d.first, L.first, 'first');
    closeDeep(d.last, L.last, 'last');
    closeDeep(d.firstSensor, L.firstSensor, 'firstSensor');
    closeDeep(d.firstEffector, L.firstEffector, 'firstEffector');
    closeDeep(d.vols, L.vols, 'vols');
    closeDeep(d.daEntry, L.daEntry, 'daEntry');
    closeDeep(d.dLink, L.dLink, 'dLink');
    expect(d.splits).toHaveLength(L.splits.length);
    L.splits.forEach((s, i) => {
      expect(d.splits[i]!.from).toBe(s.from);
      expect(d.splits[i]!.to).toBe(s.to);
      close(d.splits[i]!.t, s.t, `splits[${i}].t`, 0.1 + 1e-6);
    });

    // legacy rungs under their F2T2EA stages; the engage rung is the one documented difference:
    // its geometric time is the first effector window at or after Target (spec section 3),
    // where legacy took the first effector reach. Equal whenever that window opens after Target.
    for (const [pid, rungs] of Object.entries(L.ladder)) {
      const mine = rungsOf(v, d, pid);
      for (const [k, R] of Object.entries(rungs)) {
        const m = mine[k as RungName];
        const where = `rung ${pid}.${k}`;
        const want = {
          t: R.t,
          system: R.t == null ? null : R.system,
          tGeo: R.t == null ? null : R.tGeo,
          warn: R.warn,
          warnText: R.warnText,
        };
        if (R.source === 'event') close(m.t, evT(v, R.event!), `${where} event time`);
        if (k === 'engage' && R.tGeo != null && m.tGeo != null && Math.abs(m.tGeo - R.tGeo) > TOL) {
          const fe = L.firstEffector[pid]!;
          close(R.tGeo, fe.t, `${where}.tGeo legacy is first effector reach`);
          expect(m.tGeo, `${where}.tGeo gated at Target`).toBeGreaterThan(R.tGeo);
          closeDeep({ ...m, tGeo: R.tGeo }, want, where);
        } else closeDeep(m, want, where);
      }
      const st = d.stages[pid]!;
      if (st.track) {
        expect(st.target, `stages ${pid}.target`).not.toBeNull();
        close(
          st.target!.t,
          st.track.t + v.chainTime.decisionS + v.chainTime.assignS,
          `stages ${pid}.target.t`,
        );
      } else expect(st.target).toBeNull();
    }
    closeDeep(d.window, L.window, 'window');
    closeDeep(d.warnings, L.warnings, 'warnings');
    expect(d.warnings.map((w) => w.text)).toEqual(L.warnings.map((w) => w.text));
    // crossings: ties at one time follow the system order, which the import splits by class
    const byTime = <T extends { t: number; system: string; kind: string }>(xs: T[]) =>
      xs.slice().sort((a, b) => a.t - b.t || (a.system + a.kind).localeCompare(b.system + b.kind));
    for (const pid of Object.keys(L.crossings))
      closeDeep(byTime(d.crossings[pid]!), byTime(L.crossings[pid]!), `crossings ${pid}`);
    closeDeep(d.trackLine, L.trackLine, 'trackLine');
    expect(L.flown).toEqual({});
    expect('flown' in d).toBe(false);

    // samples: at(threatId, t, 'asset') and envelopesAt(t)
    // the fixture rounds tmax to 6 decimals, which can land past the exact path end: clamp
    F.samples.t.forEach((tRaw, i) => {
      const t = Math.min(tRaw, d.tmax);
      for (const [pid, rows] of Object.entries(F.samples.at))
        closeDeep(d.at(pid, t, 'asset'), rows[i], `at ${pid} t=${t}`);
      closeDeep(d.envelopesAt(t), F.samples.envelopesAt[i], `envelopesAt t=${t}`);
    });
  });

  it('is memoised by (vignette, preview) reference', () => {
    const F = fixture('CUAS-001');
    const v = importLegacyV4(JSON.parse(JSON.stringify(F.input)));
    const p = preview(v);
    expect(derived(v, p)).toBe(derived(v, p));
    expect(derived(v, preview(v))).not.toBe(derived(v, p));
    const v2 = structuredClone(v);
    expect(derived(v2, p)).not.toBe(derived(v, p));
  });
});

// The cases of legacy/test/cases/derive.js the field comparison leaves out.
describe('derived, legacy derive.js cases', () => {
  const C = build(fixture('CUAS-001'));
  const O = build(fixture('OWA-001'));
  const M = build(fixture('MULTI-001'));
  const near = (a: Num | undefined, b: number, tol: number, what: string) => close(a, b, what, tol);

  it('CUAS-001 rungs, window, first see and readout', () => {
    const d = C.d;
    const L = rungsOf(C.v, d, 'T1');
    const typed = (type: string) => C.v.events.find((e) => e.type === type)!.tS;
    expect(L.detect.t).toBe(typed('detect'));
    expect(L.track.t).toBe(typed('track'));
    expect(L.id.t).toBe(typed('identify'));
    expect(L.engage.t).toBe(typed('engage'));
    expect(d.window.T1!.planned).toBe(234);
    near(d.window.T1!.geometric, 287.7, 1, 'geometric window');
    near(d.first.T1!['EO-1']!.t, 175.4, 0.5, 'EO-1 first see');
    expect(L.detect.warn).toBe(false);
    near(L.track.tGeo, 33.1, 0.5, 'track tGeo');
    expect(L.track.warn).toBe(false);
    near(L.id.tGeo, 180.4, 0.5, 'id tGeo');
    expect(L.id.warn).toBe(true);
    near(d.daEntry.T1, 414.1, 0.5, 'daEntry');
    near(d.window.T1!.latest, 404.1, 1, 'latest engage');
    near(d.window.T1!.margin, 142.1, 1, 'margin');
    expect(L.engage.warn).toBe(false);
    expect(L.effect).toMatchObject({ t: evT(C.v, 'e6'), warn: true });
    expect(L.effect.t).toBe(300);
    near(d.window.T1!.rangeAtEngage, 2121, 5, 'range at engage');
    near(d.tta('T1', 0), 414.1, 0.5, 'tta at 0');
    const cov = d.coveringAt('T1', 150);
    expect(cov).toContain('RDR-1');
    expect(cov).toContain('RF-1');
    expect(cov).not.toContain('EW-1');
    expect(d.holdsAt('RDR-1', 150)).toEqual(['T1']);
    expect(d.trackLine.T1!.map((s) => s.state)).toEqual(['pending', 'unknown', 'identity']);
    const at = d.at('T1', 262, 'asset')!;
    near(at.r, 2121, 5, 'at() range');
    near(at.margin, 142.1, 1, 'at() margin');
    expect(d.originAt('asset-edge', 'T1', 0).x).toBe(250);
    expect(d.originAt('RF-1', null, null).x).toBe(180);
    expect(d.originAt(C.v.sensors.find((s) => s.id === 'RF-1')!.key, null, null).x).toBe(180);
  });

  it('CUAS-001 tokens', () => {
    expect(resolveTokens('{T1.margin}', C.d, 262).text).toContain('2:22');
    const unk = resolveTokens('{T9.rng}', C.d, 0);
    expect(unk.text).toBe('{T9.rng}');
    expect(unk.issues).toEqual([{ token: '{T9.rng}', reason: '{T9.rng} has no threat T9.' }]);
  });

  it('CUAS-001 warning texts', () => {
    const w = C.d.warnings;
    expect(w.find((x) => x.eventId === 'e3')!.text).toBe(
      'e3 is 30 s early. EO-1 can identify T1 at t+3:00.',
    );
    expect(w.find((x) => x.eventId === 'e6')!.text).toBe('e6 is before EW-1 reach at t+5:18.');
  });

  it('OWA-001 RF-silent threat, early events, effect from e5', () => {
    const d = O.d;
    const L = rungsOf(O.v, d, 'T1');
    expect(d.emitsRf.T1).toBe(false);
    near(d.first.T1!['EO-1']!.t, 158.2, 0.5, 'EO-1 first see');
    expect(L.detect.warn).toBe(true);
    near(L.track.tGeo, 75.3, 0.5, 'track tGeo');
    expect(L.track.warn).toBe(true);
    near(L.id.tGeo, 163.2, 0.5, 'id tGeo');
    expect(L.id.warn).toBe(true);
    near(d.window.T1!.latest, 251.5, 1, 'latest engage');
    near(d.window.T1!.margin, 76.5, 1, 'margin');
    expect(L.engage.warn).toBe(false);
    expect(L.effect.t).toBe(200);
    expect(evT(O.v, 'e5')).toBe(200);
    expect(d.window.T1!.planned).toBe(135);
    near(d.window.T1!.geometric, 130.6, 1, 'geometric window');
    expect(d.firstSensor.T1!.system).toBe('RDR-1');
  });

  it('event warnings over the seeds carry their fields', () => {
    const got: string[] = [];
    for (const [id, b] of [
      ['CUAS-001', C],
      ['OWA-001', O],
      ['MULTI-001', M],
    ] as const) {
      for (const w of b.d.warnings) {
        if (!w.eventId || (id === 'OWA-001' && w.eventId === 'e5')) continue;
        expect(w.tA).not.toBeNull();
        expect(w.tGeo).not.toBeNull();
        expect(w.delta).not.toBeNull();
        expect(w.text).toBeTruthy();
        got.push(`${id} ${w.eventId}`);
      }
    }
    expect(got.sort()).toEqual([
      'CUAS-001 e3',
      'CUAS-001 e6',
      'OWA-001 e1',
      'OWA-001 e2',
      'OWA-001 e3',
    ]);
  });

  it('MULTI-001 link distance, splits, margins and envelopes', () => {
    const d = M.d;
    near(d.dLink.value, 530.5, 1, 'dLink');
    expect(d.dLink.auto).toBe(true);
    expect(d.splits).toHaveLength(2);
    expect(d.splits[0]).toMatchObject({ from: 1, to: 2 });
    near(d.splits[0]!.t, 94.6, 0.5, 'split');
    expect(d.splits[1]).toMatchObject({ from: 2, to: 1 });
    near(d.splits[1]!.t, 282.4, 0.5, 'merge');
    expect(d.warnings).toHaveLength(0);
    near(d.window.B2!.margin, 132.2, 1, 'B2 margin');
    near(d.window.A3!.margin, 61.2, 1, 'A3 margin');
    expect(d.envelopesAt(150)).toHaveLength(2);
  });

  it('rangeSeries is cached per (threat, ref) and follows the asset edge', () => {
    const d = C.d;
    expect(d.rangeSeries('T1')).toBe(d.rangeSeries('T1', 'asset'));
    expect(d.rangeSeries('T1', 'RDR-1')).not.toBe(d.rangeSeries('T1'));
    const edge = d.rangeSeries('T1', 'asset-edge');
    const centre = d.rangeSeries('T1', 'asset');
    expect(edge).toHaveLength(centre.length);
    expect(edge[0]!.r).toBeLessThan(centre[0]!.r);
    expect(d.rangeSeries('T9')).toEqual([]);
  });

  it('byId maps display ids to records and keys', () => {
    const m = byId(C.v);
    const t = m.byId.get('T1')!;
    expect(t.kind).toBe('threat');
    expect(m.idOf.get(t.key)).toBe('T1');
    expect(m.byId.get('e3')!.kind).toBe('event');
    expect(m.byId.get('DA')!.kind).toBe('area');
  });
});
