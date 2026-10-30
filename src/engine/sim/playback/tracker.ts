import type { Entity, Scenario, SensorSpec, UasSpec, Vec2 } from '../model/types';
import { mountHeightOf, physicsSwitches } from '../model/types';
import { modelFor } from '../model/scenario';
import { dist } from '../geometry/geo';
import { slantRangeM } from '../geometry/slant';
import { normalQuantile } from '../analysis/uncertainty';
import { rfLinkModelApplies } from '../analysis/sensorEnv';
import type { DetectionHit } from './detection';
import type { DrawPolicy } from './policy';
import type { Covariance4, TrackEstimateSink, TrackMeasurement, TrackState } from './trackTypes';
import {
  INIT_SPEED_SIGMA_MPS,
  initFromMeasurement,
  predict,
  PROCESS_NOISE_Q,
  quality,
  update,
  ZERO_COVARIANCE,
} from './kalman';

/**
 * Per-sensor track management on top of the sweep's detection decisions.
 * The sweep decides who holds, coasts and drops (sweep.ts); the tracker
 * gives each held sensor-threat pair a state estimate. One track per
 * (sensor, threat): a formation is one track whose measurement is the
 * nearest detected member. On a measured step the Kalman filter updates
 * from the truth position plus polar noise; on a carried or coasting step
 * it predicts only, so the covariance grows; a sensor the sweep does not
 * hold this step loses its track.
 *
 * Truth path: a sensor without both `rangeAccuracyM` and
 * `azimuthAccuracyDeg`, or any sensor under the `truthTracks` switch,
 * reports the truth position and velocity with zero covariance, quality 1
 * and consumes no draw. The noise draw is taken on the estimate path only.
 */

/** How the sweep holds one sensor's track this step. */
export type TrackHold = 'measure' | 'carry' | 'coast';

interface TrackerSensor {
  sensor: Entity;
  spec: SensorSpec;
  /** Height of the sensor above the board, meters, for the slant-range match. */
  heightM: number;
  /** True when this sensor reports truth (no accuracy fields, or the switch). */
  truth: boolean;
  rangeSigmaM: number;
  azimuthSigmaRad: number;
}

interface Track {
  id: string;
  sensorId: string;
  state: TrackState;
  cov: Covariance4;
  hits: number;
  misses: number;
  coasting: boolean;
  truth: boolean;
  /** Truth path: offset of the measured member from the lead, so a carried step still reads truth. */
  offset: Vec2;
  /** Set when the sweep touched the track this step; an untouched track drops at emit. */
  touched: boolean;
}

/** The tracks of one threat across every sensor for one sweep run. */
export interface TrackManager {
  /** Once per step, before any sensor: the truth position set and the step time. */
  beginStep(members: Vec2[], t: number): void;
  /**
   * One sensor's hold this step. `hit` is required for 'measure' and unused
   * otherwise; `misses` is the sweep's consecutive missed-scan count, 0 when
   * it keeps none. A sensor not stepped before `endStep` loses its track.
   */
  step(
    sensorId: string,
    t: number,
    hold: TrackHold,
    hit: DetectionHit | undefined,
    misses: number,
    accuracy?: { rangeSigmaM: number; azimuthSigmaRad: number },
  ): void;
  /** Once per step, after every sensor: drop untouched tracks and emit the rest to the sink. */
  endStep(t: number): void;
  /** Live tracks by id, read between steps. */
  readonly tracks: ReadonlyMap<string, Readonly<Pick<Track, 'id' | 'sensorId' | 'state' | 'cov'>>>;
}

const DEG = Math.PI / 180;

/** Track id of one sensor against one threat. */
export function trackId(sensorId: string, uasId: string): string {
  return `${sensorId}:${uasId}`;
}

/** True when this sensor takes the truth path: no accuracy pair, or the truthTracks switch. */
export function truthPathFor(scenario: Scenario, spec: SensorSpec, target?: UasSpec): boolean {
  if (physicsSwitches(scenario).includes('truthTracks')) return true;
  if (
    target &&
    spec.azimuthAccuracyDeg != null &&
    rfLinkModelApplies(spec, target, physicsSwitches(scenario).includes('rfBandGate'))
  )
    return false;
  return spec.rangeAccuracyM == null || spec.azimuthAccuracyDeg == null;
}

