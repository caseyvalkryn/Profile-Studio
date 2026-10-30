import type { EffectorSpec, EnvironmentSpec, Spread, UasSpec } from '../model/types';
import { normalQuantile } from '../analysis/uncertainty';
import { visibilityMFor } from '../analysis/sensorEnv/eoir';

/**
 * Optical directed-energy dwell model.
 *
 * Sources, read 2026-09-10:
 * - NASA SP-413, Space Settlements: the Airy-disc angular radius is
 *   1.22 lambda / aperture.
 *   https://ntrs.nasa.gov/api/citations/19770014162/downloads/19770014162.pdf
 * - NOAA GFDL, Atmospheric Radiation lecture 4: Koschmieder visibility
 *   V = 3.912 / extinction.
 *   https://www.gfdl.noaa.gov/wp-content/uploads/files/user_files/pag/lecture2008/lecture4.pdf
 * - IPG Photonics YLS high-power fibre-laser specification: 1070 nm is the
 *   standard wavelength of the 1 to 125 kW multimode product family.
 *   https://www.ipgphotonics.com/products/lasers/industrial-cw-fiber-lasers/high-power-fiber-lasers
 * - NASA scan-mirror requirements: less than one second settling after a
 *   one-degree command. RangeBoard uses the conservative one-second bound.
 *   https://ntrs.nasa.gov/api/citations/19970021613/downloads/19970021613.pdf
 *
 * The fluence scale is calibrated, rather than claimed as a material damage
 * measurement: the Iron Beam seed's 100 kW, M2 2, 0.30 m aperture, 10 urad
 * jitter and two-second dwell at the published 10 km condition define the
 * Group 1 quadcopter threshold. GAO-23-106717 explains why target material
 * and aimpoint (sensor, battery or fuel tank) change laser vulnerability;
 * the airframe multipliers below are explicit planning factors around that
 * one public anchor, not measured lethality data.
 * https://www.gao.gov/products/gao-23-106717
 */

/** Ytterbium-fibre wavelength used by the optical model, meters. */
const LASER_WAVELENGTH_M = 1_070e-9;

/** Airy first-zero radius coefficient for a circular aperture. */
const AIRY_RADIUS_FACTOR = 1.22;

/** Koschmieder extinction constant for meteorological visibility. */
const KOSCHMIEDER_EXTINCTION = 3.912;

/** One conservative beam-director settle after assignment, seconds. */
const DE_SETTLE_S = 1;

/** Iron Beam public calibration point. */
const IRON_BEAM_CALIBRATION = Object.freeze({
  outputPowerKw: 100,
  beamQualityM2: 2,
  apertureM: 0.3,
  jitterUrad: 10,
  rangeM: 10_000,
  visibilityM: 20_000,
  dwellS: 2,
});

/**
 * Event-level fluence spread recorded on Iron Beam `dwellToEffectS` in
 * data/library/effector/ironbeam.json. The current library build does not
 * emit that field's provenance row, so this sourced 2 dB value is the local
 * default until a caller can pass the runtime row. Passing null pins it.
 */
export const DEFAULT_FLUENCE_SPREAD: Spread = Object.freeze({
  kind: 'lognormal',
  sigmaDb: 2,
});

/**
 * Relative fluence-to-effect by airframe. These are planning factors around
 * the Group 1 quadcopter calibration: exposed FPV components below it,
 * larger VTOL/fixed-wing structure above it, and the one-way attack class
 * highest because a mission kill may require a protected control, fuel or
 * warhead-related aimpoint. GAO-23-106717 is the qualitative source for the
 * aimpoint/material ordering; it does not report these numeric multipliers.
 */
export const AIRFRAME_FLUENCE_FACTOR: Readonly<Record<UasSpec['airframe'], number>> = Object.freeze(
  {
    fpv: 0.75,
    quad: 1,
    vtol: 1.5,
    'fixed-wing': 2,
    'one-way-attack': 3,
  },
);

/** Diffraction and pointing-jitter contributions to the spot at one range. */
export interface OpticalSpot {
  diffractionRadiusM: number;
  jitterRadiusM: number;
  radiusM: number;
  areaM2: number;
}

/** Nominal or sampled optical dwell answer. */
export interface OpticalDwell {
  spot: OpticalSpot;
  transmission: number;
  irradianceWm2: number;
  fluenceThresholdJm2: number;
  dwellS: number;
  settleS: number;
  effectDelayS: number;
}

