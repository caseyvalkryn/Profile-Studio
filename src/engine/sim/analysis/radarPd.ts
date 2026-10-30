/**
 * Radar probability of detection at range, calibrated at the placard.
 *
 * The placard range r0 is one point on a Pd-versus-SNR curve: at r0 the
 * reference target returns the SNR that gives pd0 at pfa for the reference
 * fluctuation case. That SNR is per pulse when a pulse count is present and
 * single-pulse otherwise. The radar range equation carries it to any other
 * target and range, and the target's own fluctuation case turns it back into
 * an integrated single-scan Pd.
 *
 * Sources: Mahafza, Radar Systems Analysis and Design Using MATLAB, 3rd ed.,
 * CRC Press 2013, section 13.5 (Swerling I Eq. 13.45, Swerling III
 * Eq. 13.51); Richards, Fundamentals of Radar Signal Processing, chapter 6,
 * for the nonfluctuating Marcum Q.
 */
import type { SwerlingCase } from '../model/types';
import { shnidmanPdFromSnr, shnidmanSnrForPd } from '../playback/radarDwell';

/** The placard as one point on the Pd curve. r0M is the placard SLANT range. */
export interface RadarCalibration {
  /** Placard detect range against the reference target, meters. */
  r0M: number;
  /** Reference target RCS the placard is quoted against, m2. */
  rcs0M2: number;
  /** Pd the placard is quoted at. */
  pd0: number;
  /** False-alarm probability the placard assumes. */
  pfa: number;
  /** Fluctuation case of the reference target. */
  swerling0: SwerlingCase;
  /** Noncoherently integrated pulses per dwell; null keeps the exact legacy single-pulse path. */
  pulsesPerDwell?: number | null;
}

/**
 * Marcum Q1(a, b) = P(chi'^2 with 2 dof and noncentrality a^2 exceeds b^2)
 *   = sum_j Poisson(j; a^2 / 2) * P(chi^2 with 2 + 2j dof exceeds b^2),
 * with P(chi^2_{2m} > 2y) = exp(-y) * sum_{i < m} y^i / i!. The Poisson
 * weights are summed over mean +- (12 sqrt(mean) + 40), which holds every
 * weight above 1e-15. a - b above 12 returns 1; at a = 0 the sum is
 * exp(-y) = Pfa exactly. Absolute error under 1e-12.
 */
function marcumQ1(a: number, b: number): number {
  if (!(b > 0)) return 1;
  if (a - b > 12) return 1;
  const lambda = (a * a) / 2;
  const y = (b * b) / 2;
  if (lambda === 0) return Math.exp(-y);
  const half = 12 * Math.sqrt(lambda) + 40;
  const j0 = Math.max(0, Math.floor(lambda - half));
  const j1 = Math.ceil(lambda + half);
  // log Poisson(j0; lambda) and log of the chi-square term exp(-y) y^j0 / j0!.
  let logPois = -lambda + j0 * Math.log(lambda) - lgamma(j0 + 1);
  let logTerm = -y + j0 * Math.log(y) - lgamma(j0 + 1);
  // Tail P(chi^2_{2(j0+1)} > 2y) = exp(-y) sum_{i <= j0} y^i / i!.
  let tail = 0;
  for (let i = 0; i <= j0; i++) tail += Math.exp(-y + i * Math.log(y) - lgamma(i + 1));
  tail = Math.min(1, tail);
  let q = 0;
  for (let j = j0; j <= j1; j++) {
    q += Math.exp(logPois) * tail;
    // Advance to j + 1.
    logPois += Math.log(lambda) - Math.log(j + 1);
    logTerm += Math.log(y) - Math.log(j + 1);
    tail = Math.min(1, tail + Math.exp(logTerm));
  }
  return Math.min(1, Math.max(0, q));
}

/** log Gamma by Lanczos (g = 7, n = 9); relative error under 1e-15 for x > 0. */
function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const z = x - 1;
  let a = c[0]!;
  const t = z + g + 0.5;
  for (let i = 1; i < 9; i++) a += c[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a!);
}

