// The renderer's derived object, built from `Preview`.
// Field names and shapes follow the legacy app's derive output (legacy/js), keyed by display id
// (`Threat.id`, system `id`, `Area.id`) as the legacy app was, with F2T2EA `stages` in place of
// the five-rung ladder; the legacy rungs stay internal to `ladderFor`. Pure: no React, DOM or
// store. Memoised by (vignette, preview) reference.

import type {
  Area,
  AuthoredEvent,
  Effector,
  Node as SysNode,
  Sensor,
  Vignette,
} from '../domain/types';
import { coverageWindows, endOf, rangeAt, posAt, samplePath } from './geo';
import type { AreaWindow, Pt3, Split, TimedPoint, Window } from './geo';
import type { Preview, ThreatPreview } from './preview';
import { closing, coveringAt, holdsAt, originAt, readoutAt, tta } from './at';
import type { Readout, ReadoutContext } from './at';
import { crossingsFor } from './crossings';
import type { Crossing } from './crossings';
import { envelopesAt } from './envelopes';
import type { Envelope } from './envelopes';
import { rangeSeriesCache, rangeSeriesOf } from './rangeSeries';
import type { RangeSample } from './rangeSeries';
import { legacyUnits, mmss } from './tokens';
import { trackLineFor } from './trackLine';
import type { TrackSpan } from './trackLine';

// ---------------------------------------------------------------- types

export type RungName = 'detect' | 'track' | 'id' | 'engage' | 'effect';
export const RUNGS: readonly RungName[] = ['detect', 'track', 'id', 'engage', 'effect'];

/** One legacy ladder rung. `source` says whether an authored event or geometry set `t`. */
export type Rung = {
  t: number | null;
  /** Horizontal range from the rung's system (else the origin) at `t`. */
  r: number | null;
  source: 'event' | 'geometry' | null;
  /** The authored event id when `source` is 'event'. */
  event: string | null;
  system: string | null;
  /** The geometric time, kept for comparison when an authored event set `t`. */
  tGeo: number | null;
  warn: boolean;
  warnText: string;
  /** True for a planning rung (track, id, effect) whose time came from a model default. */
  planning: boolean;
};
export type Ladder = Record<RungName, Rung>;

export type StageName = 'find' | 'fix' | 'track' | 'target' | 'engage' | 'assess';
export const STAGES: readonly StageName[] = ['find', 'fix', 'track', 'target', 'engage', 'assess'];

/** One F2T2EA stage: `t` is the authored time when an event of its type exists, else `tGeo`. */
export type DerivedStage = { t: number; system: string | null; tGeo: number | null } | null;
export type DerivedStages = Record<StageName, DerivedStage>;

export type FirstSee = { t: number; r: number; pos: Pt3 };
export type LastSee = { t: number; r: number };
export type SystemTime = { system: string; t: number };

export type WindowSummary = {
  /** Authored engage minus authored detect; null without both. */
  planned: number | null;
  /** First effector reach minus first sensor reach. */
  geometric: number | null;
  detectT: number | null;
  engageT: number | null;
  rangeAtEngage: number | null;
  /** Defended asset entry time. */
  tDA: number | null;
  /** Latest engage that still gets an effect before the asset entry or the window close. */
  latest: number | null;
  margin: number | null;
};

export type Warning = {
  kind: 'system' | 'path' | 'event';
  id: string;
  text: string;
  eventId: string | null;
  rung: RungName | null;
  /** Authored time. */
  tA: number | null;
  tGeo: number | null;
  delta: number | null;
  system: string | null;
  rangeAtA: number | null;
};

