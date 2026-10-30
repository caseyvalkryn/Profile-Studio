import type { Entity, Scenario, SensorSpec } from '../model/types';
import { entityActive, physicsSwitches, runSettings } from '../model/types';
import { destination, dist } from '../geometry/geo';
import { mOfN } from '../analysis/radarPd';
import {
  scanPeriodS,
  trackDropMissesFor,
  trackInitMFor,
  trackInitNFor,
} from '../analysis/doctrineFactors';
import { stepCount } from './clock';
import { effectivePathDelayS } from './raid';
import { pathDurationS } from '../model/scenario';
import type { DrawPolicy } from './policy';
import type { TrackEstimate, TrackEstimateSink, TrackMeasurement } from './trackTypes';
import {
  INIT_SPEED_SIGMA_MPS,
  initFromMeasurement,
  predict,
  PROCESS_NOISE_Q,
  quality,
  ZERO_COVARIANCE,
} from './kalman';
import { polarMeasurement, truthPathFor } from './tracker';

/**
 * Per-replicate false-track process, one per active radar with a stated
 * `falseAlarmRatePerScan` (lambda, expected false alarms per scan over the
 * whole coverage). Truth-free: no threat is involved, so the process reads
 * only the radar, the scenario horizon and the policy's kind-9 draws.
 *
 * Closed form. A false alarm becomes a false TRACK only when alarms recur in
 * the same resolution cell M of N scans (the radar's own M-of-N initiation
 * rule, trackInitM / trackInitN). With independent alarms per scan and per
 * cell at probability p = lambda / FALSE_TRACK_CELLS, the expected false
 * track count per scan is
 *
 *   rate = FALSE_TRACK_CELLS * mOfN(lambda / FALSE_TRACK_CELLS, M, N)
 *
 * and the per-scan count is drawn Poisson(rate) by inversion from ONE
 * uniform (`draw.falseAlarm(sensorId, tScan, 0)`). This is the exact
 * per-scan mean of the cell-by-cell model (a sum of FALSE_TRACK_CELLS
 * independent Bernoulli(mOfN) confirmations, Poisson in the limit), without
 * simulating candidates over N scans.
 *
 * Each false track lives `trackDropMisses` scans (planning default) with a
 * constant-velocity state: position uniform in the radar's coverage (sector
 * and detect range, uniform in area), speed uniform in
 * FALSE_TRACK_SPEED_MPS, heading uniform. Its covariance opens from
 * `initFromMeasurement` with the radar's accuracy at that position (or the
 * truth path's zero when the radar has none) and grows by `predict` per step.
 * The `noFalseTracks` switch disables the process.
 */

/**
 * Resolution cells in a surveillance radar's coverage, a planning constant.
 * A 360 degree search radar with a 2 degree beam and a 50 m range gate out
 * to 5 km has 180 azimuth cells by 100 range cells, 1.8e4; a sector radar
 * with a finer beam and a longer range lands in the same decade. 1e4 is the
 * round order-of-magnitude figure, and the false-track rate is a weak
 * function of it: doubling the cells halves the cell probability and
 * roughly halves the rate at M = 3 (p^3 * cells scales as 1 / cells^2).
 */
export const FALSE_TRACK_CELLS = 10_000;

/** False-track speed band, m/s: the slow end of the small-UAS envelope, birds and clutter drift. */
export const FALSE_TRACK_SPEED_MPS: readonly [number, number] = [5, 30];

/** Expected false tracks per scan from the false-alarm rate and the M-of-N rule (the closed form above). */
export function falseTrackRatePerScan(lambdaPerScan: number, m: number, n: number): number {
  if (!(lambdaPerScan > 0) || !Number.isFinite(lambdaPerScan)) return 0;
  return FALSE_TRACK_CELLS * mOfN(lambdaPerScan / FALSE_TRACK_CELLS, m, n);
}

/**
 * Poisson(mean) sample by inversion of one uniform in [0, 1): the smallest k
 * whose cumulative probability exceeds u. Capped at mean + 12 sqrt(mean) + 20
 * so a uniform at the very top of the range terminates.
 */
export function poissonInverse(mean: number, u: number): number {
  if (!(mean > 0)) return 0;
  const cap = Math.ceil(mean + 12 * Math.sqrt(mean) + 20);
  let k = 0;
  let p = Math.exp(-mean);
  let cdf = p;
  while (u >= cdf && k < cap) {
    k += 1;
    p *= mean / k;
    cdf += p;
  }
  return k;
}

