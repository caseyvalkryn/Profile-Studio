// Expected-value preview of a vignette (spec section 6 item 1). Ported from legacy/js/21-derive.js
// over the domain types. Pure: no catalog reads at module load, no DOM, no store.
// Maps are keyed by the record `key`, never by display id.

import { archetypeById, ID_DWELL, SENSOR_DEFAULTS } from '../domain/catalog';
import type { Area, Effector, Sensor, Threat, Vignette } from '../domain/types';
import {
  areaWindows,
  centroid,
  coverageWindows,
  endOf,
  medianNN,
  posAt,
  rangeAt,
  samplePath,
  splitTimes,
  timed,
  tmax,
} from './geo';
import type { AreaWindow, Pt3, Split, TimedPoint, Window } from './geo';

/** One F2T2EA stage time. `system` is the sensor or effector key that gives the time. */
export type StageTime = { t: number; system: string } | null;

/** Find, Fix, Track, Target, Engage, Assess (docs/reference/jiatf-401.md section c). */
export type Stages = {
  find: StageTime; // first sensor window
  fix: StageTime; // first window that lasts the sensor's confirm time, plus that time
  track: StageTime; // identify: first EO/IR window that lasts ID_DWELL, plus the dwell
  target: StageTime; // track plus chainTime.decisionS + assignS
  engage: StageTime; // first effector window at or after target
  assess: StageTime; // engage plus the effector's time to effect
};

export type FirstDetection = { t: number; rangeM: number; altM: number; sensor: string };

export type ThreatPreview = {
  key: string;
  id: string;
  speedMs: number;
  emitsRf: boolean;
  timed: TimedPoint[];
  endS: number;
  first: FirstDetection | null;
  firstEffector: { t: number; effector: string } | null;
  areas: Record<string, AreaWindow[]>; // by area key
  assetEntryS: number | null; // first entry into the defended asset
  stages: Stages;
  window: {
    geometricS: number | null; // first effector reach minus first sensor reach
    rangeAtEngageM: number | null; // horizontal range from the origin at engage
    latestEngageS: number | null; // latest engage that still gets an effect in time
    marginS: number | null; // latestEngageS minus engage
  };
};

export type Preview = {
  tmaxS: number;
  origin: Pt3; // defended asset centroid, else the site origin
  threats: Record<string, ThreatPreview>; // by threat key
  windows: Record<string, Record<string, Window[]>>; // by sensor or effector key, then threat key
  dLink: { value: number | null; auto: boolean };
  splits: Split[];
};

export type PreviewOptions = {
  /** Threat keys that take part in group clustering. Default: every threat. */
  groupKeys?: readonly string[];
  /** Explicit link distance in metres. Default: 2.5 times the median nearest neighbour at t = 0. */
  dLinkM?: number;
};

function speedOf(t: Threat): number {
  if (t.speedMs != null && t.speedMs > 0) return t.speedMs;
  const arch = archetypeById(t.type);
  return arch && arch.cruiseMs > 0 ? arch.cruiseMs : 15;
}

function emitsRf(t: Threat): boolean {
  return archetypeById(t.type)?.rf !== false;
}

function firstWindowFrom(ws: readonly Window[], t: number): Window | null {
  for (const w of ws) if (w.tOut >= t) return w;
  return null;
}

function toShape(a: Area) {
  return { pts: a.pts, zMinM: a.zMinM, zMaxM: a.zMaxM };
}

