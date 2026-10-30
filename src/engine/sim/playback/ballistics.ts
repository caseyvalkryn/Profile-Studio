import type { EffectorSpec } from '../model/types';

/** Milliradians per mil for the angular fields in the Phase 3 data package. */
export const MIL_TO_RAD = 1e-3;

/**
 * Number of projectiles represented by one gun event. Total-uncertainty
 * sampling can make a count non-integral, so the physical count is rounded
 * and bounded at one.
 */
export function projectileCount(spec: EffectorSpec): number | null {
  const rounds = spec.burstRounds;
  if (rounds == null || !Number.isFinite(rounds) || !(rounds > 0)) return null;
  return Math.max(1, Math.round(rounds));
}

/** Seconds between projectiles at a cyclic rate in rounds per minute. */
export function projectileSpacingS(rateOfFireRpm: number): number | null {
  if (!Number.isFinite(rateOfFireRpm) || !(rateOfFireRpm > 0)) return null;
  return 60 / rateOfFireRpm;
}

/**
 * Burst duration, seconds. A burst of n projectiles occupies n cyclic slots:
 * the first projectile leaves after one slot and the last at `n * spacing`.
 */
export function projectileBurstDurationS(spec: EffectorSpec): number | null {
  const rounds = projectileCount(spec);
  const spacingS = spec.rateOfFireRpm == null ? null : projectileSpacingS(spec.rateOfFireRpm);
  return rounds == null || spacingS == null ? null : rounds * spacingS;
}

/**
 * Drag-free projectile time of flight, seconds: t = range / muzzle velocity.
 * NASA's ballistic-flight equations give constant horizontal velocity when
 * aerodynamic drag is ignored. This first-order model uses slant distance so
 * gravity and fire-control elevation remain outside this lane's data contract.
 * Source (read 2026-09-10):
 * https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ballistic-flight-equations/
 */
export function projectileFlightTimeS(slantM: number, muzzleVelocityMps: number): number | null {
  if (!Number.isFinite(slantM) || slantM < 0) return null;
  if (!Number.isFinite(muzzleVelocityMps) || !(muzzleVelocityMps > 0)) return null;
  return slantM / muzzleVelocityMps;
}

/** Effect time of the last projectile in one burst against a stationary point. */
export function lastProjectileEffectS(
  commitS: number,
  slantM: number,
  spec: EffectorSpec,
): number | null {
  const burstS = projectileBurstDurationS(spec);
  const tofS =
    spec.muzzleVelocityMps == null ? null : projectileFlightTimeS(slantM, spec.muzzleVelocityMps);
  return burstS == null || tofS == null ? null : commitS + burstS + tofS;
}
