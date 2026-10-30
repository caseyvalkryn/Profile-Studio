import type { AttritionReport } from './attritionReport';
import { deadRecords, hardKillTimeOf } from './deadTimes';
import type { SensorScanObservation } from './detection';
import { EPS } from './intercept';
import type { SensorObservation, ThreatAssessment } from './sim';
import type { TrackEstimate } from './trackTypes';

/**
 * Kill clip: a dead threat holds no track. The sweep, the tracker and the
 * fusion stage run one threat at a time and finish before the engagement
 * pass, which reads their fused track (attrition.ts), so the sweep cannot
 * learn the kill while it runs. This pass runs after the engagement pass and
 * clips what the sweep produced at the kill: the per-step fused tracks, each
 * sensor observation's hold and coast intervals, the track estimates and the
 * scan records of the killed threat. The kill time is the one dead rule
 * (`deadTimeOf`, deadTimes.ts): per ship, the effect at which its survival
 * falls below SHIP_DEAD_BELOW, and for the threat the effect that killed its
 * last ship. That rule is the engagement pass's own targeting cutoff (a ship
 * below the cutoff draws no fire), so the clip and the engine agree on when
 * the threat stopped being a target.
 *
 * Only a hard kill clips. A mission-killed airframe (a jammer's kill under
 * `jamBehavior` drift or return-home) still flies, so its holds, estimates
 * and fused track run to the path end; an all-soft defeat does not clip. A
 * mixed defeat (one ship hard-killed, another mission-killed) does not clip
 * either: a mission-killed airframe of that threat still flies and the threat
 * has one picture. The clip applies when every ship of the threat latched
 * hard, at the last hard-kill latch: the hard cut (`hardKillTimeOf`).
 *
 * A sample at or before the kill measured a live target and is kept; a hold
 * or coast interval ends at the last sweep sample at or before the kill (the
 * sweep grid is delayS + k * stepS, the kill is off it), and that sample
 * draws its one step, so a hold can overhang an off-grid kill by less than a
 * step. The first sample after the kill, and everything later, is dropped.
 *
 * The report is never touched: every count the engagement pass produced
 * stands, and the timeline's ghost span (kill to planned arrival) reads the
 * report. `trackQuality` stays as swept: the continuity the sensors would
 * have held to closest approach. The per-threat milestones after the cut are
 * nulled: the classification rungs, `stableTrackAtS` and
 * `declaredHostileAtS`; `firstDetectS`, `engageGateS`, `windowS`, `cpaS`,
 * `arrivalS` and `warningS` are planning values and stay. An assessment with no kill or nothing to
 * clip, and every list and observation with nothing to drop, comes back as
 * the same object.
 */

export interface KillClipInput {
  assessments: ThreatAssessment[];
  report: AttritionReport;
  /** Sweep step, seconds: the width of one sample. */
  stepS: number;
  tracks?: TrackEstimate[];
  observations?: SensorScanObservation[];
}

export interface KillClipResult {
  assessments: ThreatAssessment[];
  tracks?: TrackEstimate[];
  observations?: SensorScanObservation[];
}

/**
 * Inclusive intervals cut at the last sweep sample at or before `cut`; one
 * that starts after it is dropped. A start is on the sweep grid, so the end
 * snaps to it by whole steps and never lands off grid for an off-grid kill.
 * An interval the cut does not reach comes back as the same object.
 */
function clipIntervals(
  intervals: Array<[number, number]>,
  cut: number,
  stepS: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const interval of intervals) {
    const [s0, s1] = interval;
    if (s0 > cut + EPS) continue;
    if (s1 <= cut + EPS) out.push(interval);
    else out.push([s0, s0 + Math.floor((cut - s0) / stepS + EPS) * stepS]);
  }
  return out;
}

/** True when a clip left an interval list as it was. */
function unchanged(before: Array<[number, number]>, after: Array<[number, number]>): boolean {
  return before.length === after.length && before.every((iv, i) => iv === after[i]);
}

/** Samples an inclusive interval list covers, one per `stepS`. */
function samplesIn(intervals: Array<[number, number]>, stepS: number): number {
  let n = 0;
  for (const [s0, s1] of intervals) n += Math.round((s1 - s0) / stepS) + 1;
  return n;
}