/**
 * Cartesian measurement of one truth point from one sensor: polar noise
 * with range sigma along the ground line of sight and cross-range sigma
 * `slantM * azimuthSigmaRad` across it, rotated into the board frame. `z1`
 * and `z2` are standard normals along range and cross-range. The
 * elevation error is not modeled in this phase: the range sigma is applied
 * along the ground projection unchanged.
 */
export function polarMeasurement(
  sensorPos: Vec2,
  truth: Vec2,
  slantM: number,
  rangeSigmaM: number,
  azimuthSigmaRad: number,
  z1: number,
  z2: number,
  sensorId: string,
  uasId: string,
  tS: number,
): TrackMeasurement {
  const dx = truth.x - sensorPos.x;
  const dy = truth.y - sensorPos.y;
  const ground = Math.hypot(dx, dy);
  const c = ground > 0 ? dx / ground : 1;
  const s = ground > 0 ? dy / ground : 0;
  const sr = rangeSigmaM;
  const sc = slantM * azimuthSigmaRad;
  const vr = sr * sr;
  const vc = sc * sc;
  const varX = vr * c * c + vc * s * s;
  const varY = vr * s * s + vc * c * c;
  const cov = (vr - vc) * s * c;
  const sigmaXM = Math.sqrt(varX);
  const sigmaYM = Math.sqrt(varY);
  const rhoXY =
    sigmaXM > 0 && sigmaYM > 0 ? Math.max(-1, Math.min(1, cov / (sigmaXM * sigmaYM))) : 0;
  return {
    sensorId,
    tS,
    x: truth.x + sr * z1 * c - sc * z2 * s,
    y: truth.y + sr * z1 * s + sc * z2 * c,
    sigmaXM,
    sigmaYM,
    rhoXY,
    uasId,
  };
}

/**
 * Build the manager for one threat: the active sensors with a spec, the
 * threat's altitude for the slant-range match, the policy for the noise
 * draw and an optional sink. Without a sink nothing is allocated per step
 * beyond the filter state.
 */
