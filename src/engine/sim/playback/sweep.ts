import type { Entity, Scenario, SensorSpec, SensorType, Vec2 } from '../model/types';
import {
  defaultSensorRole,
  effectiveDoctrine,
  entityActive,
  physicsSwitches,
  runSettings,
} from '../model/types';
import { modelFor } from '../model/scenario';
import type { DrawPolicy } from './policy';
import { deterministicPolicy } from './policy';
import {
  effectiveDetectRangeM,
  FT_TO_M,
  radarPdModeled,
  rfLinkModelApplies,
  rfMeasurementAccuracy,
  rfSnrOverReference,
} from '../analysis/sensorEnv';
import { dist } from '../geometry/geo';
import { mOfN } from '../analysis/radarPd';
import {
  scanPeriodS,
  trackDropMissesFor,
  trackInitMFor,
  trackInitNFor,
  trackInitSFor,
} from '../analysis/doctrineFactors';
import { DT } from './clock';
import { threatAltitudeFt } from './tracks';
import type { DetectionHit, ScanSteering, SensorObservationSink, SensorSweep } from './detection';
import { pdTrackCumulativeOf, prepareSweep, resolvedThresholds } from './detection';
import type { TrackEstimateSink } from './trackTypes';
import type { TrackManager } from './tracker';
import { createTrackManager } from './tracker';

/**
 * The temporal sensor sweep against one threat: scan scheduling, holds
 * between scans, the cue order, coasting and the M-of-N initiation rule.
 * `prepareSweepRun` resolves the per-sensor terms once, `stepSweep` runs one
 * step at a position set, `finishSweep` closes the hold files. The step is
 * the manifest step (`McSettings.sweepStepS`, default DT; the assessment's
 * SweepClock advances t). The assessment (sim.ts) consumes step results and
 * owns no temporal rule.
 */

/** One sensor's complete hold history against one threat. */
export interface SensorObservation {
  sensorId: string;
  sensorType: SensorType;
  firstDetectS: number;
  lastDetectS: number;
  firstClassifyS: number | null;
  heldSamples: number;
  resolvedEver: boolean;
  /** Closest slant range from the phase center over every held sample, meters. */
  minSlantM: number;
  /** Inclusive 0.5 s hold intervals, split whenever the sensor loses the track. Coast included. */
  intervals: Array<[number, number]>;
  /**
   * First time this sensor initiated a track: the M-of-N scan rule for a
   * scan radar, else continuous hold for the TRACK_INIT_S role time. Null
   * for RF and acoustic sensors, which initiate no fire-control track.
   * Written once, never rewritten after a drop.
   */
  trackInitAtS: number | null;
  /**
   * Scan model only: inclusive DT intervals the sensor held by extrapolation
   * after a missed scan, before the next detection or the drop. Each one is
   * also inside intervals; the ladder and firstConfirmS never read a coast.
   */
  coastIntervals: Array<[number, number]>;
  /**
   * Pd-modeled radar only: single-scan Pd at each DT step from
   * pdSeriesStartS (the first scan this radar took against the threat,
   * detected or not), index 0 = pdSeriesStartS, through the path end.
   * Missed and pre-admission steps included (Pd 0 with nothing admitted),
   * so a chart shows the approach and the fade.
   */
  pdSeries?: number[];
  /** Sim time of pdSeries[0]: the first scan taken, at or before firstDetectS. */
  pdSeriesStartS?: number;
}

/** Tolerance for a nominal scan time landing on the DT grid, seconds. */
const SCAN_EPS = 1e-6;

/** Extend the trailing inclusive interval (one `stepS` per sample) to t, or open a new one after a break. */
export function extendIntervals(intervals: Array<[number, number]>, t: number, stepS = DT): void {
  const last = intervals[intervals.length - 1];
  if (last && Math.abs(last[1] - (t - stepS)) < stepS / 2) last[1] = t;
  else intervals.push([t, t]);
}

/**
 * Scan-model state of one scan radar (scanPeriodS non-null) against one
 * threat. Scans fall at originS + k * periodS (originS = sweep start plus the
 * policy's phase times the period), each snapped forward to the first sweep
 * step at or after it; a period below DT counts one scan per step. A scan
 * before the target is first admitted stays out of the M-of-N window.
 * Between scans the hold carries the last scan result: a detected scan holds
 * with a measurement; a missed scan after initiation coasts until the next
 * detection or the drop at the dropMisses-th consecutive miss; a missed scan
 * before initiation ends the hold.
 */