export function preview(v: Vignette, opts: PreviewOptions = {}): Preview {
  const sensors = v.sensors;
  const effectors = v.effectors;
  const systems: (Sensor | Effector)[] = [...sensors, ...effectors];
  const asset = v.areas.find((a) => a.kind === 'asset') ?? null;
  const origin: Pt3 = asset && asset.pts.length ? centroid(asset.pts) : { x: 0, y: 0, z: 0 };

  const timedOf = new Map<string, TimedPoint[]>();
  for (const t of v.threats) timedOf.set(t.key, timed(t.path, speedOf(t)));
  const tmaxS = tmax([...timedOf.values()]);

  const windows: Preview['windows'] = {};
  for (const s of systems) windows[s.key] = {};

  const threats: Record<string, ThreatPreview> = {};
  for (const t of v.threats) {
    const w = timedOf.get(t.key)!;
    const samples = samplePath(w, 1);
    const rf = emitsRf(t);
    const copts = { emitsRf: rf };

    let fs: { t: number; sensor: Sensor; win: Window } | null = null;
    let fe: { t: number; effector: Effector } | null = null;
    for (const s of sensors) {
      const ws = coverageWindows(s, w, copts, samples);
      windows[s.key]![t.key] = ws;
      const f = ws[0];
      if (f && (!fs || f.tIn < fs.t)) fs = { t: f.tIn, sensor: s, win: f };
    }
    for (const e of effectors) {
      const ws = coverageWindows({ ...e, kind: e.kind }, w, copts, samples);
      windows[e.key]![t.key] = ws;
      const f = ws[0];
      if (f && (!fe || f.tIn < fe.t)) fe = { t: f.tIn, effector: e };
    }

    const areas: Record<string, AreaWindow[]> = {};
    for (const a of v.areas) areas[a.key] = areaWindows(toShape(a), w, samples);
    const assetWins = asset ? areas[asset.key]! : [];
    const assetEntryS = assetWins.length ? assetWins[0]!.tIn : null;

    // stages
    const find: StageTime = fs ? { t: fs.t, system: fs.sensor.key } : null;
    let fix: StageTime = null;
    let track: StageTime = null;
    for (const s of sensors) {
      const ws = windows[s.key]![t.key]!;
      const c = SENSOR_DEFAULTS[s.kind].confirmS;
      const win = ws.find((x) => x.tOut - x.tIn >= c);
      if (win && (!fix || win.tIn + c < fix.t)) fix = { t: win.tIn + c, system: s.key };
      if (s.kind === 'eoir') {
        const idw = ws.find((x) => x.tOut - x.tIn >= ID_DWELL);
        if (idw && (!track || idw.tIn + ID_DWELL < track.t))
          track = { t: idw.tIn + ID_DWELL, system: s.key };
      }
    }
    const target: StageTime = track
      ? { t: track.t + v.chainTime.decisionS + v.chainTime.assignS, system: track.system }
      : null;
    // Engage: the first effector window at or after Target. Without a Target time the gate is
    // the run start, which gives the legacy first-effector-reach time.
    const gate = target ? target.t : 0;
    let engage: StageTime = null;
    let effWin: Window | null = null;
    let eff: Effector | null = null;
    for (const e of effectors) {
      const win = firstWindowFrom(windows[e.key]![t.key]!, gate);
      if (!win) continue;
      const te = Math.max(win.tIn, gate);
      if (!engage || te < engage.t) {
        engage = { t: te, system: e.key };
        effWin = win;
        eff = e;
      }
    }
    let assess: StageTime = null;
    let latestEngageS: number | null = null;
    let marginS: number | null = null;
    if (engage && effWin && eff) {
      const tte = eff.timeToEffectS;
      assess = { t: Math.max(engage.t + tte, effWin.tIn), system: eff.key };
      const tLim = assetEntryS != null ? Math.min(assetEntryS, effWin.tOut) : effWin.tOut;
      latestEngageS = tLim - tte;
      marginS = latestEngageS - engage.t;
    }

    let first: FirstDetection | null = null;
    if (fs) {
      const p = posAt(w, fs.t);
      first = { t: fs.t, rangeM: fs.win.rIn, altM: p.z, sensor: fs.sensor.key };
    }

    threats[t.key] = {
      key: t.key,
      id: t.id,
      speedMs: speedOf(t),
      emitsRf: rf,
      timed: w,
      endS: endOf(w),
      first,
      firstEffector: fe ? { t: fe.t, effector: fe.effector.key } : null,
      areas,
      assetEntryS,
      stages: { find, fix, track, target, engage, assess },
      window: {
        geometricS: fs && fe ? fe.t - fs.t : null,
        rangeAtEngageM: engage && w.length ? rangeAt(w, engage.t, origin) : null,
        latestEngageS,
        marginS,
      },
    };
  }

  // link distance and group splits
  const groupKeys = opts.groupKeys ?? v.threats.map((t) => t.key);
  const grouped = groupKeys.map((k) => timedOf.get(k)).filter((w): w is TimedPoint[] => !!w);
  let dLink: Preview['dLink'] = { value: null, auto: true };
  if (opts.dLinkM != null && opts.dLinkM > 0) dLink = { value: opts.dLinkM, auto: false };
  else if (grouped.length >= 2) dLink = { value: 2.5 * medianNN(grouped, 0), auto: true };
  const splits = dLink.value != null ? splitTimes(grouped, tmaxS, dLink.value) : [];

  return { tmaxS, origin, threats, windows, dLink, splits };
}