/** True when every field the optical law needs is finite and physical. */
export function opticalDwellModelApplies(spec: EffectorSpec, fallback = false): boolean {
  return (
    !fallback &&
    spec.effectorType === 'de' &&
    spec.outputPowerKw != null &&
    Number.isFinite(spec.outputPowerKw) &&
    spec.outputPowerKw > 0 &&
    spec.beamQualityM2 != null &&
    Number.isFinite(spec.beamQualityM2) &&
    spec.beamQualityM2 > 0 &&
    spec.apertureM != null &&
    Number.isFinite(spec.apertureM) &&
    spec.apertureM > 0 &&
    spec.jitterUrad != null &&
    Number.isFinite(spec.jitterUrad) &&
    spec.jitterUrad >= 0
  );
}

/** Airy radius times M squared, root-sum-squared with one-sigma pointing jitter. */
export function opticalSpotAt(
  rangeM: number,
  apertureM: number,
  beamQualityM2: number,
  jitterUrad: number,
): OpticalSpot | null {
  if (!(rangeM > 0) || !Number.isFinite(rangeM)) return null;
  if (!(apertureM > 0) || !Number.isFinite(apertureM)) return null;
  if (!(beamQualityM2 > 0) || !Number.isFinite(beamQualityM2)) return null;
  if (!(jitterUrad >= 0) || !Number.isFinite(jitterUrad)) return null;
  const diffractionRadiusM =
    (AIRY_RADIUS_FACTOR * LASER_WAVELENGTH_M * rangeM * beamQualityM2) / apertureM;
  const jitterRadiusM = rangeM * jitterUrad * 1e-6;
  const radiusM = Math.hypot(diffractionRadiusM, jitterRadiusM);
  return {
    diffractionRadiusM,
    jitterRadiusM,
    radiusM,
    areaM2: Math.PI * radiusM * radiusM,
  };
}

/** Beer-Lambert one-way transmission from the scenario visibility. */
export function opticalTransmissionAt(env: EnvironmentSpec, rangeM: number): number {
  if (!env.apply) return 1;
  if (!(rangeM >= 0) || !Number.isFinite(rangeM)) return 0;
  return Math.exp(-(KOSCHMIEDER_EXTINCTION * rangeM) / visibilityMFor(env));
}

/** Group 1 quadcopter fluence derived once from the Iron Beam calibration point. */
export const GROUP1_QUAD_FLUENCE_J_M2 = (() => {
  const c = IRON_BEAM_CALIBRATION;
  const spot = opticalSpotAt(c.rangeM, c.apertureM, c.beamQualityM2, c.jitterUrad)!;
  const transmission = Math.exp(-(KOSCHMIEDER_EXTINCTION * c.rangeM) / c.visibilityM);
  return ((c.outputPowerKw * 1_000 * transmission) / spot.areaM2) * c.dwellS;
})();

/** Nominal fluence-to-effect for one target class. */
export function fluenceThresholdJm2(uas?: UasSpec): number {
  return GROUP1_QUAD_FLUENCE_J_M2 * (uas ? AIRFRAME_FLUENCE_FACTOR[uas.airframe] : 1);
}

/**
 * One lognormal fluence draw. The caller resolves `spread` from the field
 * row or PF_SPREAD and supplies the commit-step uniform; null/non-lognormal
 * spread keeps the calibrated nominal. This module does not create a second
 * engine draw.
 */
export function sampledFluenceThresholdJm2(
  nominalJm2: number,
  spread: Spread | null | undefined,
  uRaw: number | null | undefined,
): number {
  const resolved = spread === undefined ? DEFAULT_FLUENCE_SPREAD : spread;
  if (resolved?.kind !== 'lognormal' || uRaw == null) return nominalJm2;
  const u = Math.min(1 - 2 ** -32, Math.max(2 ** -32, uRaw));
  return nominalJm2 * Math.pow(10, (resolved.sigmaDb * normalQuantile(u)) / 10);
}

/** Dwell to the sampled fluence threshold at one slant range. */
export function opticalDwellAt(
  spec: EffectorSpec,
  uas: UasSpec | undefined,
  rangeM: number,
  env: EnvironmentSpec,
  spread?: Spread | null,
  uRaw?: number | null,
): OpticalDwell | null {
  if (!opticalDwellModelApplies(spec)) return null;
  const spot = opticalSpotAt(rangeM, spec.apertureM!, spec.beamQualityM2!, spec.jitterUrad!);
  if (!spot || !(spot.areaM2 > 0)) return null;
  const transmission = opticalTransmissionAt(env, rangeM);
  const irradianceWm2 = (spec.outputPowerKw! * 1_000 * transmission) / spot.areaM2;
  if (!(irradianceWm2 > 0)) return null;
  const fluenceThreshold = sampledFluenceThresholdJm2(fluenceThresholdJm2(uas), spread, uRaw);
  const dwellS = fluenceThreshold / irradianceWm2;
  return {
    spot,
    transmission,
    irradianceWm2,
    fluenceThresholdJm2: fluenceThreshold,
    dwellS,
    settleS: DE_SETTLE_S,
    effectDelayS: DE_SETTLE_S + dwellS,
  };
}
