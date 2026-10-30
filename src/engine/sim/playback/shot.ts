import type { EnvironmentSpec, Vec2 } from '../model/types';
import { angleDiffDeg, bearingDeg, dist, pointInWedge } from '../geometry/geo';
import { slantRangeM } from '../geometry/slant';
import { assessJam, effectiveJamRangeM } from '../analysis/ewPhysics';
import { effectorGeometryGate } from '../analysis/sensorEnv';
import { kineticEffectProbability } from './pk/kinetic';
import { beamEffect, type BeamEffect } from './pk/beam';
import type { EffectorState, ThreatState } from './sweepState';
import type { InterceptSource } from './intercept';
import { DT } from './clock';
import { EPS, interceptAt, interceptFor, membersAtTime, predictionSigmaAtS } from './intercept';
import type { TrackEstimate } from './trackTypes';

/**
 * Shot eligibility for one (effector, threat, ship) at one assignment time.
 * Owns the checks both firing passes in resolveEngagements share: the
 * in-range interval containing t, the predicted intercept (interceptAt), the
 * unreachable rule, effect-time containment, the launcher envelope at the
 * effect point and the jam link. Ranking, saturation, readiness, magazine and
 * BDA stay with the caller.
 */

/** Why a shot was declined, in the order the checks run. */
export type ShotRejection =
  /** The effector has no in-range window against this threat. */
  | 'no-window'
  /** No in-range interval of this effector contains t. */
  | 'outside-interval'
  /** The interceptor cannot reach the credited point (interceptAt.infeasible). */
  | 'unreachable'
  /** The effect time falls outside the in-range window (see `effectContainment`). */
  | 'effect-outside-window'
  /** Ceiling, slant range or sector excludes the effect point. */
  | 'outside-envelope'
  /** Jam physics reach a factor of 0 at the effect point. */
  | 'no-jam-link'
  /** The optical dwell solve found no converged effect time inside the window (see `solveBeamTiming`). */
  | 'no-dwell-solution';

export type ShotIntercept = ReturnType<typeof interceptAt>;

export interface ShotAccepted {
  rejected?: undefined;
  intercept: ShotIntercept;
  /** The in-range interval containing t (the flight cap source). */
  interval: [number, number];
  /**
   * Per-shot probability of effect at the effect point; a jammer uses base
   * Pk times the link factor (clamped to [0, 1]).
   */
  pk: number;
  /**
   * Predicted position 1 sigma at the intercept time, meters, when the
   * intercept was solved from a track estimate; null on the truth path.
   * The kinetic Pk does not read this field. It uses the flight-horizon sigma.
   */
  predictionSigmaM: number | null;
  /** Which path solved the intercept point (interceptFor). */
  interceptSource: InterceptSource;
  /** Assignment-to-physical-release delay. */
  releaseDelayS: number;
  /** Optical energy-on-target dwell; zero for every other effector. */
  dwellS: number;
  /** Seconds before this effector may commit another salvo. */
  cooldownS: number;
}

export interface ShotRejected {
  rejected: ShotRejection;
}

export interface ShotContext {
  /** Assignment time, seconds. */
  t: number;
  /**
   * Which in-range intervals may contain the effect time. 'any': every
   * interval of this effector (the volley pass). 'same': only the interval
   * containing t (the doctrine assignment pass, whose deadline is that
   * interval's end).
   */
  effectContainment: 'any' | 'same';
  /** The sweep's base step, seconds (clock.ts); the intercept slack is one step. Defaults to DT. */
  stepS?: number;
  /** Per-tick geometry cache; defaults to a fresh sample. */
  membersAt?: (ts: ThreatState, tS: number) => Vec2[];
  /**
   * The track estimate the shooter holds on this ship at t. Absent, null or
   * a truth-source estimate keeps the truth-path intercept (interceptAt); a
   * Kalman estimate solves the intercept against its predicted path.
   */
  estimate?: TrackEstimate | null;
  /** True for the scenario's Phase 3 kinetic fallback switch. */
  legacyKineticPk?: boolean;
  /** True for the scenario's Phase 3 beam fallback switch. */
  legacyBeamPk?: boolean;
  /** Scenario atmosphere used by the optical propagation model. */
  environment?: EnvironmentSpec;
  /** One independently-keyed event uniform for optical fluence. */
  beamFluenceDraw?: (effectorId: string, uasId: string, shipIdx: number, tS: number) => number;
}

/**
 * Per-ship envelope test on slant range from the launcher at the effect
 * point. A jammer's reach is its effective range against this target (as
 * the sim window and the drawn cone use); its cone test takes no ceiling.
 */
