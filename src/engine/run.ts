/**
 * Monte Carlo run: n replicates of the vignette through rangeboard `runTrial`, one
 * `RunRow` per threat per replicate in DroneScore field names (spec section 5), plus a
 * `RunTrace` beside each row with the rangeboard gate times that DroneScore has no field
 * for (the F2T2EA Target time among them).
 *
 * Preview (preview.ts) applies its own coverage rules; the rows here follow the rangeboard
 * gates and may disagree with it where noted.
 */
import type { Outcome, RunRow, StageReached, Vignette } from '../domain/types';
import { toScenario, threatAltitudeM } from './adapter';
import { runTrial } from './sim/playback/trial';
import { createTrialManifest } from './sim/playback/trialTypes';
import type { TrialResult } from './sim/playback/trialTypes';
import type { ThreatAssessment } from './sim/playback/sim';
import { deadTimeOf } from './sim/playback/deadTimes';
import { posAtTime } from './sim/geometry/geo';
import { pathDurationS, pathSpeed } from './sim/model/scenario';
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

/** Union of inclusive intervals clipped to [lo, hi], as total covered seconds. */
function coveredS(intervals: Array<[number, number]>, lo: number, hi: number): number {
  const clipped = intervals
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
    .filter(([a, b]) => b >= a)
    .sort((p, q) => p[0] - q[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of clipped) {
    if (cur && iv[0] <= cur[1]) cur[1] = Math.max(cur[1], iv[1]);
    else {
      if (cur) total += cur[1] - cur[0];
      cur = [iv[0], iv[1]];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

function toVignetteFrame(p: Vec2, z: number): TracePoint {
  return { x: p.x, y: -p.y, z };
}

/** One threat's assessment and ledger into a DroneScore row and its trace. */
function mapThreat(
  run: number,
  a: ThreatAssessment,
  result: TrialResult,
  scenario: Scenario,
  entities: Map<string, Entity>,
  truth: Truth,
): { row: RunRow; trace: RunTrace } {
  const { report } = result;
  const events = report.events.filter((e) => e.uasId === a.uasId);
  const firstShot = events.length > 0 ? events[0]! : null;
  const killEvent = events.find((e) => e.killDelta > 0) ?? null;
  // Rangeboard defeat rule: every ship latched dead, and the killing effect landed before
  // arrival at the defended asset (deadTimes.ts). Preview has no late-kill notion, so the two
  // can disagree for a kill inside the asset boundary: here it is a Miss.
  const dead = deadTimeOf(report, a.uasId);
  const defeated = dead != null && !dead.late;
  const trackS =
    a.sensorObservations?.reduce<number | null>(
      (m, o) => (o.trackInitAtS != null && (m == null || o.trackInitAtS < m) ? o.trackInitAtS : m),
      null,
    ) ??
    a.stableTrackAtS ??
    null;
  const detectS = a.firstDetectS;
  const identifyS = a.classificationAtS.hostileAtS;
  // Rangeboard has no classification rung distinct from identification (its ladder is
  // unknown -> suspected -> hostile), so 'classify' is never emitted.
  // With doctrine enabled a shot never leaves before readyS, so Engage implies Target here;
  // preview can show Engage without Target (plan status, lane 2.2).
  const targetS =
    a.effectorGates?.reduce<number | null>(
      (m, g) => (m == null || g.readyS < m ? g.readyS : m),
      null,
    ) ?? null;
  const engageS = firstShot?.tS ?? null;
  const effectS = defeated ? dead.tS : null;

  let stage: StageReached = 'none';
  if (detectS != null) stage = 'detect';
  if (stage === 'detect' && trackS != null) stage = 'track';
  if (stage === 'track' && identifyS != null) stage = 'identify';
  if (stage === 'identify' && engageS != null) stage = 'engage';
  if (stage === 'engage' && defeated) stage = 'defeat';

  // Positions in the rangeboard frame, converted once for the trace.
  const at = (t: number | null) => (t == null ? null : truth.pos(t));
  const detectPos = at(detectS);
  const identifyPos = at(identifyS);
  const engagePos = at(engageS);
  const effectPos = at(effectS);

  // 1.1.2: ground range from the detecting sensor at first detection.
  const detector = a.firstDetectSensorId ? entities.get(a.firstDetectSensorId) : undefined;
  const detect_range_m =
    stage !== 'none' && detectPos && detector ? groundRange(detectPos, detector.pos) : null;
  const detect_alt_m = stage !== 'none' ? truth.altM : null;

  // Track window: first track to defeat or path end. Continuity is the union of sensor holds
  // (coast included, as rangeboard counts it) over that window.
  let track_continuity_pct: number | null = null;
  let track_error_m: number | null = null;
  if (stageAtLeast(stage, 'track') && trackS != null) {
    const endS = effectS ?? truth.endS;
    const window = endS - trackS;
    if (window > 0) {
      const intervals = (a.sensorObservations ?? []).flatMap((o) => o.intervals);
      track_continuity_pct = Math.min(100, (100 * coveredS(intervals, trackS, endS)) / window);
    } else track_continuity_pct = 100;
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

  // ID fields: ground range from the nearest sensor at the hostile rung.
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

  // Engagement: ground range from the firing effector at the first shot; time from that
  // shot to the killing effect.
  const shooter = firstShot ? entities.get(firstShot.effectorId) : undefined;
  const engagement_range_m =
    stageAtLeast(stage, 'engage') && engagePos && shooter
      ? groundRange(engagePos, shooter.pos)
      : null;
  const time_to_intercept_s =
    defeated && killEvent && firstShot ? killEvent.tEffectS - firstShot.tS : null;

  const outcome: Outcome = defeated ? 'Success' : engageS != null ? 'Miss' : 'No Attempt';

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
  put('engage', engagePos);
  put('effect', effectPos);
  put('arrival', at(a.arrivalS));
  const trace: RunTrace = {
    run,
    threat: a.uasId,
    times: {
      detect: detectS,
      track: trackS,
      identify: identifyS,
      target: targetS,
      engage: engageS,
      effect: effectS,
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
    const byId = new Map(result.assessments.map((a) => [a.uasId, a] as const));
    for (const t of v.threats) {
      const a = byId.get(t.id);
      const truth = truths.get(t.id);
      if (!a || !truth) throw new Error(`run: no assessment for threat ${t.id}`);
      const m = mapThreat(i, a, result, scenario, entities, truth);
      rows.push(m.row);
      trace.push(m.trace);
    }
    onProgress?.(i + 1, n);
  }
  return { rows, trace };
}
