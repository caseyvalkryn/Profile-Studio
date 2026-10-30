/**
 * Monte Carlo run: n replicates of the vignette through rangeboard `runTrial`, one
 * `RunRow` per threat per replicate in DroneScore field names (spec section 5), plus a
 * `RunTrace` beside each row with the rangeboard gate times that DroneScore has no field
 * for (the F2T2EA Target time among them).
 *
 * Preview (preview.ts) applies its own coverage rules; the rows here follow the rangeboard
 * gates and may disagree with it where noted. Two preview semantics are on record (review
 * 2.R): preview Assess is max(engage + tte, effector window start) unclipped, with the margin
 * carried separately, and preview Engage without Target falls back to first effector reach
 * ("geometry only"). Here Engage is the first shot the engine released, which under doctrine
 * always follows Target.
 */
import type { Outcome, RunRow, StageReached, Vignette } from '../domain/types';
import { DEFAULTS, toScenario, threatAltitudeM } from './adapter';
import { runTrial } from './sim/playback/trial';
import { createTrialManifest } from './sim/playback/trialTypes';
import type { TrialResult } from './sim/playback/trialTypes';
import type { SensorObservation, ThreatAssessment } from './sim/playback/sim';
import { deadTimeOf } from './sim/playback/deadTimes';
import { bandFor, matrixFor } from './sim/playback/classification';
import { resolvedThresholds } from './sim/playback/detection';
import { monteCarloPolicy } from './sim/playback/policy';
import type { DrawPolicy } from './sim/playback/policy';
import { posAtTime } from './sim/geometry/geo';
import { slantRangeM } from './sim/geometry/slant';
import { modelFor, pathDurationS, pathSpeed } from './sim/model/scenario';
import { mountHeightOf } from './sim/model/types';
import type { Entity, FlightPath, Scenario, Vec2 } from './sim/model/types';

export type TraceKey = 'detect' | 'track' | 'identify' | 'target' | 'engage' | 'effect' | 'arrival';

/** Vignette-frame position: x east, y north, z metres AGL. */
export type TracePoint = { x: number; y: number; z: number };

/** Per threat per replicate: when each rangeboard gate opened and where the threat was. */
export type RunTrace = {
  run: number;
  threat: string;
  /** Gate times, seconds from replicate start. `target` is rangeboard readyS: F2T2EA Target. */
  times: Record<TraceKey, number | null>;
  /** `engage` is the first shot's release position; the row's engagement_range_m is at defeat. */
  positions: Partial<Record<TraceKey, TracePoint>>;
  /** Rangeboard's own status word for the threat. */
  status: string;
};

export type RunResult = { rows: RunRow[]; trace: RunTrace[] };

export type Progress = (done: number, total: number) => void;

const STAGE_ORDER: readonly StageReached[] = [
  'none',
  'detect',
  'track',
  'classify',
  'identify',
  'engage',
  'defeat',
];

export function stageRank(s: StageReached): number {
  return STAGE_ORDER.indexOf(s);
}

/** True when `s` is at or past `at` in the F2T2EA order. */
export function stageAtLeast(s: StageReached, at: StageReached): boolean {
  return stageRank(s) >= stageRank(at);
}

type Truth = { pos(t: number): Vec2; altM: number; endS: number };

function truthOf(scenario: Scenario, path: FlightPath, altM: number): Truth {
  const speed = pathSpeed(scenario, path);
  return {
    pos: (t) => posAtTime(path.points, speed, path.startDelayS, t).pos,
    altM,
    endS: path.startDelayS + pathDurationS(scenario, path),
  };
}