/** Pfa clamped strictly inside (0, 1) so every log and power below stays finite. */
function pfaSafe(pfa: number): number {
  if (!Number.isFinite(pfa)) return 1e-6;
  return Math.min(Math.max(pfa, 1e-300), 1 - 1e-15);
}

/**
 * Single-scan Pd for a given SNR (linear), Pfa and Swerling case.
 *
 * Swerling 1 (Mahafza Eq. 13.45, np = 1): Pd = Pfa ^ (1 / (1 + SNR)).
 * Swerling 3 (Mahafza Eq. 13.51, np = 1, vT = -ln Pfa):
 *   Pd = exp(-vT / (1 + SNR/2)) * (1 + vT / (1 + SNR/2) + 2/SNR) / (1 + 2/SNR),
 *   written here as (SNR * (1 + vT/d) + 2) / (SNR + 2) so SNR = 0 gives Pfa
 *   with no division by zero.
 * Swerling 0 (nonfluctuating): the exact single-pulse Marcum Q,
 *   Pd = Q1(sqrt(2 SNR), sqrt(-2 ln Pfa)); at SNR 0 it is Pfa.
 *
 * A negative or non-finite SNR reads as 0; an infinite SNR returns 1.
 */
export function pdFromSnr(snr: number, pfa: number, swerling: SwerlingCase): number {
  if (snr === Infinity) return 1;
  const s = Number.isFinite(snr) && snr > 0 ? snr : 0;
  const q = pfaSafe(pfa);
  if (swerling === 1) return Math.pow(q, 1 / (1 + s));
  if (swerling === 3) {
    const vt = -Math.log(q);
    const d = 1 + s / 2;
    return (Math.exp(-vt / d) * (s * (1 + vt / d) + 2)) / (s + 2);
  }
  return marcumQ1(Math.sqrt(2 * s), Math.sqrt(-2 * Math.log(q)));
}

/**
 * SNR (linear) that yields `pd` at `pfa` for the case. Monotone inverse of
 * pdFromSnr: Swerling 1 inverts its closed form, Swerling 0 and 3 bisect
 * pdFromSnr, which is monotone in SNR.
 *
 * pd >= 1 returns Infinity (no finite SNR reaches certainty). pd <= 0, or a
 * pd at or below the case's zero-SNR floor (Pfa for every case), returns 0.
 */