function clipObservation(obs: SensorObservation, cut: number, stepS: number): SensorObservation {
  const intervals = clipIntervals(obs.intervals, cut, stepS);
  const coastIntervals = clipIntervals(obs.coastIntervals ?? [], cut, stepS);
  const firstClassifyS =
    obs.firstClassifyS != null && obs.firstClassifyS > cut + EPS ? null : obs.firstClassifyS;
  const trackInitAtS =
    obs.trackInitAtS != null && obs.trackInitAtS > cut + EPS ? null : obs.trackInitAtS;
  const pdSteps =
    obs.pdSeries && obs.pdSeriesStartS != null
      ? Math.max(0, Math.floor((cut - obs.pdSeriesStartS) / stepS + EPS) + 1)
      : null;
  if (
    unchanged(obs.intervals, intervals) &&
    unchanged(obs.coastIntervals ?? [], coastIntervals) &&
    firstClassifyS === obs.firstClassifyS &&
    trackInitAtS === obs.trackInitAtS &&
    (pdSteps == null || pdSteps >= obs.pdSeries!.length)
  )
    return obs;
  const removed = samplesIn(obs.intervals, stepS) - samplesIn(intervals, stepS);
  const lastEnd = intervals.length > 0 ? intervals[intervals.length - 1]![1] : obs.firstDetectS;
  const out: SensorObservation = {
    ...obs,
    intervals,
    coastIntervals,
    lastDetectS: Math.min(obs.lastDetectS, lastEnd),
    heldSamples: Math.max(0, obs.heldSamples - removed),
    // A declaration or a firm track after the last kept step never happened.
    firstClassifyS,
    trackInitAtS,
  };
  if (obs.pdSeries && pdSteps != null) out.pdSeries = obs.pdSeries.slice(0, pdSteps);
  return out;
}

function clipAssessment(a: ThreatAssessment, cut: number, stepS: number): ThreatAssessment {
  const out: ThreatAssessment = { ...a };
  let changed = false;
  if (a.fusedTracks) {
    const fusedTracks = a.fusedTracks.filter((f) => f.fusedAtS <= cut + EPS);
    if (fusedTracks.length !== a.fusedTracks.length) {
      out.fusedTracks = fusedTracks;
      changed = true;
    }
  }
  if (a.sensorObservations) {
    const kept: SensorObservation[] = [];
    const dropped = new Set<string>();
    for (const obs of a.sensorObservations) {
      // A sensor that first detected after the last kept step never held the live threat.
      if (obs.firstDetectS > cut + EPS) dropped.add(obs.sensorId);
      else kept.push(clipObservation(obs, cut, stepS));
    }
    if (dropped.size > 0 || kept.some((obs, i) => obs !== a.sensorObservations![i])) {
      out.sensorObservations = kept;
      changed = true;
    }
    if (dropped.size > 0) {
      out.detectingSensorIds = a.detectingSensorIds.filter((id) => !dropped.has(id));
      out.techs = a.techs.filter((tech) => kept.some((obs) => obs.sensorType === tech));
    }
  }
  if (a.firstConfirmS != null && a.firstConfirmS > cut + EPS) {
    out.firstConfirmS = null;
    changed = true;
  }
  // A classification rung, a firm track or a declaration after the kill never
  // happened for the living target. Planning times (first detection, the
  // engagement gate, the window, CPA, arrival, warning) stay.
  const after = (tS: number | null | undefined): boolean => tS != null && tS > cut + EPS;
  const cls = a.classificationAtS;
  if (after(cls.unknownAtS) || after(cls.suspectedAtS) || after(cls.hostileAtS)) {
    out.classificationAtS = {
      unknownAtS: after(cls.unknownAtS) ? null : cls.unknownAtS,
      suspectedAtS: after(cls.suspectedAtS) ? null : cls.suspectedAtS,
      hostileAtS: after(cls.hostileAtS) ? null : cls.hostileAtS,
    };
    changed = true;
  }
  if (after(a.stableTrackAtS)) {
    out.stableTrackAtS = null;
    changed = true;
  }
  if (after(a.declaredHostileAtS)) {
    out.declaredHostileAtS = null;
    changed = true;
  }
  return changed ? out : a;
}

/** The sweep products of every killed threat clipped at its kill; see the module note. */
export function clipAtKill(input: KillClipInput): KillClipResult {
  const { assessments, report, stepS, tracks, observations } = input;
  // The last sample time a live target could be measured at: the hard kill
  // itself. A soft or mixed defeat leaves an airframe flying and never clips.
  const dead = new Map<string, number>();
  for (const [uasId, death] of deadRecords(report)) {
    const cut = hardKillTimeOf(death);
    if (cut != null) dead.set(uasId, cut);
  }
  if (dead.size === 0) return { assessments, tracks, observations };
  const keep = (uasId: string | null, tS: number): boolean => {
    if (uasId == null) return true;
    const cut = dead.get(uasId);
    return cut === undefined || tS <= cut + EPS;
  };
  const same = <T>(list: T[], filtered: T[]): T[] =>
    filtered.length === list.length ? list : filtered;
  return {
    assessments: assessments.map((a) => {
      const cut = dead.get(a.uasId);
      return cut === undefined ? a : clipAssessment(a, cut, stepS);
    }),
    tracks:
      tracks &&
      same(
        tracks,
        tracks.filter((t) => keep(t.uasId, t.state.tS)),
      ),
    observations:
      observations &&
      same(
        observations,
        observations.filter((o) => keep(o.uasId, o.tS)),
      ),
  };
}