function inEnvelope(es: EffectorState, ts: ThreatState, p: Vec2): boolean {
  const isJammer = es.spec.effectorType === 'jammer';
  if (!isJammer && effectorGeometryGate(es.spec, ts.altM) !== 'ok') return false;
  const slant = slantRangeM(dist(es.entity.pos, p), ts.altM - es.mountM);
  return (
    slant >= es.spec.minRangeM &&
    slant <= (isJammer ? effectiveJamRangeM(es.spec, ts.uasSpec) : es.spec.maxRangeM) &&
    pointInWedge(es.entity.pos, es.entity.headingDeg, es.spec.sectorDeg ?? 360, p)
  );
}

/** Convergence tolerance of the optical dwell solve on the effect delay, seconds. */
const DWELL_TOL_S = 1e-6;
/** Fixed-point iterations tried before the bracketing solve. */
const DWELL_FIXED_POINT_STEPS = 12;
/** Coarse cells scanned for a sign change of the delay residual over the window. */
const DWELL_SCAN_CELLS = 32;
/** Bisection steps on a bracketed residual (well past 1e-9 s over any window). */
const DWELL_BISECTIONS = 64;

const NO_ENVIRONMENT: EnvironmentSpec = {
  apply: false,
  light: 'day',
  precipitation: 'clear',
  windSpeedMps: 0,
  windFromDeg: 0,
  temperatureC: 15,
  fieldElevationFt: 0,
  visibilityM: null,
  emBackground: 'rural',
};

/** One beam evaluation and the intercept at the delay it asks for. */
interface BeamTiming {
  beam: BeamEffect;
  selected: ReturnType<typeof interceptFor>;
}

/**
 * Beam effect timing. The dwell depends on slant range while the target
 * moves, so the effect delay d must satisfy d = f(d), where f samples the
 * target at t + d and returns the beam model's own delay there. The fixed
 * point d <- f(d) converges when f contracts (a stationary or slow target,
 * or the constant-delay legacy and HPM laws); its stop test |f(d) - d| <
 * DWELL_TOL_S is the residual at d. A closing target under poor visibility
 * makes |f'| > 1 and the iterates oscillate, so the fallback brackets the
 * residual d - f(d) on [0, window end - t] and bisects. Null when no
 * bracket exists or the candidate fails the residual check: the shot
 * has no physical effect time inside the window and is declined. The one
 * commit-keyed fluence draw is reused throughout.
 */
function solveBeamTiming(
  ctx: ShotContext,
  es: EffectorState,
  ts: ThreatState,
  shipIdx: number,
  intervals: Array<[number, number]>,
  interval: [number, number],
  first: ReturnType<typeof interceptFor>,
): BeamTiming | null {
  const { t } = ctx;
  const fluenceDraw = ctx.beamFluenceDraw?.(es.entity.id, ts.a.uasId, shipIdx, t);
  const environment = ctx.environment ?? NO_ENVIRONMENT;
  const atDelay = (delayS: number) =>
    interceptFor(
      ts,
      { ...es, engageTimeS: delayS },
      t,
      shipIdx,
      ctx.membersAt ?? membersAtTime,
      interval[1],
      ctx.estimate ?? null,
      ctx.stepS ?? DT,
      { fallback: true },
    );
  const beamAt = (at: ReturnType<typeof interceptFor>): BeamEffect => {
    const offBoresightDeg = Math.abs(
      angleDiffDeg(es.entity.headingDeg, bearingDeg(es.entity.pos, at.pos)),
    );
    return beamEffect(es.pk, es.spec, ts.uasSpec, at.slantM, environment, {
      fallback: ctx.legacyBeamPk ?? true,
      offBoresightDeg,
      fluenceDraw,
      legacyCooldownS: es.cooldownS,
    });
  };
  // The beam at one intercept, then the intercept at that beam's delay.
  const step = (at: ReturnType<typeof interceptFor>): BeamTiming => {
    const beam = beamAt(at);
    return { beam, selected: atDelay(beam.effectDelayS) };
  };

  let at = first;
  for (let i = 0; i < DWELL_FIXED_POINT_STEPS; i += 1) {
    const next = step(at);
    if (Math.abs(next.selected.tEffectS - at.tEffectS) < DWELL_TOL_S) return next;
    at = next.selected;
  }

  // Bracketing fallback. The residual is negative at d = 0 (the delay is at
  // least the settle); the first cell where it turns non-negative holds the
  // earliest root, the effect time the accumulating fluence reaches first.
  const endS =
    ctx.effectContainment === 'same'
      ? interval[1]
      : intervals.reduce((acc, [, s1]) => Math.max(acc, s1), interval[1]);
  const spanS = endS - t;
  if (!(spanS > 0) || !Number.isFinite(spanS)) return null;
  const residual = (delayS: number) => delayS - beamAt(atDelay(delayS)).effectDelayS;
  let lo = 0;
  let hi = Number.NaN;
  if (residual(lo) >= 0) return null;
  for (let k = 1; k <= DWELL_SCAN_CELLS; k += 1) {
    const d = (spanS * k) / DWELL_SCAN_CELLS;
    if (residual(d) >= 0) {
      hi = d;
      break;
    }
    lo = d;
  }
  if (!Number.isFinite(hi)) return null;
  for (let i = 0; i < DWELL_BISECTIONS && hi - lo > 1e-9; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (residual(mid) >= 0) hi = mid;
    else lo = mid;
  }
  const candidate = step(atDelay(hi));
  // The residual check: the beam's own delay at the candidate range must
  // reproduce the candidate delay. Reject otherwise; never credit an
  // unconverged point.
  if (Math.abs(candidate.beam.effectDelayS - hi) >= DWELL_TOL_S) return null;
  return candidate;
}