export function snrForPd(pd: number, pfa: number, swerling: SwerlingCase): number {
  if (!(pd > 0)) return 0;
  if (pd >= 1) return Infinity;
  const q = pfaSafe(pfa);
  if (swerling === 1) return Math.max(0, Math.log(q) / Math.log(pd) - 1);
  if (pd <= q) return 0;
  let lo = 0;
  let hi = 1;
  while (pdFromSnr(hi, q, swerling) < pd) {
    lo = hi;
    hi *= 2;
    if (hi === Infinity) return Infinity;
  }
  // 200 halvings take the bracket below double precision at any scale.
  for (let i = 0; i < 200 && lo < hi; i++) {
    const mid = (lo + hi) / 2;
    if (mid <= lo || mid >= hi) break;
    if (pdFromSnr(mid, q, swerling) < pd) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Required per-pulse SNR for one Pd under this calibration's dwell model. */
function snrForCalibratedPd(cal: RadarCalibration, pd: number, swerling: SwerlingCase): number {
  const pulses = cal.pulsesPerDwell;
  return pulses != null
    ? shnidmanSnrForPd(pd, cal.pfa, pulses, swerling)
    : snrForPd(pd, cal.pfa, swerling);
}

/** Pd from one per-pulse SNR under this calibration's dwell model. */
function pdFromCalibratedSnr(cal: RadarCalibration, snr: number, swerling: SwerlingCase): number {
  const pulses = cal.pulsesPerDwell;
  return pulses != null
    ? shnidmanPdFromSnr(snr, cal.pfa, pulses, swerling)
    : pdFromSnr(snr, cal.pfa, swerling);
}

/** Per-pulse SNR the reference target returns at the placard range. */
function snr0Of(cal: RadarCalibration): number {
  return snrForCalibratedPd(cal, cal.pd0, cal.swerling0);
}

/**
 * Calibrated mean per-pulse SNR at range R:
 * snr0 * (rcs / rcs0) * (r0 / R)^4 * envRangeFactor^4, where snr0 is the
 * calibrated requirement for pd0 and r0 is the placard slant range (radar
 * range equation, Mahafza chapter 1). The environment multiplier is a range
 * factor, so it enters the SNR as the fourth power.
 *
 * rangeM <= 0 returns Infinity (the target sits on the antenna). r0M <= 0
 * returns 0 (a placard of zero range sees nothing). rcs0M2 <= 0 reads as
 * equal to rcsM2.
 */
export function snrAtRange(
  cal: RadarCalibration,
  rcsM2: number,
  rangeM: number,
  envRangeFactor: number,
): number {
  if (!(cal.r0M > 0)) return 0;
  if (!(rangeM > 0)) return Infinity;
  const rcsRatio = cal.rcs0M2 > 0 && rcsM2 > 0 ? rcsM2 / cal.rcs0M2 : 1;
  const m = envRangeFactor > 0 ? envRangeFactor : 0;
  const rangeRatio = (cal.r0M * m) / rangeM;
  return snr0Of(cal) * rcsRatio * Math.pow(rangeRatio, 4);
}

/** Integrated single-scan Pd for a target of `rcsM2` and case `swerling` at `rangeM`. */
export function pdAtRange(
  cal: RadarCalibration,
  rcsM2: number,
  rangeM: number,
  envRangeFactor: number,
  swerling: SwerlingCase,
): number {
  const snr = snrAtRange(cal, rcsM2, rangeM, envRangeFactor);
  // Keep the calibration anchor exact so a deterministic Pd threshold at
  // the placard cannot move by numerical inversion error.
  if (swerling === cal.swerling0 && snr === snr0Of(cal)) return cal.pd0;
  return pdFromCalibratedSnr(cal, snr, swerling);
}

/**
 * Largest range at which pdAtRange >= pd, meters. Closed form from the
 * fourth-root law: R = r0 * m * ((rcs / rcs0) * (snr0 / requiredSnr(pd))) ^ (1/4).
 *
 * pd >= 1 returns 0. pd <= 0, or a pd the case reaches at zero SNR, returns
 * Infinity, so a caller that draws must clamp. Never NaN for finite inputs.
 */
export function rangeForPd(
  cal: RadarCalibration,
  rcsM2: number,
  pd: number,
  envRangeFactor: number,
  swerling: SwerlingCase,
): number {
  if (pd >= 1) return 0;
  if (!(pd > 0)) return Infinity;
  if (!(cal.r0M > 0)) return 0;
  const need = snrForCalibratedPd(cal, pd, swerling);
  if (need === Infinity) return 0;
  if (!(need > 0)) return Infinity;
  const rcsRatio = cal.rcs0M2 > 0 && rcsM2 > 0 ? rcsM2 / cal.rcs0M2 : 1;
  const m = envRangeFactor > 0 ? envRangeFactor : 0;
  return cal.r0M * m * Math.pow(rcsRatio * (snr0Of(cal) / need), 0.25);
}

/**
 * Probability that at least m of n independent scans with Pd `p` detect:
 * the upper tail of the binomial. m <= 0 returns 1, m > n returns 0, p is
 * clamped to [0, 1].
 */
export function mOfN(p: number, m: number, n: number): number {
  if (m <= 0) return 1;
  if (m > n || !(n > 0)) return 0;
  const q = Number.isFinite(p) ? Math.min(Math.max(p, 0), 1) : 0;
  let sum = 0;
  let coef = 1;
  for (let k = 0; k <= n; k++) {
    if (k >= m) sum += coef * Math.pow(q, k) * Math.pow(1 - q, n - k);
    // Walk the binomial coefficient C(n, k) -> C(n, k + 1).
    coef = (coef * (n - k)) / (k + 1);
  }
  return Math.min(1, sum);
}