export type Derived = {
  speeds: Record<string, number>;
  timed: Record<string, TimedPoint[]>;
  groupOf: Record<string, string>;
  emitsRf: Record<string, boolean>;
  tmax: number;
  origin: Pt3;
  /** Coverage windows by system id (sensors, effectors, nodes), then threat id. */
  windows: Record<string, Record<string, Window[]>>;
  /** Windows under the status-and-range rule only (the static ring). */
  windowsRing: Record<string, Record<string, AreaWindow[]>>;
  first: Record<string, Record<string, FirstSee | null>>;
  last: Record<string, Record<string, LastSee | null>>;
  firstSensor: Record<string, SystemTime | null>;
  firstEffector: Record<string, SystemTime | null>;
  /** Area entry and exit windows by area id, then threat id. */
  vols: Record<string, Record<string, AreaWindow[]>>;
  daEntry: Record<string, number | null>;
  dLink: { value: number | null; auto: boolean };
  splits: Split[];
  stages: Record<string, DerivedStages>;
  window: Record<string, WindowSummary>;
  warnings: Warning[];
  crossings: Record<string, Crossing[]>;
  trackLine: Record<string, TrackSpan[]>;
  // `flown` (legacy: present only with debrief TSPI) is absent until lane 9.3.3 adds `resample`.

  originAt: (ref: string | null | undefined, threatId: string | null, t: number | null) => Pt3;
  closing: (threatId: string, t: number | null, ref?: string | null) => number;
  tta: (threatId: string, t: number | null) => number | null;
  envelopesAt: (t: number | null) => Envelope[];
  rangeSeries: (threatId: string, ref?: string | null) => RangeSample[];
  coveringAt: (threatId: string, t: number | null) => string[];
  holdsAt: (systemId: string, t: number | null) => string[];
  at: (threatId: string, t: number | null, ref?: string | null) => Readout | null;
  /** Position of a sensor, effector or node by id or key; null when there is none. */
  systemAt: (ref: string) => Pt3 | null;
};

// ---------------------------------------------------------------- id maps

export type System = Sensor | Effector | SysNode;
export type IdEntry =
  | { kind: 'threat'; key: string; record: Vignette['threats'][number] }
  | { kind: 'sensor'; key: string; record: Sensor }
  | { kind: 'effector'; key: string; record: Effector }
  | { kind: 'node'; key: string; record: SysNode }
  | { kind: 'area'; key: string; record: Area }
  | { kind: 'event'; key: string; record: AuthoredEvent };

/** Display id to record and key, and key to display id, for one profile. */
export function byId(v: Vignette): { byId: Map<string, IdEntry>; idOf: Map<string, string> } {
  const map = new Map<string, IdEntry>();
  const idOf = new Map<string, string>();
  const put = (e: IdEntry, id: string) => {
    map.set(id, e);
    idOf.set(e.key, id);
  };
  for (const t of v.threats) put({ kind: 'threat', key: t.key, record: t }, t.id);
  for (const s of v.sensors) put({ kind: 'sensor', key: s.key, record: s }, s.id);
  for (const e of v.effectors) put({ kind: 'effector', key: e.key, record: e }, e.id);
  for (const n of v.nodes) put({ kind: 'node', key: n.key, record: n }, n.id);
  for (const a of v.areas) put({ kind: 'area', key: a.key, record: a }, a.id);
  for (const e of v.events) put({ kind: 'event', key: e.key, record: e }, e.id);
  return { byId: map, idOf };
}

// ---------------------------------------------------------------- ladder

const TOL = 3; // bead snap tolerance in seconds
const VERB: Record<'detect' | 'track' | 'id', string> = {
  detect: 'detect',
  track: 'track',
  id: 'identify',
};
/** Authored event type per rung: detect is Find, track is Fix, identify is Track. */
const EVENT_TYPE: Record<'detect' | 'track' | 'id' | 'engage', AuthoredEvent['type']> = {
  detect: 'detect',
  track: 'track',
  id: 'identify',
  engage: 'engage',
};

function rung(
  t: number | null,
  r: number | null,
  source: Rung['source'],
  event: string | null,
  system: string | null,
  tGeo: number | null,
  planning: boolean,
): Rung {
  return { t, r, source, event, system, tGeo, warn: false, warnText: '', planning };
}
const NULL_RUNG = () => rung(null, null, null, null, null, null, false);