interface ScanState {
  sensor: Entity;
  spec: SensorSpec;
  /** True when the radar draws the Pd model; false for a threshold radar with a stated period. */
  pdModeled: boolean;
  fcRole: boolean;
  periodS: number;
  m: number;
  n: number;
  dropMisses: number;
  originS: number;
  /** Scans taken so far; the next nominal scan is originS + scans * periodS. */
  scans: number;
  /** True from the first scan with the target admitted: the M-of-N window is open. */
  windowOpen: boolean;
  /** Last n scan results, oldest first. */
  window: Array<{ detected: boolean; pd: number }>;
  consecutiveMisses: number;
  /** Classified flag of the last detected scan, carried between scans. */
  classifiedCarry: boolean;
  hold: 'none' | 'detected' | 'coast' | 'dropped';
  /**
   * Pd-modeled only: single-scan Pd per step from the first scan taken;
   * becomes the observation's pdSeries at first detection.
   */
  pdSeries: number[] | null;
  pdSeriesStartS: number | null;
  /** This radar's observation once it first detects; the same object sensorObservations holds. */
  observation: SensorObservation | undefined;
  /** This radar's hit at the current step, cleared per step. */
  hit: DetectionHit | undefined;
}

/** True when this scan radar's next nominal scan is due at or before step t. */
function scanDue(scan: ScanState, t: number): boolean {
  return scan.originS + scan.scans * scan.periodS <= t + SCAN_EPS;
}

/**
 * Record one scan in the window and test the M-of-N initiation rule: at
 * least m of the last n scans detected and mOfN(mean single-scan Pd over the
 * scans recorded, m, n) reaches pdTrackCumulative. trackInitAtS is written
 * once, on the observation.
 */
function recordScan(
  scan: ScanState,
  observation: SensorObservation | undefined,
  detected: boolean,
  pd: number,
  t: number,
  pdTrack: number,
): void {
  scan.window.push({ detected, pd });
  if (scan.window.length > scan.n) scan.window.shift();
  if (!observation || observation.trackInitAtS != null) return;
  // One pass, summed in window order: the same arithmetic as a filter and a reduce.
  let detections = 0;
  let sum = 0;
  for (const w of scan.window) {
    if (w.detected) detections += 1;
    sum += w.pd;
  }
  if (detections < scan.m) return;
  const mean = sum / scan.window.length;
  if (mOfN(mean, scan.m, scan.n) >= pdTrack) observation.trackInitAtS = t;
}

/** A new hold file opened at the first detected sample. */
function openObservation(hit: DetectionHit, t: number): SensorObservation {
  return {
    sensorId: hit.sensorId,
    sensorType: hit.sensorType,
    firstDetectS: t,
    lastDetectS: t,
    firstClassifyS: null,
    heldSamples: 0,
    resolvedEver: false,
    minSlantM: hit.slantM,
    intervals: [],
    trackInitAtS: null,
    coastIntervals: [],
  };
}

/** The one write of a detected sample into a hold file, shared by both sensor kinds. */
function recordDetection(observation: SensorObservation, hit: DetectionHit, t: number): void {
  observation.lastDetectS = t;
  observation.resolvedEver = observation.resolvedEver || hit.resolved;
  observation.minSlantM = Math.min(observation.minSlantM, hit.slantM);
  if (hit.classified && observation.firstClassifyS == null) observation.firstClassifyS = t;
}

/** What one DT step of the sweep tells the assessment. Valid until the next step. */
export interface SweepStepResult {
  /**
   * Sensor id of the first hit this step in pass order (search sensors, then
   * cued EO/IR; a scan radar counts at its scan step only), or null.
   */
  firstHitSensorId: string | null;
  /** Technologies holding a measured track this step: 0 = no hold, 2 or more = confirmed. */
  measuredTechs: number;
  /**
   * A fire-control or classification role sensor holds the track classified
   * this step; a scan radar carries its last scan's flag between scans.
   */
  fcClassified: boolean;
  /** Some scan radar coasts this step: held for continuity only, invisible to the ladder. */
  coastHeld: boolean;
  /** True when any sensor holds this step, measured or coasting. */
  held: boolean;
}

/** What the whole sweep tells the assessment once the path ends. */
export interface SweepOutcome {
  firstDetectS: number | null;
  firstDetectSensorId: string | null;
  /** Technologies that detected the threat at any time, in first-detection order. */
  techs: SensorType[];
  /** Sensors that detected the threat at any time, in first-detection order. */
  detectingSensorIds: string[];
  /** One hold file per detecting sensor, in first-detection order; trackInitAtS filled. */
  sensorObservations: SensorObservation[];
  /** True when some detecting sensor resolved the formation at some sample. */
  anyResolved: boolean;
}