/**
 * The scenario's flight horizon, seconds: the latest path end over the
 * active threats (effective start delay plus path length over speed; speed
 * is the path's, else the spec cruise speed, else 15 m/s as in attrition.ts).
 * 0 with no path.
 */
export function scenarioHorizonS(scenario: Scenario): number {
  let horizon = 0;
  for (const path of scenario.paths) {
    const entity = scenario.entities.find((e) => e.id === path.entityId);
    if (!entity || entity.kind !== 'uas' || !entityActive(entity)) continue;
    const end = effectivePathDelayS(scenario, path) + pathDurationS(scenario, path);
    if (end > horizon) horizon = end;
  }
  return horizon;
}

/** Prepared false-track load of one replicate: how many false tracks exist at any time. */
export interface FalseTrackLoad {
  /** Horizon the process ran to, seconds. */
  readonly horizonS: number;
  /** False tracks created over the horizon, every radar. */
  readonly created: number;
  /** Radars that ran the process. */
  readonly sensorIds: readonly string[];
  /** False tracks alive at tS over every radar. */
  countAt(tS: number): number;
  /** False tracks alive at tS from one radar; 0 for a radar that ran no process. */
  countAtSensor(sensorId: string, tS: number): number;
}

const EMPTY_LOAD: FalseTrackLoad = Object.freeze({
  horizonS: 0,
  created: 0,
  sensorIds: [],
  countAt: () => 0,
  countAtSensor: () => 0,
});

interface FalseRadar {
  sensor: Entity;
  spec: SensorSpec;
  periodS: number;
  ratePerScan: number;
  lifeScans: number;
  hitsAtInit: number;
  truth: boolean;
}

/** Active radars with a positive false-alarm rate, with their per-scan false-track rate. */
function falseRadars(scenario: Scenario, stepS: number): FalseRadar[] {
  const out: FalseRadar[] = [];
  for (const sensor of scenario.entities) {
    if (sensor.kind !== 'sensor' || !entityActive(sensor)) continue;
    const spec = scenario.library.find((m) => m.id === sensor.specId)?.sensor;
    if (!spec || spec.sensorType !== 'radar') continue;
    const lambda = spec.falseAlarmRatePerScan;
    if (lambda == null || !Number.isFinite(lambda) || lambda <= 0) continue;
    // A false alarm is a receiver event with no target, so the scan clock is
    // the radar's own: updateRateS, else the role's SCAN_S. A period below
    // the step counts one scan per step, as the sweep does.
    const periodS = Math.max(scanPeriodS(spec, true) ?? stepS, stepS);
    const m = trackInitMFor(spec);
    const n = trackInitNFor(spec);
    const ratePerScan = falseTrackRatePerScan(lambda, m, n);
    if (!(ratePerScan > 0)) continue;
    out.push({
      sensor,
      spec,
      periodS,
      ratePerScan,
      lifeScans: trackDropMissesFor(spec),
      hitsAtInit: m,
      truth: truthPathFor(scenario, spec),
    });
  }
  return out;
}

/**
 * Run the false-track process for one replicate over [0, horizonS] and
 * return its load. Draw keys, kind 9 (sensorId, k, step of the scan time):
 * k 0 is the Poisson count; the n-th false track of a scan reads k = 4n + 1
 * and 4n + 2 for its position (range, bearing), 4n + 3 for speed and 4n + 4
 * for heading. Scans start at t = 0: the false process is independent of any
 * threat, and reading the sweep's phase draw here would add a phase call per
 * radar that the common-random-number tests count. Each false track's
 * `TrackEstimate` per step goes to
 * the sink when one is attached; without a sink only the counts are kept.
 */