function groundRange(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Union of inclusive sample intervals clipped to [lo, hi], as total covered seconds. Each
 * interval is a run of `stepS` samples from a to b inclusive, so it covers b - a + stepS.
 */
export function coveredS(
  intervals: Array<[number, number]>,
  lo: number,
  hi: number,
  stepS: number,
): number {
  const clipped = intervals
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
    .filter(([a, b]) => b >= a)
    .sort((p, q) => p[0] - q[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of clipped) {
    if (cur && iv[0] <= cur[1] + stepS) cur[1] = Math.max(cur[1], iv[1]);
    else {
      if (cur) total += cur[1] - cur[0] + stepS;
      cur = [iv[0], iv[1]];
    }
  }
  if (cur) total += cur[1] - cur[0] + stepS;
  return total;
}

function toVignetteFrame(p: Vec2, z: number): TracePoint {
  return { x: p.x, y: -p.y, z };
}

/** Per-run context shared by every threat: the scenario, its entities and the draw policy. */
type RunContext = {
  v: Vignette;
  scenario: Scenario;
  entities: Map<string, Entity>;
  stepS: number;
  /** Rangeboard's own Monte Carlo draws for this replicate, to replay the ID declaration. */
  draw: Pick<DrawPolicy, 'classify'>;
};

/**
 * Sensor `minRangeM` (LOSSES.sensorMinRange): drop the samples of each hold interval that
 * lie inside the sensor's minimum range by truth geometry, splitting the interval where
 * needed. `firstDetectS` and `trackInitAtS` move to the first surviving sample when theirs
 * was dropped.
 */
function filterMinRange(
  obs: SensorObservation,
  ctx: RunContext,
  truth: Truth,
): SensorObservation | null {
  const sensor = ctx.v.sensors.find((s) => s.id === obs.sensorId);
  const ent = ctx.entities.get(obs.sensorId);
  if (!sensor || !ent || !(sensor.minRangeM > 0)) return obs;
  const inside = (t: number) => groundRange(truth.pos(t), ent.pos) < sensor.minRangeM;
  const intervals: Array<[number, number]> = [];
  for (const [a, b] of obs.intervals) {
    let start: number | null = null;
    for (let t = a; t <= b + ctx.stepS / 2; t += ctx.stepS) {
      if (inside(t)) {
        if (start != null) intervals.push([start, t - ctx.stepS]);
        start = null;
      } else if (start == null) start = t;
    }
    if (start != null) intervals.push([start, b]);
  }
  if (intervals.length === 0) return null;
  const within = (t: number | null) =>
    t != null && intervals.some(([a, b]) => t >= a - ctx.stepS / 2 && t <= b + ctx.stepS / 2);
  const first = intervals[0]![0];
  return {
    ...obs,
    intervals,
    firstDetectS: within(obs.firstDetectS) ? obs.firstDetectS : first,
    trackInitAtS: obs.trackInitAtS == null || within(obs.trackInitAtS) ? obs.trackInitAtS : first,
  };
}

/**
 * Per-sensor identification by the ID model (spec section 6 item 2): the sensor's
 * classification band declares after `timeToDeclareS` (the vignette `idDwellS`) when the
 * classify draw falls under `pCorrect` (`pCorrectId`). The attempt is rangeboard's: the first
 * step the sensor holds a non-coasting track estimate inside a band (sim.ts, matrix
 * classification), replayed here with the same draw key, so the row and the engine agree on
 * which sensors declared. Returns the earliest declaration time, or null.
 */
function identifyBySensor(
  a: ThreatAssessment,
  result: TrialResult,
  ctx: RunContext,
  truth: Truth,
): number | null {
  let identifyS: number | null = null;
  for (const sensor of ctx.scenario.entities) {
    if (sensor.kind !== 'sensor') continue;
    const spec = modelFor(ctx.scenario, sensor)?.sensor;
    const matrix = spec ? matrixFor(spec) : null;
    if (!spec || !matrix) continue;
    const dAltM = truth.altM - mountHeightOf(spec);
    for (const tr of result.tracks ?? []) {
      if (tr.uasId !== a.uasId || tr.coasting || !tr.sensorIds.includes(sensor.id)) continue;
      const t = tr.state.tS;
      const band = bandFor(matrix, slantRangeM(groundRange(sensor.pos, truth.pos(t)), dAltM));
      if (!band) continue;
      const u = ctx.draw.classify(sensor.id, a.uasId, t);
      if (u < band.pCorrect) {
        const declareAtS = t + band.timeToDeclareS;
        if (identifyS == null || declareAtS < identifyS) identifyS = declareAtS;
      }
      break; // one attempt per sensor
    }
  }
  return identifyS;
}

/** One threat's assessment and ledger into a DroneScore row and its trace. */
function mapThreat(
  run: number,
  a: ThreatAssessment,
  result: TrialResult,
  ctx: RunContext,
  truth: Truth,
): { row: RunRow; trace: RunTrace } {
  const { report } = result;
  const { entities, scenario, stepS } = ctx;
  const events = report.events.filter((e) => e.uasId === a.uasId);
  const firstShot = events.length > 0 ? events[0]! : null;
  const killEvent = events.find((e) => e.killDelta > 0) ?? null;
  // Rangeboard defeat rule: every ship latched dead, and the killing effect landed before
  // arrival at the defended asset (deadTimes.ts). Preview has no late-kill notion, so the two
  // can disagree for a kill inside the asset boundary: here it is a Miss.
  const dead = deadTimeOf(report, a.uasId);
  const defeated = dead != null && !dead.late;
  // The window a dead airframe can be tracked over ends at its death, late or not.
  const horizonS = dead ? Math.min(dead.tS, truth.endS) : truth.endS;

  const observations = (a.sensorObservations ?? [])
    .map((o) => filterMinRange(o, ctx, truth))
    .filter((o): o is SensorObservation => o != null);
  const detectS = observations.reduce<number | null>(
    (m, o) => (m == null || o.firstDetectS < m ? o.firstDetectS : m),
    null,
  );
  const detector = observations.find((o) => o.firstDetectS === detectS);

  // Track: the sensor's own initiation time (M-of-N for a scan radar, the role hold for EO/IR).
  // RF and acoustic initiate no rangeboard fire-control track (trackInitAtS null); the spec
  // models M-of-N for every sensor kind, so they fall back to the first hold that lasts
  // trackM x scanS. Only the fire-control sensors open the release gate (1.2.1 note).
  const trackInitOf = (o: SensorObservation): number | null => {
    if (o.trackInitAtS != null) return o.trackInitAtS;
    const m = ctx.v.sensors.find((s) => s.id === o.sensorId)?.model;
    if (!m) return null;
    const holdS = m.trackM * m.scanS;
    for (const [s0, s1] of o.intervals) if (s1 - s0 + stepS >= holdS) return s0 + holdS - stepS;
    return null;
  };
  const trackS = observations.reduce<number | null>((m, o) => {
    const t = trackInitOf(o);
    return t != null && t <= horizonS && (m == null || t < m) ? t : m;
  }, null);

  // Identify: the per-sensor declaration under the ID model (identifyBySensor), not
  // rangeboard's classification ladder. That ladder (sim.ts, unknown -> suspected -> hostile)
  // still gates the release: with attack intent set by the adapter its "suspected" rung opens at
  // first detection, and its "hostile" rung opens at the matrix declaration OR when the threat
  // enters a connected effector's reach (`nearestRatio <= 1`). A shot can therefore leave on
  // proximity with no declaration; such a row stays at stage 'track' with outcome 'No Attempt'
  // and keeps the shot in its trace. Rangeboard has no classification rung distinct from
  // identification, so 'classify' is never emitted.
  const declaredS = identifyBySensor(a, result, ctx, truth);
  const identifyS = declaredS != null && declaredS <= horizonS ? declaredS : null;
  // With doctrine enabled a shot never leaves before readyS, so Engage implies Target here;
  // preview can show Engage without Target (plan status, lane 2.2).
  const targetS =
    a.effectorGates?.reduce<number | null>(
      (m, g) => (m == null || g.readyS < m ? g.readyS : m),
      null,
    ) ?? null;
  const shotS = firstShot?.tS ?? null;
  const killS = defeated ? dead.tS : null;

  let stage: StageReached = 'none';
  if (detectS != null) stage = 'detect';
  if (stage === 'detect' && trackS != null) stage = 'track';
  if (stage === 'track' && identifyS != null) stage = 'identify';
  if (stage === 'identify' && shotS != null) stage = 'engage';
  if (stage === 'engage' && defeated) stage = 'defeat';
  const engageS = stageAtLeast(stage, 'engage') ? shotS : null;

  // Positions in the rangeboard frame, converted once for the trace.
  const at = (t: number | null) => (t == null ? null : truth.pos(t));
  const detectPos = at(detectS);
  const identifyPos = at(identifyS);
  const engagePos = at(engageS);

  // 1.1.2: ground range from the detecting sensor at first detection. 1.1.3 altitude: the
  // trial flies flat at the first waypoint's z (adapter LOSSES.altitudeProfile).
  const detectorEnt = detector ? entities.get(detector.sensorId) : undefined;
  const detect_range_m =
    stage !== 'none' && detectPos && detectorEnt ? groundRange(detectPos, detectorEnt.pos) : null;
  const detect_alt_m = stage !== 'none' ? truth.altM : null;

  // Track window: first track to the kill effect, the death, or path end. Continuity is the
  // union of sensor holds (coast included, as rangeboard counts it) over that window, with
  // each inclusive sample interval worth b - a + one sweep step.
  let track_continuity_pct: number | null = null;
  let track_error_m: number | null = null;
  if (stageAtLeast(stage, 'track') && trackS != null) {
    const endS = horizonS;
    const windowS = endS - trackS + stepS;
    const intervals = observations.flatMap((o) => o.intervals);
    track_continuity_pct = Math.min(
      100,
      (100 * coveredS(intervals, trackS, endS, stepS)) / windowS,
    );
    // Gaussian track error: mean distance of every sensor track estimate to the truth position.
    let sum = 0;
    let count = 0;
    for (const tr of result.tracks ?? []) {
      if (tr.uasId !== a.uasId || tr.state.tS < trackS || tr.state.tS > endS) continue;
      sum += groundRange(tr.state, truth.pos(tr.state.tS));
      count++;
    }
    track_error_m = count > 0 ? sum / count : null;
  }

  // ID fields: ground range from the nearest sensor at the declaration. id_time_s runs from
  // first detection (2.1.3t: "time to correct identification", origin stated on the row).
  const identified = stageAtLeast(stage, 'identify');
  let id_range_m: number | null = null;
  if (identified && identifyPos) {
    for (const e of scenario.entities) {
      if (e.kind !== 'sensor') continue;
      const r = groundRange(identifyPos, e.pos);
      if (id_range_m == null || r < id_range_m) id_range_m = r;
    }
  }
  const id_time_s = identified && identifyS != null && detectS != null ? identifyS - detectS : null;
  const identified_ok = identified ? true : null;

  // 3.1.3 Defeat Range: ground range from the killing effector at the kill effect time for a
  // Success row (DroneScore: "distance to the target at defeat"). A Miss row carries the range
  // from the first shooter at release. The release position stays in the trace as
  // positions.engage.
  const shooter = firstShot ? entities.get(firstShot.effectorId) : undefined;
  const killer = killEvent ? entities.get(killEvent.effectorId) : undefined;
  let engagement_range_m: number | null = null;
  if (stage === 'defeat' && killEvent && killer)
    engagement_range_m = groundRange(truth.pos(killEvent.tEffectS), killer.pos);
  else if (stage === 'engage' && engagePos && shooter)
    engagement_range_m = groundRange(engagePos, shooter.pos);
  const time_to_intercept_s =
    stage === 'defeat' && killEvent && firstShot ? killEvent.tEffectS - firstShot.tS : null;

  const outcome: Outcome =
    stage === 'defeat' ? 'Success' : stage === 'engage' ? 'Miss' : 'No Attempt';

  const row: RunRow = {
    run,
    threat: a.uasId,
    stage_reached: stage,
    detect_range_m,
    detect_alt_m,
    track_continuity_pct,
    track_error_m,
    id_range_m,
    id_time_s,
    identified_ok,
    engagement_range_m,
    time_to_intercept_s,
    outcome,
  };
  const positions: RunTrace['positions'] = {};
  const put = (k: TraceKey, p: Vec2 | null) => {
    if (p) positions[k] = toVignetteFrame(p, truth.altM);
  };
  put('detect', detectPos);
  put('track', at(trackS));
  put('identify', identifyPos);
  put('target', at(targetS));
  put('engage', at(shotS));
  put('effect', at(killS));
  put('arrival', at(a.arrivalS));
  const trace: RunTrace = {
    run,
    threat: a.uasId,
    times: {
      detect: detectS,
      track: trackS,
      identify: identifyS,
      target: targetS,
      engage: shotS,
      effect: killS,
      arrival: a.arrivalS,
    },
    positions,
    status: a.status,
  };
  return { row, trace };
}

/** Replicate run id: the manifest hashes it into the replicate index, so (seed, i) fixes every draw. */
export function replicateRunId(seed: number, i: number): string {
  return `rep-${seed}-${i}`;
}

/** Run `n` replicates of the vignette at `seed`. Rows in replicate order, then vignette threat order. */
export function run(v: Vignette, n: number, seed: number, onProgress?: Progress): RunResult {
  if (!Number.isInteger(n) || n < 1) throw new Error('run: n must be a positive integer');
  const { scenario, manifest: first } = toScenario(v, seed, replicateRunId(seed, 0));
  const entities = new Map(scenario.entities.map((e) => [e.id, e] as const));
  const truths = new Map<string, Truth>();
  for (const t of v.threats) {
    const path = scenario.paths.find((p) => p.entityId === t.id);
    if (path) truths.set(t.id, truthOf(scenario, path, threatAltitudeM(t)));
  }
  const thresholds = resolvedThresholds(scenario);
  const rows: RunRow[] = [];
  const trace: RunTrace[] = [];
  for (let i = 0; i < n; i++) {
    const manifest =
      i === 0
        ? first
        : createTrialManifest(scenario, replicateRunId(seed, i), first.basisSignature, {
            producer: first.producer,
          });
    const result = runTrial(scenario, manifest);
    const ctx: RunContext = {
      v,
      scenario,
      entities,
      stepS: scenario.sweepStepS ?? DEFAULTS.sweepStepS,
      draw: monteCarloPolicy(manifest.seed, manifest.replicateIndex, thresholds),
    };
    const byId = new Map(result.assessments.map((a) => [a.uasId, a] as const));
    for (const t of v.threats) {
      const a = byId.get(t.id);
      const truth = truths.get(t.id);
      if (!a || !truth) throw new Error(`run: no assessment for threat ${t.id}`);
      const m = mapThreat(i, a, result, ctx, truth);
      rows.push(m.row);
      trace.push(m.trace);
    }
    onProgress?.(i + 1, n);
  }
  return { rows, trace };
}