export function createTrackManager(
  scenario: Scenario,
  uasId: string,
  sensors: Array<{ sensor: Entity; spec: SensorSpec }>,
  altM: number,
  policy: DrawPolicy,
  sink?: TrackEstimateSink,
): TrackManager {
  const target = scenario.entities.find((entity) => entity.id === uasId);
  const targetSpec = target ? modelFor(scenario, target)?.uas : undefined;
  const bySensor = new Map<string, TrackerSensor>();
  for (const { sensor, spec } of sensors) {
    bySensor.set(sensor.id, {
      sensor,
      spec,
      heightM: mountHeightOf(spec),
      truth: truthPathFor(scenario, spec, targetSpec),
      rangeSigmaM: spec.rangeAccuracyM ?? 0,
      azimuthSigmaRad: (spec.azimuthAccuracyDeg ?? 0) * DEG,
    });
  }
  const tracks = new Map<string, Track>();
  let members: Vec2[] = [];
  // Truth velocity of the lead member by finite difference over the last step.
  let prevLead: Vec2 | null = null;
  let prevT = 0;
  let truthVx = 0;
  let truthVy = 0;

  /** The detected member nearest the sensor: the one whose slant range is the hit's. */
  const nearestMember = (ts: TrackerSensor, hit: DetectionHit): Vec2 => {
    let best = members[0]!;
    let bestErr = Number.POSITIVE_INFINITY;
    const dAltM = altM - ts.heightM;
    for (const m of members) {
      const err = Math.abs(slantRangeM(dist(ts.sensor.pos, m), dAltM) - hit.slantM);
      if (err < bestErr) {
        bestErr = err;
        best = m;
      }
    }
    return best;
  };

  const measure = (
    ts: TrackerSensor,
    hit: DetectionHit,
    t: number,
    accuracy?: { rangeSigmaM: number; azimuthSigmaRad: number },
  ): TrackMeasurement => {
    const truth = nearestMember(ts, hit);
    const u1 = policy.noise ? policy.noise(ts.sensor.id, uasId, t, 0) : 0.5;
    const u2 = policy.noise ? policy.noise(ts.sensor.id, uasId, t, 1) : 0.5;
    return polarMeasurement(
      ts.sensor.pos,
      truth,
      hit.slantM,
      accuracy?.rangeSigmaM ?? ts.rangeSigmaM,
      accuracy?.azimuthSigmaRad ?? ts.azimuthSigmaRad,
      normalQuantile(u1),
      normalQuantile(u2),
      ts.sensor.id,
      uasId,
      t,
    );
  };

  return {
    tracks,
    beginStep(nextMembers, t) {
      members = nextMembers;
      const lead = nextMembers[0];
      if (lead && prevLead && t > prevT) {
        truthVx = (lead.x - prevLead.x) / (t - prevT);
        truthVy = (lead.y - prevLead.y) / (t - prevT);
      }
      prevLead = lead ?? null;
      prevT = t;
    },
    step(sensorId, t, hold, hit, misses, accuracy) {
      const ts = bySensor.get(sensorId);
      if (!ts) return;
      const id = trackId(sensorId, uasId);
      let track = tracks.get(id);
      if (ts.truth) {
        // Truth path: the nearest detected member on a measure; between
        // measures the same member follows the lead. No draw.
        const measured = hold === 'measure' && hit ? nearestMember(ts, hit) : null;
        const lead = members[0]!;
        if (!track) {
          if (!measured) return;
          track = {
            id,
            sensorId,
            state: { x: measured.x, y: measured.y, vx: truthVx, vy: truthVy, tS: t },
            cov: ZERO_COVARIANCE,
            hits: 0,
            misses: 0,
            coasting: false,
            truth: true,
            offset: { x: 0, y: 0 },
            touched: false,
          };
          tracks.set(id, track);
        }
        if (measured) track.offset = { x: measured.x - lead.x, y: measured.y - lead.y };
        const pos = measured ?? { x: lead.x + track.offset.x, y: lead.y + track.offset.y };
        track.state = { x: pos.x, y: pos.y, vx: truthVx, vy: truthVy, tS: t };
        if (measured) track.hits += 1;
        track.misses = misses;
        track.coasting = hold === 'coast';
        track.touched = true;
        return;
      }
      if (hold === 'measure' && hit) {
        const m = measure(ts, hit, t, accuracy);
        if (!track) {
          const init = initFromMeasurement(m, INIT_SPEED_SIGMA_MPS);
          track = {
            id,
            sensorId,
            state: init.state,
            cov: init.cov,
            hits: 1,
            misses,
            coasting: false,
            truth: false,
            offset: { x: 0, y: 0 },
            touched: true,
          };
          tracks.set(id, track);
          return;
        }
        const dt = t - track.state.tS;
        const pred = dt > 0 ? predict(track.state, track.cov, dt, PROCESS_NOISE_Q) : track;
        const upd = update(pred.state, pred.cov, m);
        track.state = upd.state;
        track.cov = upd.cov;
        track.hits += 1;
        track.misses = misses;
        track.coasting = false;
        track.touched = true;
        return;
      }
      if (!track) return;
      const dt = t - track.state.tS;
      if (dt > 0) {
        const pred = predict(track.state, track.cov, dt, PROCESS_NOISE_Q);
        track.state = pred.state;
        track.cov = pred.cov;
      }
      track.misses = misses;
      track.coasting = hold === 'coast';
      track.touched = true;
    },
    endStep(t) {
      for (const [id, track] of tracks) {
        if (!track.touched) {
          tracks.delete(id);
          continue;
        }
        track.touched = false;
        if (!sink) continue;
        sink({
          id,
          uasId,
          sensorIds: [track.sensorId],
          state: { ...track.state, tS: t },
          covariance: track.cov,
          quality: track.truth ? 1 : quality(track.cov),
          hits: track.hits,
          misses: track.misses,
          coasting: track.coasting,
          source: track.truth ? 'truth' : 'estimate',
        });
      }
    },
  };
}