/** The sweep of one threat in progress; read `detectingSensorIds` between steps, nothing else. */
export interface SweepRun {
  /** Sensors that have detected the threat so far, in first-detection order. Grows as the sweep runs. */
  readonly detectingSensorIds: ReadonlySet<string>;
}

interface SweepRunState extends SweepRun {
  scenario: Scenario;
  /** The manifest step, seconds: the spacing of consecutive samples in a hold interval. */
  stepS: number;
  uasId: string;
  sweep: SensorSweep;
  pdTrack: number;
  scanStates: Map<string, ScanState>;
  /** Scan radars whose next scan is not due this step; every other sensor scans. */
  idleScans: Set<string>;
  steering: ScanSteering;
  detectingSensorIds: Set<string>;
  techsSeen: Set<SensorType>;
  sensorObservations: Map<string, SensorObservation>;
  stepTechs: Set<SensorType>;
  anyResolved: boolean;
  firstDetectS: number | null;
  firstDetectSensorId: string | null;
  result: SweepStepResult;
  /** The per-sensor track estimates (tracker.ts), stepped after the hold decisions. */
  tracks: TrackManager;
}

/**
 * Prepare the sweep of one threat: the per-sensor terms (prepareSweep) and
 * one scan state per scan radar. `delayS` is the sweep start; a scan radar's
 * first nominal scan is delayS plus the policy's phase times its period, the
 * run's one draw per (radar, threat), taken before any scan. A missing
 * policy is the deterministic run. Reads the active sensors, the library,
 * the environment, the requirements and the doctrine: every one already in
 * the assessment's input list. `trackSink` receives one track estimate per
 * sensor track per step; absent, no estimate history is allocated.
 */
export function prepareSweepRun(
  scenario: Scenario,
  uas: Entity,
  delayS: number,
  policy?: DrawPolicy,
  capture?: SensorObservationSink,
  trackSink?: TrackEstimateSink,
): SweepRun {
  const draw = policy ?? deterministicPolicy(resolvedThresholds(scenario));
  const uasSpec = modelFor(scenario, uas)?.uas;
  const altitudeFt = threatAltitudeFt(scenario, uas);
  const sensors = scenario.entities.filter((e) => e.kind === 'sensor' && entityActive(e));
  const sweep = prepareSweep(scenario, sensors, uas.formation, uasSpec, altitudeFt, draw, capture);
  const scanStates = new Map<string, ScanState>();
  const trackSensors: Array<{ sensor: Entity; spec: SensorSpec }> = [];
  for (const sensor of sensors) {
    const spec = modelFor(scenario, sensor)?.sensor;
    if (!spec) continue;
    trackSensors.push({ sensor, spec });
    const pdModeled = radarPdModeled(spec, uasSpec);
    const periodS = scanPeriodS(spec, pdModeled);
    if (periodS == null) continue;
    const role = defaultSensorRole(spec);
    scanStates.set(sensor.id, {
      sensor,
      spec,
      pdModeled,
      fcRole: role === 'fire-control' || role === 'classification',
      periodS,
      m: trackInitMFor(spec),
      n: trackInitNFor(spec),
      dropMisses: trackDropMissesFor(spec),
      originS: delayS + draw.phase(sensor.id) * periodS,
      scans: 0,
      windowOpen: false,
      window: [],
      consecutiveMisses: 0,
      classifiedCarry: false,
      hold: 'none',
      pdSeries: null,
      pdSeriesStartS: null,
      observation: undefined,
      hit: undefined,
    });
  }
  const idleScans = new Set<string>();
  const run: SweepRunState = {
    scenario,
    stepS: runSettings(scenario).sweepStepS,
    uasId: uas.id,
    sweep,
    pdTrack: pdTrackCumulativeOf(scenario),
    scanStates,
    idleScans,
    steering: {
      scanStep: (sensorId) => !idleScans.has(sensorId),
      holding: (sensorId) => scanStates.get(sensorId)?.hold === 'detected',
    },
    detectingSensorIds: new Set<string>(),
    techsSeen: new Set<SensorType>(),
    sensorObservations: new Map<string, SensorObservation>(),
    stepTechs: new Set<SensorType>(),
    anyResolved: false,
    firstDetectS: null,
    firstDetectSensorId: null,
    result: {
      firstHitSensorId: null,
      measuredTechs: 0,
      fcClassified: false,
      coastHeld: false,
      held: false,
    },
    tracks: createTrackManager(
      scenario,
      uas.id,
      trackSensors,
      altitudeFt * FT_TO_M,
      draw,
      trackSink,
    ),
  };
  return run;
}

