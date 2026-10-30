import type { EffectorSpec, JamBand, UasSpec, Vec2 } from '../model/types';
import { JAM_BANDS } from '../model/types';
import { angleDiffDeg, bearingDeg, dist } from '../geometry/geo';
import { slantRangeM } from '../geometry/slant';
import { jammable } from './sensorEnv';
import { linkBudgetRangeM, receivedPowerDbm } from './rfLink';

/**
 * EW effectiveness physics (planning factors, expected-value scale). A jam
 * holds only when
 *   1. the target depends on RF at all (nav-mode gate, `jammable`),
 *   2. the jammer's transmit bands cover the target's link bands,
 *   3. the target sits inside the transmit cone, discounted off boresight
 *      for mainbeam gain rolloff, and
 *   4. the power out closes the range: when both radios state power, the
 *      jammer received power must exceed the target link signal plus its
 *      jamResistDb margin. Incomplete radios keep the placard power law.
 * The factors multiply into one Pk multiplier that replaces the kinetic
 * distance, size and evasion penalties for jammers in attrition.ts.
 */

/** Off-boresight Pk multiplier at the sector edge (mainbeam gain rolloff). */
export const JAM_EDGE_FACTOR = 0.5;

/**
 * Band-coverage Pk multiplier when the jammer covers some but not all of the
 * target's link bands: the uncovered link keeps working, so denial is partial.
 */
export const JAM_PARTIAL_BAND_FACTOR = 0.6;

/** Range falloff inside the effective range: 30% at max range, as distanceFalloff in attrition.ts. */
const RANGE_FALLOFF = 0.3;

/** One jam-geometry answer, with the factor breakdown for readouts. */
interface JamAssessment {
  /** factor > 0: the jam physics close. */
  effective: boolean;
  /** Pk multiplier: bandFactor * alignFactor * powerFactor. */
  factor: number;
  /** 0 no band overlap, JAM_PARTIAL_BAND_FACTOR partial, 1 full coverage. */
  bandFactor: number;
  /** 1 on boresight down to JAM_EDGE_FACTOR at the sector edge; 0 outside. */
  alignFactor: number;
  /** Range/power closure inside the power-scaled effective range; 0 beyond. */
  powerFactor: number;
  /** Power-scaled effective jam range, meters. */
  effectiveRangeM: number;
  coveredBands: JamBand[];
  targetBands: JamBand[];
}

const INEFFECTIVE: Omit<JamAssessment, 'coveredBands' | 'targetBands' | 'effectiveRangeM'> = {
  effective: false,
  factor: 0,
  bandFactor: 0,
  alignFactor: 0,
  powerFactor: 0,
};

/**
 * Bands the target depends on. Spec override first, then nav-mode defaults:
 * GNSS-guided threats fly the navigation band, manual RF threats fly the
 * common control/video bands, mixed threats fly both. RF-silent nav modes
 * (inertial, optical, fiber) have no bands to deny.
 */
export function targetLinkBands(uas: UasSpec): JamBand[] {
  if (uas.linkBands && uas.linkBands.length > 0) return uas.linkBands;
  switch (uas.navMode) {
    case 'gps':
      return ['gnss'];
    case 'rf-manual':
      return ['ism-2400', 'ism-5800'];
    case 'mixed':
      return ['gnss', 'ism-2400', 'ism-5800'];
    default:
      return [];
  }
}

/** Bands the jammer transmits. Absent on old saves means every band. */
export function jammerBands(spec: EffectorSpec): JamBand[] {
  return spec.jamBands && spec.jamBands.length > 0 ? spec.jamBands : JAM_BANDS;
}

/** True when the jammer covers at least one band the target depends on. */
export function jamBandsOverlap(spec: EffectorSpec, uas: UasSpec): boolean {
  if (!jammable(uas)) return false;
  const tx = new Set(jammerBands(spec));
  return targetLinkBands(uas).some((b) => tx.has(b));
}

/**
 * Effective jam range. Complete radios use a received-power J/S closure,
 * bounded by the placard range. The legacy path scales the placard by the
 * square root of EIRP ratio and target resistance exactly as before.
 */
export function effectiveJamRangeM(spec: EffectorSpec, uas?: UasSpec): number {
  const jsRangeM = uas ? jamToSignalRangeM(spec, uas) : null;
  if (jsRangeM != null) {
    // Keep the stated jammer envelope as an upper bound. Resistance is
    // already applied as the required J/S margin, so do not charge it twice.
    let placardRatio = 1;
    if (spec.eirpW != null && spec.ratedEirpW != null && spec.ratedEirpW > 0) {
      placardRatio = Math.max(0, spec.eirpW / spec.ratedEirpW);
    }
    return Math.min(spec.maxRangeM * Math.sqrt(placardRatio), jsRangeM);
  }
  let ratio = 1;
  if (spec.eirpW != null && spec.ratedEirpW != null && spec.ratedEirpW > 0) {
    ratio = Math.max(0, spec.eirpW / spec.ratedEirpW);
  }
  const resistDb = uas?.jamResistDb ?? 0;
  if (resistDb !== 0) ratio /= Math.pow(10, resistDb / 10);
  return spec.maxRangeM * Math.sqrt(ratio);
}

