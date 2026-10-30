/**
 * Noncoherent radar pulse integration for one dwell.
 *
 * Shnidman's approximation gives the required mean SNR per pulse for a
 * requested Pd, Pfa, number of square-law integrated pulses and Swerling
 * case. The forward Pd below is its monotone numerical inverse.
 *
 * Sources:
 * - D. A. Shnidman, "Determination of Required SNR Values," IEEE
 *   Transactions on Aerospace and Electronic Systems 38(3), 2002,
 *   pp. 1059-1064, doi:10.1109/TAES.2002.1039422.
 * - NASA/Aerospace ATR-2023-01267, Appendix B, pp. 42-43, reproduces the
 *   equations and identifies N as the number of noncoherently integrated
 *   pulses: nasa.gov/wp-content/uploads/2023/10/atr-2023-01267.pdf.
 *
 * The published accuracy statement is within 1 dB, and mostly within
 * 0.5 dB, over the stated domain Pd 0.1-0.99, Pfa 1e-9-1e-3 and N 1-100.
 */
import type { SensorSpec, SwerlingCase } from '../model/types';

/** Planning PRF when a radar publishes dwell time but no pulse count. */
export const RADAR_DWELL_PRF_HZ = 5_000;

/** The tighter error bound Shnidman reports for most of the stated domain. */
export const SHNIDMAN_TYPICAL_ERROR_DB = 0.5;

/** Repeated Monte Carlo replicates revisit the same radar, range and SNR grid. */
const PD_CACHE_LIMIT = 262_144;
const PD_CACHE_KEY_LIMIT = 16;
const PD_CACHE = new Map<string, Map<number, number>>();

/**
 * Pulse count for one dwell. A stated positive count wins. Otherwise a
 * positive dwell is converted at 5 kHz and rounded to the nearest pulse.
 *
 * The 5 kHz planning PRF is the measured Radar-beta value in Gong et al.,
 * "Detection of Micro-Doppler Signals of Drones Using Radar Systems with
 * Different Radar Dwell Times," Drones 6(9):262, 2022, Table 2
 * (doi:10.3390/drones6090262): 20 ms CPI at 5 kHz, or 100 pulses.
 */
export function radarDwellPulses(spec: SensorSpec): number | null {
  const stated = spec.pulsesPerDwell;
  if (stated != null && Number.isFinite(stated) && stated > 0) {
    return Math.max(1, Math.round(stated));
  }
  const dwellS = spec.dwellTimeS;
  if (dwellS != null && Number.isFinite(dwellS) && dwellS > 0) {
    return Math.max(1, Math.round(dwellS * RADAR_DWELL_PRF_HZ));
  }
  return null;
}

/** Probability clamped strictly inside (0, 1), matching the radar Pd path. */
function probabilitySafe(p: number, fallback: number): number {
  const finite = Number.isFinite(p) ? p : fallback;
  return Math.min(Math.max(finite, 1e-300), 1 - 1e-15);
}

/** A physical dwell integrates at least one whole pulse. */
function pulseCountSafe(pulses: number): number {
  return Number.isFinite(pulses) && pulses > 0 ? Math.max(1, Math.round(pulses)) : 1;
}

/** Shnidman's target fluctuation divisor K for the cases RangeBoard carries. */
function fluctuationK(swerling: SwerlingCase): number {
  if (swerling === 0) return Infinity;
  if (swerling === 1) return 1;
  return 2;
}

/**
 * Required mean SNR per pulse (linear) from Shnidman's approximation.
 * Pd at or below the zero-SNR Pfa floor needs zero SNR; Pd >= 1 needs
 * infinite SNR. The equation's C1 branch is continued below Pd 0.1 and its
 * C1+C2 branch above Pd 0.99 so the forward inverse remains continuous to
 * the physical Pfa and 1 bounds; validation uses only the stated domain.
 */
export function shnidmanSnrForPd(
  pd: number,
  pfa: number,
  pulses: number,
  swerling: SwerlingCase,
): number {
  const q = probabilitySafe(pfa, 1e-6);
  if (!(pd > q)) return 0;
  if (pd >= 1) return Infinity;
  const p = probabilitySafe(pd, q);
  const n = pulseCountSafe(pulses);
  const eta =
    Math.sqrt(-0.8 * Math.log(4 * q * (1 - q))) +
    Math.sign(p - 0.5) * Math.sqrt(-0.8 * Math.log(4 * p * (1 - p)));
  const alpha = n <= 40 ? 0 : 0.25;
  const snr0 = eta * (eta + 2 * Math.sqrt(n / 2) + alpha - 0.25);
  const k = fluctuationK(swerling);
  const c1 = (((17.7006 * p - 18.4496) * p + 14.5339) * p - 3.525) / k;
  const c2 =
    (Math.exp(27.31 * p - 25.14) + (p - 0.8) * (0.7 * Math.log(1e-5 / q) + (2 * n - 20) / 80)) / k;
  const correctionDb = p <= 0.872 ? c1 : c1 + c2;
  return (Math.pow(10, correctionDb / 10) * snr0) / n;
}

/**
 * Integrated single-scan Pd for a mean per-pulse SNR. This is the monotone
 * inverse of shnidmanSnrForPd. Zero SNR returns Pfa and infinite SNR returns
 * one. Twenty-four halvings put the probability bracket below 6e-8.
 * Repeated Monte Carlo evaluations of the same SNR read the bounded cache.
 */
export function shnidmanPdFromSnr(
  snr: number,
  pfa: number,
  pulses: number,
  swerling: SwerlingCase,
): number {
  if (snr === Infinity) return 1;
  const q = probabilitySafe(pfa, 1e-6);
  const target = Number.isFinite(snr) && snr > 0 ? snr : 0;
  if (target === 0) return q;
  const n = pulseCountSafe(pulses);
  const cacheKey = `${q}:${n}:${swerling}`;
  let cache = PD_CACHE.get(cacheKey);
  if (!cache) {
    if (PD_CACHE.size >= PD_CACHE_KEY_LIMIT) {
      const oldestKey = PD_CACHE.keys().next().value;
      if (oldestKey != null) PD_CACHE.delete(oldestKey);
    }
    cache = new Map();
    PD_CACHE.set(cacheKey, cache);
  }
  const cached = cache.get(target);
  if (cached != null) return cached;
  let lo = q;
  let hi = 1 - Number.EPSILON;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (shnidmanSnrForPd(mid, q, n, swerling) < target) lo = mid;
    else hi = mid;
  }
  const pd = (lo + hi) / 2;
  if (cache.size >= PD_CACHE_LIMIT) cache.clear();
  cache.set(target, pd);
  return pd;
}
