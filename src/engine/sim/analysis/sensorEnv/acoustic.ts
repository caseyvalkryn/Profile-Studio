import type { SensorSpec, UasSpec } from '../../model/types';
import { ACOUSTIC_REF_DB, acousticDbFor } from '../../model/signatureFactors';
import { targetScaled } from './common';

/**
 * Acoustic target law: spherical spreading plus atmospheric absorption
 * against the reference source level the spec range is quoted at, so a
 * louder source is heard farther.
 */

/** Atmospheric absorption, dB per km, at 1 kHz on a standard day (planning value). */
export const ALPHA_DB_PER_KM = 5;

/** The source level, dB at 1 m, an acoustic detect range is quoted against: spec value, else the Group 1 tier. */
export function refAcousticDbFor(spec: SensorSpec): number {
  const r = spec.refAcousticDb;
  return r != null && Number.isFinite(r) && r > 0 ? r : ACOUSTIC_REF_DB;
}

/**
 * Range at which a source deltaDb louder than the reference reaches the
 * same received level the reference reached at refRangeM. Solves
 *   20 log10(R / Rref) + ALPHA_DB_PER_KM (R - Rref) / 1000 = deltaDb
 * by bisection on the monotone left side. deltaDb 0 returns Rref exactly.
 * At short range the absorption term is small and +20 dB is about 10x; at
 * long range absorption bends the answer below the spreading-only value.
 */
export function acousticSolveM(refRangeM: number, deltaDb: number): number {
  if (!(refRangeM > 0)) return 0;
  if (deltaDb === 0) return refRangeM;
  const f = (r: number) =>
    20 * Math.log10(r / refRangeM) + (ALPHA_DB_PER_KM * (r - refRangeM)) / 1000 - deltaDb;
  let lo: number;
  let hi: number;
  if (deltaDb > 0) {
    lo = refRangeM;
    hi = refRangeM * 2;
    while (f(hi) < 0) hi *= 2;
  } else {
    lo = refRangeM * 1e-9;
    hi = refRangeM;
  }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Acoustic target term: the solved range over the quoted range. 1 for a planning basis or no target. */
export function acousticRangeFactor(
  spec: SensorSpec,
  quotedM: number,
  target: UasSpec | undefined,
): number {
  if (!target || !targetScaled(spec) || !(quotedM > 0)) return 1;
  return acousticSolveM(quotedM, acousticDbFor(target) - refAcousticDbFor(spec)) / quotedM;
}