/**
 * One DT step at `members` (the formation positions at t). Every sensor
 * without scan state samples each step; a scan radar samples at its scan
 * steps and carries its hold between them. The returned object is reused
 * across steps.
 */
export function stepSweep(handle: SweepRun, members: Vec2[], t: number): SweepStepResult {
  const run = handle as SweepRunState;
  const { scanStates, idleScans, stepTechs, sensorObservations, detectingSensorIds, tracks } = run;
  stepTechs.clear();
  tracks.beginStep(members, t);
  let fcClassifiedNow = false;
  // A coast is held for continuity only: invisible to stepTechs and the ladder.
  let coastHeld = false;
  let stepFirstId: string | null = null;
  idleScans.clear();
  for (const [sensorId, scan] of scanStates) {
    scan.hit = undefined;
    if (!scanDue(scan, t)) idleScans.add(sensorId);
  }
  const hits = run.sweep.hits(members, run.uasId, t, run.steering);
  const targetEntity = run.scenario.entities.find((entity) => entity.id === run.uasId);
  const targetSpec = targetEntity ? modelFor(run.scenario, targetEntity)?.uas : undefined;
  const physics = physicsSwitches(run.scenario);
  const rfFallback = physics.includes('rfBandGate');
  const rfAccuracy = new Map<string, { rangeSigmaM: number; azimuthSigmaRad: number }>();
  if (targetSpec && !rfFallback) {
    const groups = new Map<
      string,
      Array<{ sensor: Entity; spec: SensorSpec; hit: DetectionHit }>
    >();
    for (const item of hits) {
      if (item.hit.sensorType !== 'rf' || !rfLinkModelApplies(item.spec, targetSpec)) continue;
      const sensor = run.scenario.entities.find((entity) => entity.id === item.hit.sensorId);
      if (!sensor) continue;
      const key = sensor.specId ?? sensor.id;
      const group = groups.get(key) ?? [];
      group.push({ sensor, ...item });
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      let baselineM = 0;
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          baselineM = Math.max(baselineM, dist(group[i]!.sensor.pos, group[j]!.sensor.pos));
        }
      }
      for (const { spec, hit } of group) {
        const snr = rfSnrOverReference(spec, targetSpec, run.scenario.environment, hit.slantM);
        if (snr == null) continue;
        const accuracy = rfMeasurementAccuracy(spec, snr, group.length, hit.slantM, baselineM);
        if (accuracy.azimuthAccuracyDeg == null) continue;
        const detectRangeM = effectiveDetectRangeM(
          spec,
          run.scenario.environment,
          targetSpec,
          undefined,
          physics,
        );
        rfAccuracy.set(hit.sensorId, {
          // A single DF node supplies a bearing but no triangulated range.
          // Represent that bearing-only ambiguity as one full detect-range sigma.
          rangeSigmaM: accuracy.rangeAccuracyM ?? detectRangeM,
          azimuthSigmaRad: (accuracy.azimuthAccuracyDeg * Math.PI) / 180,
        });
      }
    }
  }
  for (const { spec, hit } of hits) {
    // A scan radar's hit is a scan result only at its scan step.
    const scan = scanStates.get(hit.sensorId);
    if (scan) {
      if (!idleScans.has(hit.sensorId)) {
        scan.hit = hit;
        if (stepFirstId == null) stepFirstId = hit.sensorId;
      }
      continue;
    }
    if (stepFirstId == null) stepFirstId = hit.sensorId;
    stepTechs.add(hit.sensorType);
    detectingSensorIds.add(hit.sensorId);
    if (hit.resolved) run.anyResolved = true;
    let observation = sensorObservations.get(hit.sensorId);
    if (!observation) {
      observation = openObservation(hit, t);
      sensorObservations.set(hit.sensorId, observation);
    }
    recordDetection(observation, hit, t);
    observation.heldSamples += 1;
    extendIntervals(observation.intervals, t, run.stepS);
    tracks.step(hit.sensorId, t, 'measure', hit, 0, rfAccuracy.get(hit.sensorId));
    const role = defaultSensorRole(spec);
    if (hit.classified && (role === 'fire-control' || role === 'classification')) {
      fcClassifiedNow = true;
    }
  }
  // Scan pass. Without a Pd model the scan Pd is 1 on a hit and 0 on a
  // miss, so M-of-N degenerates to a count. Pd telemetry runs every step
  // from the first scan.
  for (const [sensorId, scan] of scanStates) {
    const scanStep = !idleScans.has(sensorId);
    let observation = scan.observation;
    const hit = scan.hit;
    let probe: number | null = null;
    if (scan.pdModeled && (scan.pdSeries || scanStep)) {
      probe = run.sweep.probe(sensorId, members) ?? 0;
      if (!scan.pdSeries) {
        scan.pdSeries = [];
        scan.pdSeriesStartS = t;
      }
      scan.pdSeries.push(probe);
    }
    if (scanStep) {
      const pd = scan.pdModeled ? (hit ? hit.pd! : probe!) : hit ? 1 : 0;
      if (hit) {
        detectingSensorIds.add(sensorId);
        if (hit.resolved) run.anyResolved = true;
        if (!observation) {
          observation = openObservation(hit, t);
          if (scan.pdSeries) {
            observation.pdSeries = scan.pdSeries;
            observation.pdSeriesStartS = scan.pdSeriesStartS!;
          }
          sensorObservations.set(sensorId, observation);
          scan.observation = observation;
        }
        scan.consecutiveMisses = 0;
        scan.hold = 'detected';
        scan.classifiedCarry = hit.classified;
        recordDetection(observation, hit, t);
        scan.windowOpen = true;
        recordScan(scan, observation, true, pd, t, run.pdTrack);
      } else {
        const admitted = scan.pdModeled && pd > 0;
        if (scan.hold !== 'none') {
          scan.consecutiveMisses += 1;
          // Before initiation a miss ends the hold; the window keeps counting.
          scan.hold =
            observation?.trackInitAtS == null
              ? 'none'
              : scan.consecutiveMisses >= scan.dropMisses
                ? 'dropped'
                : 'coast';
        }
        if (scan.windowOpen || admitted) {
          scan.windowOpen = true;
          recordScan(scan, observation, false, pd, t, run.pdTrack);
        }
      }
      // One scan per step: skip every nominal scan the period lands on this step.
      while (scanDue(scan, t)) scan.scans += 1;
    }
    if (!observation) continue;
    if (scan.hold === 'detected') {
      stepTechs.add(observation.sensorType);
      if (scan.classifiedCarry && scan.fcRole) fcClassifiedNow = true;
      observation.heldSamples += 1;
      extendIntervals(observation.intervals, t, run.stepS);
      // A scan step with a hit measures; the steps between scans carry the estimate.
      tracks.step(sensorId, t, hit ? 'measure' : 'carry', hit, 0, rfAccuracy.get(sensorId));
    } else if (scan.hold === 'coast') {
      coastHeld = true;
      observation.heldSamples += 1;
      extendIntervals(observation.intervals, t, run.stepS);
      extendIntervals(observation.coastIntervals, t, run.stepS);
      tracks.step(sensorId, t, 'coast', undefined, scan.consecutiveMisses);
    }
  }
  // Tracks the sweep did not hold this step drop; the rest emit to the sink.
  tracks.endStep(t);
  if (run.firstDetectS == null && stepFirstId != null) {
    run.firstDetectS = t;
    run.firstDetectSensorId = stepFirstId;
  }
  for (const tech of stepTechs) run.techsSeen.add(tech);
  const result = run.result;
  result.firstHitSensorId = stepFirstId;
  result.measuredTechs = stepTechs.size;
  result.fcClassified = fcClassifiedNow;
  result.coastHeld = coastHeld;
  result.held = stepTechs.size > 0 || coastHeld;
  return result;
}

