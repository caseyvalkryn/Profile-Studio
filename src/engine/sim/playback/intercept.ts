import type { EffectorSpec, FireDoctrine, Vec2 } from '../model/types';
import { bearingDeg, dist, posAtTime } from '../geometry/geo';
import { slantRangeM } from '../geometry/slant';
import { memberPositions } from './tracks';
import { expenditureChannel } from './pk';
import type { EffectorState, ThreatState } from './sweepState';
import { DT } from './clock';
import type { Covariance4, TrackEstimate } from './trackTypes';
import { positionSigmaM, predict, PROCESS_NOISE_Q } from './kalman';
import { projectileBurstDurationS } from './ballistics';
import { interceptorMissModelApplies } from './pk/kinetic';

/** Time tolerance for interval and release comparisons, seconds. */
export const EPS = 1e-9;

/** Index of the interval containing t, or -1 (none, or intervals unknown). */
export function intervalIndexAt(intervals: Array<[number, number]> | undefined, t: number): number {
  if (!intervals) return -1;
  for (let i = 0; i < intervals.length; i++) {
    const [s0, s1] = intervals[i]!;
    if (t >= s0 - EPS && t <= s1 + EPS) return i;
  }
  return -1;
}

/**
 * Average flyout speed as a fraction of the stated speed (PF). Every stated
 * flyoutSpeedMps is a maximum or a muzzle velocity, not the mean speed to the
 * target, so the flight time is charged at this fraction of it.
 */
export const FLYOUT_SPEED_FACTOR = 0.7;

/**
 * Average flyout speed in m/s (the stated speed times FLYOUT_SPEED_FACTOR);
 * 0 when the effector states no speed. A jammer, DE or HPM effect arrives
 * with the beam: no flyout even if a speed is stored.
 */
function averageFlyoutMps(spec: EffectorSpec): number {
  const v = spec.flyoutSpeedMps;
  if (v == null || !(v > 0) || expenditureChannel(spec.effectorType) !== 'kinetic') return 0;
  return v * FLYOUT_SPEED_FACTOR;
}

/** Caller-owned switch state for the Phase 3 kinetic flight model. */
export interface KineticInterceptOptions {
  /** True for the scenario's `legacyKineticPk` switch. */
  fallback: boolean;
}

interface FlyoutProfile {
  /** Delay after physical release before the modeled projectile begins its flight. */
  launchDelayS: number;
  /** Distance available after `flightS`, measured from projectile launch. */
  distanceAt(flightS: number): number;
  /** Interceptor terminal seeker range; absent for a gun. */
  seekerAcquisitionRangeM: number | null;
}