/**
 * Jammer closure range from J/S at the target receiver, meters. The desired
 * signal is the UAS transmitter's received power at its stated control-link
 * range; the jammer must equal that signal plus the target's resistance
 * margin. Both sides use rfLink.ts (ITU-R P.525). Null means an incomplete
 * radio and selects the placard path in effectiveJamRangeM.
 */
export function jamToSignalRangeM(spec: EffectorSpec, uas: UasSpec): number | null {
  const jammerPowerW = spec.eirpW ?? spec.ratedEirpW;
  if (!(jammerPowerW != null && Number.isFinite(jammerPowerW) && jammerPowerW > 0)) return null;
  if (!(
    uas.radiatedPowerW != null &&
    Number.isFinite(uas.radiatedPowerW) &&
    uas.radiatedPowerW > 0
  ))
    return null;
  if (!(
    uas.controlLinkRangeM != null &&
    Number.isFinite(uas.controlLinkRangeM) &&
    uas.controlLinkRangeM > 0
  ))
    return null;
  const tx = new Set(jammerBands(spec));
  const covered = targetLinkBands(uas).filter((band) => tx.has(band));
  if (covered.length === 0) return null;
  const resistDb = uas.jamResistDb ?? 0;
  let rangeM = Number.POSITIVE_INFINITY;
  for (const band of covered) {
    const linkSignalDbm = receivedPowerDbm(uas.radiatedPowerW, uas.controlLinkRangeM, band);
    const bandRangeM = linkBudgetRangeM(jammerPowerW, band, linkSignalDbm + resistDb);
    rangeM = Math.min(rangeM, bandRangeM);
  }
  return Number.isFinite(rangeM) ? rangeM : null;
}

/**
 * Full jam-physics answer for one jammer against one target position.
 * `uas` undefined (an entity with a deleted spec) skips the band gate and
 * keeps the geometry factors. `dAltM` is the target altitude minus the
 * jammer mount height, meters; the range, min-range and power falloff use
 * the slant range it implies. The sector test stays in plan view.
 */
export function assessJam(
  spec: EffectorSpec,
  jammerPos: Vec2,
  jammerHeadingDeg: number,
  uas: UasSpec | undefined,
  targetPos: Vec2,
  dAltM = 0,
): JamAssessment {
  const targetBands = uas ? targetLinkBands(uas) : [];
  const covered = uas
    ? (() => {
        const tx = new Set(jammerBands(spec));
        return targetBands.filter((b) => tx.has(b));
      })()
    : [];
  const effectiveRangeM = effectiveJamRangeM(spec, uas);
  const fail = (): JamAssessment => ({
    ...INEFFECTIVE,
    effectiveRangeM,
    coveredBands: covered,
    targetBands,
  });

  let bandFactor = 1;
  if (uas) {
    if (!jammable(uas) || covered.length === 0) return fail();
    bandFactor = covered.length === targetBands.length ? 1 : JAM_PARTIAL_BAND_FACTOR;
  }

  const rangeM = slantRangeM(dist(jammerPos, targetPos), dAltM);
  if (rangeM < spec.minRangeM || rangeM > effectiveRangeM) return fail();

  const sectorDeg = spec.sectorDeg ?? 360;
  let alignFactor = 1;
  if (sectorDeg < 360) {
    const offDeg = angleDiffDeg(bearingDeg(jammerPos, targetPos), jammerHeadingDeg);
    const halfDeg = sectorDeg / 2;
    if (offDeg > halfDeg) return fail();
    // Cosine mainbeam taper: 1 on boresight, JAM_EDGE_FACTOR at the edge.
    alignFactor =
      JAM_EDGE_FACTOR + (1 - JAM_EDGE_FACTOR) * Math.cos((Math.PI / 2) * (offDeg / halfDeg));
  }

  const powerFactor = effectiveRangeM > 0 ? 1 - RANGE_FALLOFF * (rangeM / effectiveRangeM) : 0;
  const factor = bandFactor * alignFactor * powerFactor;
  return {
    effective: factor > 0,
    factor,
    bandFactor,
    alignFactor,
    powerFactor,
    effectiveRangeM,
    coveredBands: covered,
    targetBands,
  };
}