function firstWindowFrom(ws: readonly Window[] | undefined, t: number): Window | null {
  for (const w of ws ?? []) if (w.tOut >= t) return w;
  return null;
}

type Ctx = {
  v: Vignette;
  p: Preview;
  idOf: Map<string, string>;
  systemById: Map<string, System>;
  threatById: Map<string, Vignette['threats'][number]>;
  origin: Pt3;
  windows: Derived['windows'];
  daEntry: Derived['daEntry'];
};

/** Port of legacy `ladderFor` with the geometric times taken from `Preview.stages`. */
function ladderFor(c: Ctx, tp: ThreatPreview, evWarn: Warning[]) {
  const pid = tp.id;
  const w = tp.timed;
  const mine = c.v.events
    .filter((e) => e.threatKey === tp.key)
    .slice()
    .sort((a, b) => a.tS - b.tS);
  const evOf = (type: AuthoredEvent['type']) => mine.find((e) => e.type === type) ?? null;
  const sysIdOfEvent = (e: AuthoredEvent) =>
    e.sensorKey ? (c.idOf.get(e.sensorKey) ?? null) : null;
  const rangeFrom = (sysId: string | null, t: number | null): number | null => {
    if (t == null || !w.length) return null;
    const s = sysId ? c.systemById.get(sysId) : undefined;
    return rangeAt(w, t, s ?? c.origin);
  };
  const stageId = (s: { t: number; system: string } | null) =>
    s ? { t: s.t, system: c.idOf.get(s.system) ?? s.system } : null;

  const geo = {
    detect: stageId(tp.stages.find),
    track: stageId(tp.stages.fix),
    id: stageId(tp.stages.track),
    engage: stageId(tp.stages.engage),
  };

  const L = {} as Ladder;
  for (const k of ['detect', 'track', 'id', 'engage'] as const) {
    const e = evOf(EVENT_TYPE[k]);
    const g = geo[k];
    const planning = k === 'track' || k === 'id';
    if (e) {
      const sys = sysIdOfEvent(e) ?? (g ? g.system : null);
      L[k] = rung(e.tS, rangeFrom(sys, e.tS), 'event', e.id, sys, g ? g.t : null, planning && !!g);
    } else if (g) {
      L[k] = rung(g.t, rangeFrom(g.system, g.t), 'geometry', null, g.system, g.t, planning);
    } else L[k] = NULL_RUNG();
  }

  // engage effector, effect, latest engage and margin
  const E = L.engage.t;
  let effId: string | null = null;
  let effWin: Window | null = null;
  let tte = 0;
  if (E != null) {
    const evE = L.engage.event ? evOf('engage') : null;
    const evSys = evE ? sysIdOfEvent(evE) : null;
    effId = evSys && c.systemById.has(evSys) ? evSys : geo.engage ? geo.engage.system : null;
    if (effId) {
      const s = c.systemById.get(effId);
      tte = s && 'timeToEffectS' in s ? s.timeToEffectS : 0;
      effWin = firstWindowFrom(c.windows[effId]?.[pid], E);
    }
  }
  const tDA = c.daEntry[pid] ?? null;
  let latest: number | null = null;
  let margin: number | null = null;
  if (E != null && effWin) {
    const tLim = tDA != null ? Math.min(tDA, effWin.tOut) : effWin.tOut;
    latest = tLim - tte;
    margin = latest - E;
  }
  L.effect = NULL_RUNG();
  if (E != null) {
    const term =
      mine.find((e) => (e.type === 'terminal' || e.type === 'checkpoint') && e.tS >= E) ?? null;
    if (term) {
      const sysT = sysIdOfEvent(term) ?? effId;
      L.effect = rung(
        term.tS,
        rangeFrom(sysT, term.tS),
        'event',
        term.id,
        sysT,
        effWin ? effWin.tIn : null,
        false,
      );
    } else if (effWin) {
      const tg = Math.max(E + tte, effWin.tIn);
      L.effect = rung(tg, rangeFrom(effId, tg), 'geometry', null, effId, tg, true);
    }
  }
  if (L.engage.system == null && effId) L.engage.system = effId;

  // warnings on authored events (legacy text kept verbatim)
  for (const k of RUNGS) {
    const R = L[k];
    if (R.source !== 'event') continue;
    let text: string | null = null;
    let tGeo = R.tGeo;
    let sys = R.system;
    if (k === 'detect' || k === 'track' || k === 'id') {
      if (tGeo != null && R.t != null && tGeo - R.t > TOL) {
        text = `${R.event} is ${Math.round(tGeo - R.t)} s early. ${sys || 'No system'} can ${VERB[k]} ${pid} at ${legacyUnits.t(tGeo)}.`;
      }
    } else if (k === 'engage') {
      if (margin != null && margin < 0) {
        tGeo = latest;
        sys = effId;
        text = `${R.event} is ${mmss(-margin)} late. The latest engage is ${legacyUnits.t(latest)}.`;
      }
    } else if (k === 'effect') {
      if (effWin && R.t != null && effWin.tIn - R.t > TOL) {
        tGeo = effWin.tIn;
        sys = effId;
        text = `${R.event} is before ${effId} reach at ${legacyUnits.t(effWin.tIn)}.`;
      }
    }
    if (!text) continue;
    R.warn = true;
    R.warnText = text;
    evWarn.push({
      kind: 'event',
      id: R.event!,
      text,
      eventId: R.event,
      rung: k,
      tA: R.t,
      tGeo,
      delta: tGeo != null && R.t != null ? tGeo - R.t : null,
      system: sys,
      rangeAtA: rangeFrom(sys, R.t),
    });
  }

  const evD = evOf('detect');
  const evEn = evOf('engage');
  const fs = tp.first;
  const fe = tp.firstEffector;
  const window: WindowSummary = {
    planned: evD && evEn ? evEn.tS - evD.tS : null,
    geometric: fs && fe ? fe.t - fs.t : null,
    detectT: L.detect.t,
    engageT: E,
    rangeAtEngage: E != null && w.length ? rangeAt(w, E, c.origin) : null,
    tDA,
    latest,
    margin,
  };

  // stages: the rungs under their F2T2EA names, plus Target (Track plus the chain time)
  const stage = (R: Rung): DerivedStage =>
    R.t == null ? null : { t: R.t, system: R.system, tGeo: R.tGeo };
  const chain = c.v.chainTime.decisionS + c.v.chainTime.assignS;
  const trackStage = stage(L.id);
  const target: DerivedStage = trackStage
    ? {
        t: trackStage.t + chain,
        system: trackStage.system,
        tGeo: tp.stages.target ? tp.stages.target.t : null,
      }
    : null;
  const stages: DerivedStages = {
    find: stage(L.detect),
    fix: stage(L.track),
    track: trackStage,
    target,
    engage: stage(L.engage),
    assess: stage(L.effect),
  };
  return { ladder: L, stages, window };
}