function positive(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function nonNegative(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

/**
 * The modeled kinetic flight profile, or null for the bit-identical legacy
 * path. A null lethal radius or dispersion falls back to the library data, as
 * the caller-supplied physics switch does.
 */
function flyoutProfile(
  spec: EffectorSpec,
  options: KineticInterceptOptions | undefined,
): FlyoutProfile | null {
  if (options == null) return null;

  if (spec.effectorType === 'interceptor') {
    if (!interceptorMissModelApplies(spec, options.fallback)) return null;
    const cruiseMps = spec.flyoutSpeedMps;
    const boostS = spec.boostTimeS;
    const peakMps = spec.maxFlyoutSpeedMps;
    if (!positive(boostS) || !positive(peakMps)) {
      return {
        launchDelayS: 0,
        distanceAt: (flightS) => cruiseMps * Math.max(0, flightS),
        seekerAcquisitionRangeM: positive(spec.seekerAcquisitionRangeM)
          ? spec.seekerAcquisitionRangeM
          : null,
      };
    }
    const boostDistanceM = 0.5 * peakMps * boostS;
    return {
      launchDelayS: 0,
      distanceAt: (flightS) => {
        const t = Math.max(0, flightS);
        if (t <= boostS) return 0.5 * (peakMps / boostS) * t * t;
        return boostDistanceM + cruiseMps * (t - boostS);
      },
      seekerAcquisitionRangeM: positive(spec.seekerAcquisitionRangeM)
        ? spec.seekerAcquisitionRangeM
        : null,
    };
  }

  if (options.fallback) return null;

  if (spec.effectorType === 'gun') {
    if (
      !nonNegative(spec.dispersionMils) ||
      !nonNegative(spec.fireControlErrorMils) ||
      !positive(spec.muzzleVelocityMps)
    )
      return null;
    const burstS = projectileBurstDurationS(spec);
    if (burstS == null) return null;
    return {
      launchDelayS: burstS,
      distanceAt: (flightS) => spec.muzzleVelocityMps! * Math.max(0, flightS),
      seekerAcquisitionRangeM: null,
    };
  }

  return null;
}

/** Distance flown by an interceptor under the Phase 3 boost/cruise profile. */
export function interceptorDistanceM(spec: EffectorSpec, flightS: number): number | null {
  const profile = flyoutProfile(spec, { fallback: false });
  return spec.effectorType === 'interceptor' && profile != null
    ? profile.distanceAt(flightS)
    : null;
}

/**
 * Earliest time a monotone flyout profile reaches a moving point. The
 * bracket doubles until closure, then bisection resolves the first crossing.
 * Target paths end at a held point, so any positive cruise eventually closes.
 */
function profileMeetTau(
  profile: FlyoutProfile,
  slantAt: (flightS: number) => number,
): number | null {
  const closure = (flightS: number) => profile.distanceAt(flightS) - slantAt(flightS);
  if (closure(0) >= -EPS) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 64 && closure(hi) < 0; i += 1) {
    lo = hi;
    hi *= 2;
  }
  if (closure(hi) < 0) return null;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (closure(mid) >= 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Largest slant miss that still counts as a constant-speed meeting, as a
 * fraction of the distance flown (floored at one meter). It sits above float
 * noise and meetTau's root clamping at an interval end, and far below any
 * real gap between the sampled trajectory and the constant-speed one.
 */
const CONSTANT_SPEED_MISS = 1e-6;

/** Constant-speed flyout as a profile, so the sampled solve reuses profileMeetTau. */
function constantSpeedProfile(v: number): FlyoutProfile {
  return {
    launchDelayS: 0,
    distanceAt: (flightS) => v * Math.max(0, flightS),
    seekerAcquisitionRangeM: null,
  };
}

/**
 * True when a constant-speed flyout of `v` really reaches the SAMPLED target
 * after `tofS`, so the closed-form time and the sampled trajectory describe
 * the same motion. False under flight limits, where the sampler accelerates,
 * rounds its corners or drifts downwind away from the closed-form point.
 */
function closesOnSample(
  sampleAt: (tEffectS: number) => { slantM: number },
  releaseS: number,
  tofS: number,
  v: number,
): boolean {
  const flownM = v * tofS;
  const missM = Math.abs(sampleAt(releaseS + tofS).slantM - flownM);
  return missM <= CONSTANT_SPEED_MISS * Math.max(1, flownM);
}

/** Flight time to a stationary point under the Phase 3 interceptor profile. */
export function interceptorFlightTimeS(spec: EffectorSpec, slantM: number): number | null {
  if (!Number.isFinite(slantM) || slantM < 0 || spec.effectorType !== 'interceptor') return null;
  const profile = flyoutProfile(spec, { fallback: false });
  return profile == null ? null : profileMeetTau(profile, () => slantM);
}

/**
 * A terminal seeker must come within its acquisition range before the
 * credited flyout ends. This only adds a rejection at a capped intercept;
 * an uncapped intercept necessarily traverses the acquisition point first.
 */
function seekerAcquisitionAfterEnd(
  profile: FlyoutProfile,
  slantM: number,
  flownS: number,
): boolean {
  const seekerM = profile.seekerAcquisitionRangeM;
  if (seekerM == null) return false;
  return profile.distanceAt(flownS) + EPS < Math.max(0, slantM - seekerM);
}

/** Formation member positions of a threat at one sim time. */
export function membersAtTime(ts: ThreatState, tS: number): Vec2[] {
  const s = ts.sampleFlightAt?.(tS) ?? posAtTime(ts.path!.points, ts.speedMps, ts.delayS, tS);
  return memberPositions(ts.entity, s.pos, s.headingDeg);
}

/**
 * Smallest tau at or after tau0 (and at or before tau1) with
 * |C + B tau|^2 + dAlt^2 = (v tau)^2: the interceptor, flying the slant at
 * constant v from tau 0, meets a target moving at constant velocity B from
 * position C at tau 0. Null when no such tau exists in the range.
 */
function meetTau(
  C: Vec2,
  B: Vec2,
  dAltM: number,
  v: number,
  tau0: number,
  tau1: number,
): number | null {
  const a = B.x * B.x + B.y * B.y - v * v;
  const b = 2 * (C.x * B.x + C.y * B.y);
  const c = C.x * C.x + C.y * C.y + dAltM * dAltM;
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    roots.push((-b - sq) / (2 * a), (-b + sq) / (2 * a));
  }
  let best: number | null = null;
  for (const r of roots) {
    if (r < tau0 - EPS || r > tau1 + EPS) continue;
    if (best == null || r < best) best = r;
  }
  return best == null ? null : Math.max(best, tau0);
}

/**
 * Exact constant-speed flight time from `releaseS` to the ship: the
 * target flies its path at ts.speedMps after ts.delayS, holding the first
 * point before the delay and the last point after the path ends, and on each
 * straight segment its formation member moves at constant velocity, so the
 * meeting time is the smallest root of a quadratic per phase, taken in time
 * order. Null only when no phase yields a meeting (a path that never ends).
 */
function analyticTofS(
  ts: ThreatState,
  es: EffectorState,
  releaseS: number,
  memberIdx: number,
  dAltM: number,
): number | null {
  const v = averageFlyoutMps(es.spec);
  const pts = ts.path!.points;
  const u = ts.speedMps;
  const L = es.entity.pos;
  const offsetAt = (headingDeg: number): Vec2 => {
    const ms = memberPositions(ts.entity, { x: 0, y: 0 }, headingDeg);
    return ms[Math.min(memberIdx, ms.length - 1)]!;
  };
  // Relative position of the member when the entity is at `pos` with `heading`.
  const rel = (pos: Vec2, headingDeg: number): Vec2 => {
    const o = offsetAt(headingDeg);
    return { x: pos.x + o.x - L.x, y: pos.y + o.y - L.y };
  };
  const still = (P: Vec2, tau0: number, tau1: number) =>
    meetTau(P, { x: 0, y: 0 }, dAltM, v, tau0, tau1);
  const heading0 = bearingDeg(pts[0]!, pts[1]!);
  const INF = Number.POSITIVE_INFINITY;
  // Before the delay the target holds the first point.
  if (releaseS < ts.delayS) {
    const tau = still(rel(pts[0]!, heading0), 0, ts.delayS - releaseS);
    if (tau != null) return tau;
  }
  let tStart = ts.delayS;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = dist(a!, b);
    if (seg === 0) continue;
    const tEnd = tStart + seg / u;
    if (tEnd > releaseS) {
      const heading = bearingDeg(a!, b);
      const B = { x: ((b.x - a.x) / seg) * u, y: ((b.y - a.y) / seg) * u };
      const A = rel(a!, heading); // member position at tStart
      const tau0 = Math.max(0, tStart - releaseS);
      // Position at release-relative tau: A + B (tau - (tStart - releaseS)).
      const shift = tStart - releaseS;
      const C = { x: A.x - B.x * shift, y: A.y - B.y * shift };
      const tau = meetTau(C, B, dAltM, v, tau0, tEnd - releaseS);
      if (tau != null) return tau;
    }
    tStart = tEnd;
  }
  // After the path ends the target holds the last point with the last heading.
  const last = pts[pts.length - 1];
  const headingEnd = bearingDeg(pts[pts.length - 2]!, last!);
  return still(rel(last!, headingEnd), Math.max(0, tStart - releaseS), INF);
}

/** The truth-path intercept result (interceptAt). */
export interface InterceptResult {
  pos: Vec2;
  slantM: number;
  tEffectS: number;
  capped: boolean;
  infeasible: boolean;
}

/** Which path solved the intercept point. */
export type InterceptSource = 'truth' | 'estimate';

/** An intercept solved from a track estimate: the truth shape plus the prediction error. */
export interface EstimateIntercept extends InterceptResult {
  /** Predicted position 1 sigma at the intercept time, meters (positionSigmaM of the propagated covariance). */
  predictionSigmaM: number;
}

/** interceptFor result: the truth shape plus the prediction error and its source. */
export interface SelectedIntercept extends InterceptResult {
  /** Null on the truth path. */
  predictionSigmaM: number | null;
  interceptSource: InterceptSource;
}

/**
 * Predicted intercept for one ship: position and slant sampled at the returned
 * tEffectS. With no kinetic options this keeps the legacy constant-speed path
 * bit for bit. `{ fallback: false }` selects the modeled interceptor profile
 * or drag-free last-projectile gun timing when its sentinel fields exist.
 * `membersAt` lets the sweep supply its per-tick geometry cache.
 * `capS` is the end of the in-range interval containing tS: a flight past it is
 * held at the cap and reported `capped`; a release already past the cap is not.
 * `infeasible` is true when the slant exceeds the flight profile's reach by
 * more than one sweep step, or terminal seeker acquisition occurs after a
 * capped flyout; the caller declines the shot. Never true without a flyout.
 */
export function interceptAt(
  ts: ThreatState,
  es: EffectorState,
  tS: number,
  memberIdx: number,
  membersAt: (ts: ThreatState, tS: number) => Vec2[] = membersAtTime,
  capS = Number.POSITIVE_INFINITY,
  stepS = DT,
  kineticOptions?: KineticInterceptOptions,
): InterceptResult {
  const dAltM = ts.altM - es.mountM;
  const sampleAt = (tEffectS: number) => {
    const members = membersAt(ts, tEffectS);
    const pos = members[Math.min(memberIdx, members.length - 1)]!;
    return { pos, slantM: slantRangeM(dist(es.entity.pos, pos!), dAltM) };
  };
  const releaseS = tS + es.engageTimeS;
  const profile = flyoutProfile(es.spec, kineticOptions);
  if (profile != null) {
    const flightReleaseS = releaseS + profile.launchDelayS;
    const flightS = profileMeetTau(profile, (tauS) => sampleAt(flightReleaseS + tauS).slantM);
    if (flightS == null) {
      const tEffectS = Number.isFinite(capS) && releaseS <= capS ? capS : releaseS;
      return { ...sampleAt(tEffectS), tEffectS, capped: false, infeasible: true };
    }
    const uncappedEffectS = flightReleaseS + flightS;
    const capped = releaseS <= capS && uncappedEffectS > capS;
    const tEffectS = capped ? capS : uncappedEffectS;
    const at = sampleAt(tEffectS);
    const flownS = Math.max(0, tEffectS - flightReleaseS);
    const unreachable = at.slantM > profile.distanceAt(flownS + stepS) + EPS;
    const seekerLate = seekerAcquisitionAfterEnd(profile, at.slantM, flownS);
    return { ...at, tEffectS, capped, infeasible: unreachable || seekerLate };
  }
  const v = averageFlyoutMps(es.spec);
  // A ship with no path (or no speed) is stationary where the sampler puts it.
  const moving = ts.path != null && ts.path.points.length >= 2 && ts.speedMps > 0;
  let tofS =
    v <= 0
      ? 0
      : moving
        ? analyticTofS(ts, es, releaseS, memberIdx, dAltM)
        : sampleAt(releaseS).slantM / v;
  // The closed-form time above assumes constant-speed waypoint motion, but the
  // position and feasibility below read the sampled flight. Keep the closed
  // form only when the flyout really closes on the sampled target; otherwise
  // solve against that same sampled trajectory, so all three agree.
  if (v > 0 && tofS != null && !closesOnSample(sampleAt, releaseS, tofS, v)) {
    tofS = profileMeetTau(constantSpeedProfile(v), (tauS) => sampleAt(releaseS + tauS).slantM);
  }
  if (tofS == null) {
    // No meeting on a path that never ends: credit nothing, decline.
    const tEffectS = Number.isFinite(capS) && releaseS <= capS ? capS : releaseS;
    return { ...sampleAt(tEffectS), tEffectS, capped: false, infeasible: true };
  }
  const capped = releaseS <= capS && releaseS + tofS > capS;
  const tEffectS = capped ? capS : releaseS + tofS;
  const at = sampleAt(tEffectS);
  const infeasible = v > 0 && at.slantM > v * (tEffectS - releaseS) + v * stepS;
  return { ...at, tEffectS, capped, infeasible };
}

/**
 * The estimate propagated to tS under constant velocity with the CWNA process
 * noise of `kalman.predict` (PROCESS_NOISE_Q), so the covariance grows with
 * the lead time tS - estimate.state.tS. The caller passes tS at or after the
 * estimate time; the state is a straight-line extrapolation either way.
 */
export function predictedStateAt(
  estimate: TrackEstimate,
  tS: number,
): { x: number; y: number; vx: number; vy: number; cov: Covariance4 } {
  const { state, cov } = predict(
    estimate.state,
    estimate.covariance,
    tS - estimate.state.tS,
    PROCESS_NOISE_Q,
  );
  return { x: state.x, y: state.y, vx: state.vx, vy: state.vy, cov };
}

/** Position 1 sigma of an estimate propagated to physical release; null for truth. */
export function predictionSigmaAtS(estimate: TrackEstimate | null, tS: number): number | null {
  if (estimate == null || estimate.source === 'truth') return null;
  return positionSigmaM(predictedStateAt(estimate, tS).cov);
}

/**
 * Intercept solved against the PREDICTED straight-line path of a track
 * estimate: the estimate is propagated to `releaseS`, and the interceptor,
 * flying the slant at constant `flyoutMps` (the average flyout speed, 0 for
 * a beam) from the launcher at `launcherPos`, meets the constant-velocity
 * prediction at the smallest non-negative root of the closed-form quadratic
 * (meetTau). The cap, `capped` and `infeasible` rules match interceptAt, so
 * a caller can swap one result for the other. The estimate stands for the
 * tracked ship; a formation member index does not apply. `predictionSigmaM`
 * is the position 1 sigma of the covariance propagated to the effect time.
 */
export function interceptFromEstimate(
  estimate: TrackEstimate,
  launcherPos: Vec2,
  flyoutMps: number,
  releaseS: number,
  dAltM: number,
  capS = Number.POSITIVE_INFINITY,
  stepS = DT,
): EstimateIntercept {
  const v = flyoutMps;
  const sampleAt = (tEffectS: number) => {
    const p = predictedStateAt(estimate, tEffectS);
    const pos = { x: p.x, y: p.y };
    return {
      pos,
      slantM: slantRangeM(dist(launcherPos, pos), dAltM),
      predictionSigmaM: positionSigmaM(p.cov),
    };
  };
  let tofS: number | null = 0;
  if (v > 0) {
    const at = predictedStateAt(estimate, releaseS);
    const C = { x: at.x - launcherPos.x, y: at.y - launcherPos.y };
    const B = { x: at.vx, y: at.vy };
    tofS = meetTau(C, B, dAltM, v, 0, Number.POSITIVE_INFINITY);
  }
  if (tofS == null) {
    const tEffectS = Number.isFinite(capS) && releaseS <= capS ? capS : releaseS;
    return { ...sampleAt(tEffectS), tEffectS, capped: false, infeasible: true };
  }
  const capped = releaseS <= capS && releaseS + tofS > capS;
  const tEffectS = capped ? capS : releaseS + tofS;
  const at = sampleAt(tEffectS);
  const infeasible = v > 0 && at.slantM > v * (tEffectS - releaseS) + v * stepS;
  return { ...at, tEffectS, capped, infeasible };
}

/** Estimate-path counterpart of the Phase 3 truth-path profile in interceptAt. */
function interceptFromEstimateProfile(
  estimate: TrackEstimate,
  launcherPos: Vec2,
  releaseS: number,
  dAltM: number,
  capS: number,
  stepS: number,
  profile: FlyoutProfile,
): EstimateIntercept {
  const sampleAt = (tEffectS: number) => {
    const p = predictedStateAt(estimate, tEffectS);
    const pos = { x: p.x, y: p.y };
    return {
      pos,
      slantM: slantRangeM(dist(launcherPos, pos), dAltM),
      predictionSigmaM: positionSigmaM(p.cov),
    };
  };
  const flightReleaseS = releaseS + profile.launchDelayS;
  const flightS = profileMeetTau(profile, (tauS) => sampleAt(flightReleaseS + tauS).slantM);
  if (flightS == null) {
    const tEffectS = Number.isFinite(capS) && releaseS <= capS ? capS : releaseS;
    return { ...sampleAt(tEffectS), tEffectS, capped: false, infeasible: true };
  }
  const uncappedEffectS = flightReleaseS + flightS;
  const capped = releaseS <= capS && uncappedEffectS > capS;
  const tEffectS = capped ? capS : uncappedEffectS;
  const at = sampleAt(tEffectS);
  const flownS = Math.max(0, tEffectS - flightReleaseS);
  const unreachable = at.slantM > profile.distanceAt(flownS + stepS) + EPS;
  const seekerLate = seekerAcquisitionAfterEnd(profile, at.slantM, flownS);
  return { ...at, tEffectS, capped, infeasible: unreachable || seekerLate };
}

/**
 * Intercept selector. With no estimate, or a truth-source estimate
 * (`source: 'truth'`, zero covariance), this is interceptAt with the same
 * arguments and the same result, plus `predictionSigmaM: null` and
 * `interceptSource: 'truth'`. With a Kalman estimate it propagates that state
 * against the same legacy or caller-selected flight profile.
 */
export function interceptFor(
  ts: ThreatState,
  es: EffectorState,
  tS: number,
  memberIdx: number,
  membersAt: (ts: ThreatState, tS: number) => Vec2[] = membersAtTime,
  capS = Number.POSITIVE_INFINITY,
  estimate: TrackEstimate | null = null,
  stepS = DT,
  kineticOptions?: KineticInterceptOptions,
): SelectedIntercept {
  if (estimate == null || estimate.source === 'truth') {
    return {
      ...interceptAt(ts, es, tS, memberIdx, membersAt, capS, stepS, kineticOptions),
      predictionSigmaM: null,
      interceptSource: 'truth',
    };
  }
  const releaseS = tS + es.engageTimeS;
  const profile = flyoutProfile(es.spec, kineticOptions);
  const ic =
    profile == null
      ? interceptFromEstimate(
          estimate,
          es.entity.pos,
          averageFlyoutMps(es.spec),
          releaseS,
          ts.altM - es.mountM,
          capS,
          stepS,
        )
      : interceptFromEstimateProfile(
          estimate,
          es.entity.pos,
          releaseS,
          ts.altM - es.mountM,
          capS,
          stepS,
          profile,
        );
  return { ...ic, interceptSource: 'estimate' };
}

/**
 * Launch-point policy test for one candidate shot, evaluated at the effect
 * point. True when the policy volunteers the shot now; the caller still fires
 * at the deadline when this is false. 'latest' never volunteers.
 */
export function launchPolicyReleases(
  doctrine: FireDoctrine,
  pk: number,
  commitPk: number,
  interceptDistM: number,
  maxRangeM: number,
): boolean {
  switch (doctrine.launchPolicy) {
    case 'max-range':
      return true;
    case 'range-fraction':
      return interceptDistM <= doctrine.launchRangeFraction * maxRangeM + EPS;
    case 'pk-commit':
      return pk >= commitPk - EPS;
    case 'latest':
      return false;
    default:
      return true;
  }
}