/** Evaluate one candidate shot; see the module header. */
export function evaluateShot(
  ctx: ShotContext,
  es: EffectorState,
  ts: ThreatState,
  shipIdx: number,
): ShotAccepted | ShotRejected {
  const { t } = ctx;
  const intervals = ts.windows.get(es.entity.id);
  if (!intervals) return { rejected: 'no-window' };
  const interval = intervals.find(([s0, s1]) => t >= s0 - EPS && t <= s1 + EPS);
  if (!interval) return { rejected: 'outside-interval' };

  const selected = interceptFor(
    ts,
    es,
    t,
    shipIdx,
    ctx.membersAt ?? membersAtTime,
    interval[1],
    ctx.estimate ?? null,
    ctx.stepS ?? DT,
    { fallback: ctx.legacyKineticPk ?? true },
  );
  let { predictionSigmaM, interceptSource, ...intercept } = selected;
  if (intercept.infeasible) return { rejected: 'unreachable' };

  let beam: BeamEffect | null = null;
  if (es.spec.effectorType === 'de' || es.spec.effectorType === 'hpm') {
    const solved = solveBeamTiming(ctx, es, ts, shipIdx, intervals, interval, selected);
    if (solved == null) return { rejected: 'no-dwell-solution' };
    beam = solved.beam;
    ({ predictionSigmaM, interceptSource, ...intercept } = solved.selected);
    if (intercept.infeasible) return { rejected: 'unreachable' };
  }

  const tEffect = intercept.tEffectS;
  const holds =
    ctx.effectContainment === 'same'
      ? tEffect >= interval[0] - EPS && tEffect <= interval[1] + EPS
      : intervals.some(([s0, s1]) => tEffect >= s0 - EPS && tEffect <= s1 + EPS);
  if (!holds) return { rejected: 'effect-outside-window' };

  if (!inEnvelope(es, ts, intercept.pos)) return { rejected: 'outside-envelope' };

  if (es.spec.effectorType === 'jammer') {
    // Jam Pk is link physics, not aiming: no kinetic penalties apply.
    const factor = assessJam(
      es.spec,
      es.entity.pos,
      es.entity.headingDeg,
      ts.uasSpec,
      intercept.pos,
      ts.altM - es.mountM,
    ).factor;
    if (factor <= 0) return { rejected: 'no-jam-link' };
    return {
      intercept,
      interval,
      pk: Math.min(1, Math.max(0, es.pk * factor)),
      predictionSigmaM,
      interceptSource,
      releaseDelayS: es.engageTimeS,
      dwellS: 0,
      cooldownS: es.cooldownS,
    };
  }
  if (beam) {
    return {
      intercept,
      interval,
      pk: beam.pk,
      predictionSigmaM,
      interceptSource,
      releaseDelayS: Math.max(0, beam.effectDelayS - beam.dwellS),
      dwellS: beam.dwellS,
      cooldownS: beam.cooldownS,
    };
  }
  // engageTimeS is assignment-to-release. The tracker keeps updating through
  // it, so the miss grows only over the flight, from the estimate time.
  const est = ctx.estimate ?? null;
  const flightS = Math.max(0, intercept.tEffectS - (t + es.engageTimeS));
  const launchPredictionSigmaM =
    est == null ? null : predictionSigmaAtS(est, est.state.tS + flightS);
  return {
    intercept,
    interval,
    pk: kineticEffectProbability(es.spec, {
      basePk: es.pk,
      uas: ts.uasSpec,
      slantM: intercept.slantM,
      predictionSigmaM: launchPredictionSigmaM,
      fallback: ctx.legacyKineticPk ?? true,
    }),
    predictionSigmaM,
    interceptSource,
    releaseDelayS: es.engageTimeS,
    dwellS: 0,
    cooldownS: es.cooldownS,
  };
}