// ---------------------------------------------------------------- build

function compute(v: Vignette, p: Preview): Derived {
  const { idOf } = byId(v);
  const systems: System[] = [...v.sensors, ...v.effectors, ...v.nodes];
  const systemById = new Map(systems.map((s) => [s.id, s]));
  const systemByKey = new Map(systems.map((s) => [s.key, s]));
  const threatById = new Map(v.threats.map((t) => [t.id, t]));
  const sensorIds = new Set(v.sensors.map((s) => s.id));
  const effectorIds = new Set(v.effectors.map((e) => e.id));
  const asset = v.areas.find((a) => a.kind === 'asset') ?? null;
  const previews = v.threats.map((t) => p.threats[t.key]).filter((tp): tp is ThreatPreview => !!tp);

  const d: Derived = {
    speeds: {},
    timed: {},
    groupOf: {},
    emitsRf: {},
    tmax: p.tmaxS,
    origin: p.origin,
    windows: {},
    windowsRing: {},
    first: {},
    last: {},
    firstSensor: {},
    firstEffector: {},
    vols: {},
    daEntry: {},
    dLink: p.dLink,
    splits: p.splits,
    stages: {},
    window: {},
    warnings: [],
    crossings: {},
    trackLine: {},
    originAt: () => p.origin,
    closing: () => 0,
    tta: () => null,
    envelopesAt: () => [],
    rangeSeries: () => [],
    coveringAt: () => [],
    holdsAt: () => [],
    at: () => null,
    systemAt: () => null,
  };

  for (const tp of previews) {
    d.speeds[tp.id] = tp.speedMs;
    d.timed[tp.id] = tp.timed;
    d.groupOf[tp.id] = threatById.get(tp.id)?.group ?? '';
    d.emitsRf[tp.id] = tp.emitsRf;
  }

  // coverage windows: sensors and effectors from Preview; nodes and the ring rule computed here
  for (const s of systems) {
    d.windows[s.id] = {};
    d.windowsRing[s.id] = {};
  }
  for (const tp of previews) {
    const w = tp.timed;
    const samples = samplePath(w, 1);
    for (const s of systems) {
      const fromPreview = p.windows[s.key]?.[tp.key];
      d.windows[s.id]![tp.id] =
        fromPreview ?? coverageWindows(s, w, { emitsRf: tp.emitsRf }, samples);
      d.windowsRing[s.id]![tp.id] = coverageWindows(s, w, { ringOnly: true }, samples).map((x) => ({
        tIn: x.tIn,
        tOut: x.tOut,
      }));
    }
  }

  // first and last see, crossings, first sensor and effector
  for (const tp of previews) {
    const w = tp.timed;
    const pid = tp.id;
    d.first[pid] = {};
    d.last[pid] = {};
    let fs: SystemTime | null = null;
    let fe: SystemTime | null = null;
    for (const s of systems) {
      const ws = d.windows[s.id]![pid]!;
      if (!ws.length) {
        d.first[pid]![s.id] = null;
        d.last[pid]![s.id] = null;
        continue;
      }
      const f = ws[0]!;
      const l = ws[ws.length - 1]!;
      const fp = posAt(w, f.tIn);
      d.first[pid]![s.id] = { t: f.tIn, r: f.rIn, pos: { x: fp.x, y: fp.y, z: fp.z } };
      d.last[pid]![s.id] = { t: l.tOut, r: l.rOut };
      if (sensorIds.has(s.id) && (!fs || f.tIn < fs.t)) fs = { system: s.id, t: f.tIn };
      if (effectorIds.has(s.id) && (!fe || f.tIn < fe.t)) fe = { system: s.id, t: f.tIn };
    }
    d.crossings[pid] = crossingsFor(systems.map((s) => [s.id, d.windows[s.id]![pid]!]));
    d.firstSensor[pid] = fs;
    d.firstEffector[pid] = fe;
  }

  // areas
  for (const a of v.areas) {
    d.vols[a.id] = {};
    for (const tp of previews) d.vols[a.id]![tp.id] = tp.areas[a.key] ?? [];
  }
  for (const tp of previews) d.daEntry[tp.id] = tp.assetEntryS;

  // ladder, stages, window, warnings
  const ctx: Ctx = {
    v,
    p,
    idOf,
    systemById,
    threatById,
    origin: p.origin,
    windows: d.windows,
    daEntry: d.daEntry,
  };
  const evWarn: Warning[] = [];
  const ladders: Record<string, Ladder> = {};
  for (const tp of previews) {
    const r = ladderFor(ctx, tp, evWarn);
    ladders[tp.id] = r.ladder;
    d.stages[tp.id] = r.stages;
    d.window[tp.id] = r.window;
  }
  const noWarn = { eventId: null, rung: null, tA: null, tGeo: null, delta: null, rangeAtA: null };
  for (const s of [...v.sensors, ...v.effectors]) {
    if (!(s.rangeM > 0))
      d.warnings.push({
        kind: 'system',
        id: s.id,
        text: `${s.id} has no reach. Drag its ring out.`,
        ...noWarn,
        system: s.id,
      });
  }
  for (const t of v.threats) {
    if (t.path.length < 2)
      d.warnings.push({
        kind: 'path',
        id: t.id,
        text: `${t.id} needs two waypoints.`,
        ...noWarn,
        system: null,
      });
  }
  for (const e of v.events) {
    const pid = idOf.get(e.threatKey);
    const w = pid != null ? d.timed[pid] : undefined;
    if (pid != null && w && w.length > 1 && e.tS > endOf(w) + 0.05) {
      // event times are stored at 0.1 s
      evWarn.push({
        kind: 'event',
        id: e.id,
        text: `${e.id} is after ${pid} lands. Drag it back.`,
        eventId: e.id,
        rung: null,
        tA: e.tS,
        tGeo: endOf(w),
        delta: endOf(w) - e.tS,
        system: null,
        rangeAtA: rangeAt(w, e.tS, p.origin),
      });
    }
  }
  evWarn.sort((a, b) => (a.tA ?? 0) - (b.tA ?? 0));
  d.warnings = d.warnings.concat(evWarn);

  for (const tp of previews) {
    const L = ladders[tp.id]!;
    d.trackLine[tp.id] = trackLineFor({
      timed: tp.timed,
      findT: L.detect.t,
      fixT: L.track.t,
      trackT: L.id.t,
      sensorWindows: v.sensors.map((s) => d.windows[s.id]![tp.id]!),
    });
  }

  // attached functions
  const systemAt = (ref: string): Pt3 | null => {
    const s = systemById.get(ref) ?? systemByKey.get(ref);
    return s ? { x: s.x, y: s.y, z: s.z } : null;
  };
  const rc: ReadoutContext = {
    timed: d.timed,
    origin: p.origin,
    assetPts: asset && asset.pts.length ? asset.pts : null,
    systemAt,
    windows: d.windows,
    systemIds: systems.map((s) => s.id),
    threatIds: previews.map((tp) => tp.id),
    daEntry: d.daEntry,
    window: d.window,
  };
  d.systemAt = systemAt;
  d.originAt = (ref, threatId, t) => originAt(rc, ref, threatId, t);
  d.closing = (threatId, t, ref) => closing(rc, threatId, t, ref);
  d.tta = (threatId, t) => tta(rc, threatId, t);
  d.envelopesAt = (t) => envelopesAt(d.timed, d.groupOf, t ?? 0, d.dLink.value);
  d.rangeSeries = rangeSeriesCache((threatId, ref) => {
    const w = d.timed[threatId];
    if (!w || !w.length) return [];
    const edge = ref === 'asset-edge' && rc.assetPts;
    const series = rangeSeriesOf(w, edge ? p.origin : originAt(rc, ref, null, null), 1);
    if (edge)
      for (const q of series) {
        const o = originAt(rc, 'asset-edge', threatId, q.t);
        const pt = posAt(w, q.t);
        q.r = Math.hypot(pt.x - o.x, pt.y - o.y);
      }
    return series;
  });
  d.coveringAt = (threatId, t) => coveringAt(rc, threatId, t);
  d.holdsAt = (systemId, t) => holdsAt(rc, systemId, t);
  d.at = (threatId, t, ref) => readoutAt(rc, threatId, t, ref);
  return d;
}

const memo = new WeakMap<Vignette, { p: Preview; d: Derived }>();

/** The derived object of `(v, p)`; the same pair of references returns the same object. */
export function derived(v: Vignette, p: Preview): Derived {
  const hit = memo.get(v);
  if (hit && hit.p === p) return hit.d;
  const d = compute(v, p);
  memo.set(v, { p, d });
  return d;
}