export function prepareFalseTracks(
  scenario: Scenario,
  draw: DrawPolicy,
  horizonS: number,
  sink?: TrackEstimateSink,
): FalseTrackLoad {
  if (physicsSwitches(scenario).includes('noFalseTracks')) return EMPTY_LOAD;
  // The manifest step (clock.ts): the false process samples on the sweep grid.
  const stepS = runSettings(scenario).sweepStepS;
  const radars = falseRadars(scenario, stepS);
  if (radars.length === 0 || !(horizonS >= 0)) return EMPTY_LOAD;
  const steps = stepCount(horizonS, stepS) + 1;
  const total = new Float64Array(steps);
  const bySensor = new Map<string, Float64Array>();
  let created = 0;

  for (const radar of radars) {
    const counts = new Float64Array(steps);
    bySensor.set(radar.sensor.id, counts);
    const originS = 0;
    const lifeS = radar.lifeScans * radar.periodS;
    for (let scanIdx = 0; ; scanIdx += 1) {
      const tScan = originS + scanIdx * radar.periodS;
      if (tScan > horizonS + 1e-9) break;
      const count = poissonInverse(radar.ratePerScan, draw.falseAlarm(radar.sensor.id, tScan, 0));
      if (count === 0) continue;
      created += count;
      // Live over steps with tScan <= t < tScan + lifeS.
      const first = Math.max(0, Math.ceil(tScan / stepS - 1e-9));
      const last = Math.min(steps - 1, Math.ceil((tScan + lifeS) / stepS - 1e-9) - 1);
      for (let i = first; i <= last; i += 1) {
        counts[i]! += count;
        total[i]! += count;
      }
      if (!sink) continue;
      for (let n = 0; n < count; n += 1) {
        emitFalseTrack(radar, draw, tScan, scanIdx, n, first, last, stepS, sink);
      }
    }
  }

  const at = (arr: Float64Array | undefined, tS: number): number => {
    if (!arr) return 0;
    const i = stepCount(tS, stepS);
    return i >= 0 && i < arr.length ? arr[i]! : 0;
  };
  return {
    horizonS,
    created,
    sensorIds: radars.map((r) => r.sensor.id),
    countAt: (tS) => at(total, tS),
    countAtSensor: (sensorId, tS) => at(bySensor.get(sensorId), tS),
  };
}

/** Draw one false track's state at its confirming scan and emit its estimate for every live step. */
function emitFalseTrack(
  radar: FalseRadar,
  draw: DrawPolicy,
  tScan: number,
  scanIdx: number,
  n: number,
  firstStep: number,
  lastStep: number,
  stepS: number,
  sink: TrackEstimateSink,
): void {
  const id = radar.sensor.id;
  const k = 4 * n;
  const uRange = draw.falseAlarm(id, tScan, k + 1);
  const uBearing = draw.falseAlarm(id, tScan, k + 2);
  const uSpeed = draw.falseAlarm(id, tScan, k + 3);
  const uHeading = draw.falseAlarm(id, tScan, k + 4);
  // Uniform in area: range grows as sqrt(u); bearing uniform across the sector.
  const rangeM = radar.spec.detectRangeM * Math.sqrt(uRange);
  const sector = radar.spec.sectorDeg >= 360 ? 360 : radar.spec.sectorDeg;
  const bearing = radar.sensor.headingDeg + sector * (uBearing - 0.5);
  const pos = destination(radar.sensor.pos, bearing, rangeM);
  const [lo, hi] = FALSE_TRACK_SPEED_MPS;
  const speed = lo + (hi - lo) * uSpeed;
  const headingRad = 2 * Math.PI * uHeading;
  const vx = speed * Math.sin(headingRad);
  const vy = -speed * Math.cos(headingRad);

  let state = { x: pos.x, y: pos.y, vx, vy, tS: tScan };
  let cov = ZERO_COVARIANCE;
  if (!radar.truth) {
    const m: TrackMeasurement = {
      ...polarMeasurement(
        radar.sensor.pos,
        pos,
        dist(radar.sensor.pos, pos),
        radar.spec.rangeAccuracyM ?? 0,
        ((radar.spec.azimuthAccuracyDeg ?? 0) * Math.PI) / 180,
        0,
        0,
        id,
        '',
        tScan,
      ),
      uasId: null,
    };
    cov = initFromMeasurement(m, INIT_SPEED_SIGMA_MPS).cov;
  }
  const trackId = `${id}:false:${scanIdx}:${n}`;
  for (let i = firstStep; i <= lastStep; i += 1) {
    const t = i * stepS;
    const dt = t - state.tS;
    if (dt > 0) {
      const pred = predict(state, cov, dt, PROCESS_NOISE_Q);
      state = pred.state;
      cov = pred.cov;
    }
    const misses = Math.floor((t - tScan) / radar.periodS + 1e-9);
    const estimate: TrackEstimate = {
      id: trackId,
      uasId: null,
      sensorIds: [id],
      state: { ...state, tS: t },
      covariance: cov,
      quality: quality(cov),
      hits: radar.hitsAtInit,
      misses,
      coasting: misses > 0,
      source: 'false',
    };
    sink(estimate);
  }
}
