import type { EffectorSpec, UasGroup, UasSpec } from '../../model/types';
import { spanMFor } from '../../model/signatureFactors';
import { MIL_TO_RAD, projectileCount } from '../ballistics';

/**
 * Kinetic kill probability: the type-baseline tables, the distance falloff,
 * the size and evasion penalties and the one per-shot Pk, plus the
 * miss-distance model (interceptor speed profile, miss distance from track
 * error plus guidance noise, Pk from the lethal radius, and the gun terms in
 * ballistics.ts). `kineticPk` is the bit-identical fallback.
 */

/** Type-baseline single-shot Pk for specs saved before the pk field existed. */
export const DEFAULT_PK: Record<EffectorSpec['effectorType'], number> = {
  interceptor: 0.8,
  gun: 0.75,
  net: 0.7,
  de: 0.8,
  hpm: 0.7,
  jammer: 0.6,
};

/** Type-baseline seconds between salvos when the spec does not set one. */
export const DEFAULT_SALVO_COOLDOWN_S: Record<EffectorSpec['effectorType'], number> = {
  interceptor: 30,
  gun: 10,
  net: 60,
  de: 15,
  hpm: 5,
  jammer: 5,
};

/** Smaller airframes are harder to hit (source: Group 1 = 0.7 ... Group 4+ = 1.0). */
export const SIZE_PENALTY: Record<UasGroup, number> = { 1: 0.7, 2: 0.8, 3: 0.9, 4: 1, 5: 1 };

/** Pk multiplier for an evading target (source: x0.7). FPV airframes are
 *  hand-flown and jink; every other airframe flies waypoints. */
export const EVASION_PENALTY = 0.7;

/** Pk fraction lost at max range (PF, source formula: 30%). The falloff is
 *  linear from 1 at the launcher to 1 - FALLOFF_AT_MAX at max range. */
export const FALLOFF_AT_MAX = 0.3;

/** Distance falloff: 30% Pk reduction at max range (source formula). Zero
 *  beyond max range: no envelope means no kill probability at all.
 *  `distM` is the slant range from the launcher to the intercept point. */
export function distanceFalloff(distM: number, maxRangeM: number): number {
  if (maxRangeM <= 0 || distM > maxRangeM) return 0;
  return 1 - FALLOFF_AT_MAX * (distM / maxRangeM);
}

/** Inverse of distanceFalloff on [0, maxRangeM]: the slant range where the
 *  falloff equals `factor`, clamped to the envelope. */
export function falloffRangeM(factor: number, maxRangeM: number): number {
  if (maxRangeM <= 0) return 0;
  const r = (maxRangeM * (1 - factor)) / FALLOFF_AT_MAX;
  return Math.min(maxRangeM, Math.max(0, r));
}

/**
 * The one kinetic per-shot Pk: basePk * distanceFalloff(slantM, maxRangeM) *
 * SIZE_PENALTY[group] * (EVASION_PENALTY for an fpv airframe), clamped to
 * [0, 1]. Pure; the footprint style imports it for the commit ring.
 */
export function kineticPk(
  basePk: number,
  maxRangeM: number,
  uas: UasSpec | undefined,
  slantM: number,
): number {
  const falloff = distanceFalloff(slantM, maxRangeM);
  const size = uas ? SIZE_PENALTY[uas.group] : 1;
  const evasion = uas?.airframe === 'fpv' ? EVASION_PENALTY : 1;
  return Math.min(1, Math.max(0, basePk * falloff * size * evasion));
}

/**
 * Miss-distance 1 sigma, meters: the root sum square of the track prediction
 * error over the flight (`predictionSigmaAtS` from the estimate time) and the
 * effector's own guidance noise. A truth-source track contributes zero
 * prediction error, so its sigma is the guidance term alone.
 */
export function missDistanceSigmaM(
  predictionSigmaM: number | null,
  guidanceNoiseM: number,
): number {
  return Math.hypot(predictionSigmaM ?? 0, guidanceNoiseM);
}

/**
 * Probability that an isotropic two-axis normal miss falls inside `radiusM`.
 * Its radial miss is Rayleigh with CDF 1 - exp(-r^2 / (2 sigma^2)). A zero
 * sigma is a point mass at zero. NIST describes the Rayleigh density and its
 * two-normal construction (read 2026-09-10):
 * https://www.itl.nist.gov/div898/software/dataplot/refman2/auxillar/raypdf.htm
 */
export function rayleighProbabilityWithin(radiusM: number, sigmaM: number): number {
  if (!Number.isFinite(radiusM) || !(radiusM > 0)) return 0;
  if (!Number.isFinite(sigmaM) || sigmaM < 0) return 0;
  if (sigmaM === 0) return 1;
  return -Math.expm1(-(radiusM * radiusM) / (2 * sigmaM * sigmaM));
}

/** The two angular gun errors projected to range and combined with track error. */
export function projectileMissSigmaM(
  slantM: number,
  dispersionMils: number,
  fireControlErrorMils: number,
  predictionSigmaM: number | null,
): number {
  const angularSigmaM =
    Math.max(0, slantM) *
    Math.hypot(dispersionMils * MIL_TO_RAD, fireControlErrorMils * MIL_TO_RAD);
  return Math.hypot(angularSigmaM, predictionSigmaM ?? 0);
}