/**
 * Close the hold files. A scan radar wrote trackInitAtS in the sweep; every
 * other radar or EO/IR sensor initiates after an unbroken interval of its
 * initiation time (trackInitSFor). RF and acoustic files keep null.
 */
export function finishSweep(handle: SweepRun): SweepOutcome {
  const run = handle as SweepRunState;
  const doctrine = effectiveDoctrine(run.scenario);
  for (const obs of run.sensorObservations.values()) {
    if (obs.sensorType !== 'radar' && obs.sensorType !== 'eo-ir') continue;
    if (run.scanStates.has(obs.sensorId)) continue;
    const sensorEnt = run.scenario.entities.find((s) => s.id === obs.sensorId);
    const spec = sensorEnt ? modelFor(run.scenario, sensorEnt)?.sensor : undefined;
    const initS = spec ? trackInitSFor(spec, doctrine) : doctrine.trackFirmS;
    for (const [s0, s1] of obs.intervals) {
      if (s1 - s0 + run.stepS / 2 < initS) continue;
      obs.trackInitAtS = s0 + initS;
      break;
    }
  }
  return {
    firstDetectS: run.firstDetectS,
    firstDetectSensorId: run.firstDetectSensorId,
    techs: [...run.techsSeen],
    detectingSensorIds: [...run.detectingSensorIds],
    sensorObservations: [...run.sensorObservations.values()],
    anyResolved: run.anyResolved,
  };
}