/** Inputs the shared shot caller owns at the existing commit decision point. */
export interface KineticEffectContext {
  /** Resolved legacy `pk` value (`EffectorState.pk`, including its type default). */
  basePk: number;
  uas: UasSpec | undefined;
  slantM: number;
  /** Track prediction error over the flight, null for a truth-source track. */
  predictionSigmaM: number | null;
  /** True for the scenario's `legacyKineticPk` switch. */
  fallback: boolean;
}

function validPositive(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function validNonNegative(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

/** Interceptor fields guaranteed when the physical miss model applies. */
export type PhysicalInterceptorSpec = EffectorSpec & {
  effectorType: 'interceptor';
  lethalRadiusM: number;
  guidanceNoiseM: number;
  flyoutSpeedMps: number;
};

/** True when the physical interceptor miss model is enabled and fully specified. */
export function interceptorMissModelApplies(
  spec: EffectorSpec,
  disabled = false,
): spec is PhysicalInterceptorSpec {
  return (
    !disabled &&
    spec.effectorType === 'interceptor' &&
    validPositive(spec.lethalRadiusM) &&
    validNonNegative(spec.guidanceNoiseM) &&
    validPositive(spec.flyoutSpeedMps)
  );
}

/** Gun fields guaranteed when the burst model applies. */
export type BurstGunSpec = EffectorSpec & {
  effectorType: 'gun';
  dispersionMils: number;
  fireControlErrorMils: number;
  rateOfFireRpm: number;
  muzzleVelocityMps: number;
};

/** True when the gun burst model is enabled and fully specified. */
export function gunBurstModelApplies(spec: EffectorSpec, disabled = false): spec is BurstGunSpec {
  return (
    !disabled &&
    spec.effectorType === 'gun' &&
    validNonNegative(spec.dispersionMils) &&
    validNonNegative(spec.fireControlErrorMils) &&
    projectileCount(spec) != null &&
    validPositive(spec.rateOfFireRpm) &&
    validPositive(spec.muzzleVelocityMps)
  );
}

/**
 * Modeled probability of effect for an interceptor or projectile effector.
 *
 * Interceptor: Rayleigh CDF at the lethal radius, multiplied by the saved
 * base Pk as P(effect | lethal-radius intercept) and by the FPV evasion term.
 * The old size factor and distance falloff are omitted because lethal radius
 * and the combined miss sigma now carry geometry and range. The evasion term
 * remains because this miss model has no maneuver-error term of its own.
 * No positive `flyoutSpeedMps` returns `kineticPk`: the flight profile has
 * no cruise then, and this miss model does not score a zero-flight round.
 *
 * Gun: each projectile uses a Rayleigh CDF at half `spanMFor(uas)`, and n
 * independent projectiles combine as 1 - (1 - P(intercept))^n. The burst
 * equation replaces the legacy base, size, distance and evasion factors; its
 * fire-control error is the residual aiming term for the whole burst.
 *
 * The caller supplies the switch state. A switched run, an inapplicable type,
 * or a kinetic model missing any required field returns `kineticPk` exactly.
 */
export function kineticEffectProbability(
  spec: EffectorSpec,
  context: KineticEffectContext,
): number {
  const legacy = kineticPk(context.basePk, spec.maxRangeM, context.uas, context.slantM);

  if (spec.effectorType === 'interceptor') {
    if (!interceptorMissModelApplies(spec, context.fallback)) return legacy;
    const sigmaM = missDistanceSigmaM(context.predictionSigmaM, spec.guidanceNoiseM);
    const intercept = rayleighProbabilityWithin(spec.lethalRadiusM, sigmaM);
    const effectGivenIntercept = Math.min(1, Math.max(0, context.basePk));
    const evasion = context.uas?.airframe === 'fpv' ? EVASION_PENALTY : 1;
    return Math.min(1, Math.max(0, intercept * effectGivenIntercept * evasion));
  }

  if (context.fallback) return legacy;

  if (spec.effectorType === 'gun') {
    if (!gunBurstModelApplies(spec) || context.uas == null) return legacy;
    const rounds = projectileCount(spec);
    // The gate proved the count; this guard only narrows the type.
    if (rounds == null) return legacy;
    const sigmaM = projectileMissSigmaM(
      context.slantM,
      spec.dispersionMils,
      spec.fireControlErrorMils,
      context.predictionSigmaM,
    );
    const perProjectile = rayleighProbabilityWithin(spanMFor(context.uas) / 2, sigmaM);
    return Math.min(1, Math.max(0, -Math.expm1(rounds * Math.log1p(-perProjectile))));
  }

  return legacy;
}

/**
 * Kill-shot Pk penalty against a ship inbound under a 'continue' jam: the
 * denied GNSS/RF link silences emissions and degrades the track, so the
 * firing solution suffers. Planning factor on the source's 30% falloff scale.
 */
export const CONTINUE_TRACK_DEGRADE = 0.3;

/**
 * Expected-survival cutoff (shoot-look doctrine). A ship whose effective
 * survival — alive discounted by kill salvos already in flight at it — falls
 * below this is expected dead: no kill or jam salvo targets it again, and a
 * threat with every ship below the cutoff draws no further fire. The same
 * threshold caps 'continue' jamming: once a ship's un-jammed probability
 * (discounted by jam salvos in flight) falls below it, the track is
 * saturated and jam salvos stop.
 */
export const SHIP_DEAD_BELOW = 0.05;

/** Effector types whose success destroys the airframe (vs a jammer soft kill). */
export function isHardKill(effectorType: EffectorSpec['effectorType']): boolean {
  return effectorType !== 'jammer';
}
