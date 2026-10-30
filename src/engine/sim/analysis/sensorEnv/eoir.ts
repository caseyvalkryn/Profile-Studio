import type {
  EnvironmentSpec,
  Precipitation,
  SensorRole,
  SensorSpec,
  UasSpec,
} from '../../model/types';
import { defaultSensorRole } from '../../model/types';
import {
  EO_REF_SPAN_M,
  IR_SIGNATURE_FACTOR,
  irSignatureFor,
  spanMFor,
} from '../../model/signatureFactors';
import { sensorEnvFactor, targetScaled } from './common';

/**
 * EO/IR target law, night and visibility rules, and the cue rule. The spec
 * range is quoted against a reference span; the range against another target
 * is linear in the span ratio (Johnson criteria), the thermal channel carries
 * a contrast class, and no contrast survives beyond the meteorological
 * visibility (Koschmieder).
 */

/**
 * Night range multiplier for a visible-only EO sensor. Thermal and dual-band
 * sensors keep their range at night (the thermal channel carries); night is
 * handled per band in eoRangeFactor, not as a type-wide factor.
 */
export const NIGHT_VISIBLE_FACTOR = 0.2;

/** Meteorological visibility derived from precipitation when the environment sets none, meters. */
export const VISIBILITY_BY_PRECIP: Record<Precipitation, number> = {
  clear: 20000,
  rain: 6000,
  fog: 600,
};

/** The three observer tasks in the Johnson DRI model. */
export type EoirTask = 'detect' | 'recognize' | 'identify';

/**
 * Johnson line-pair thresholds at 50 percent task probability: the
 * conservative industry values 1, 4 and 8 cycles across the target critical
 * dimension. One cycle occupies two detector pixels.
 */
export const JOHNSON_CYCLES: Readonly<Record<EoirTask, number>> = {
  detect: 1,
  recognize: 4,
  identify: 8,
};

/** Koschmieder's original contrast threshold: visibility is 2 percent transmission. */
export const KOSCHMIEDER_CONTRAST = 0.02;

/**
 * MWIR extinction relative to visible extinction. ITU-R P.1814-0 equations
 * (4)-(5), at 4 um versus 550 nm and the model's 0.6 km fog visibility, give
 * a ratio of 0.3757, rounded here to one constant.
 */
export const THERMAL_EXTINCTION_RATIO = 0.38;

/** A modeled DRI triple, meters. */
export interface EoirDriRanges {
  detectM: number;
  recognizeM: number;
  identifyM: number;
}

/**
 * Adapter options for the shared sensor-range dispatch. `fallbackRangeM` is
 * the already-computed legacy result, returned unchanged for the switch and
 * for incomplete optics.
 */
export interface EoirRangeOptions {
  task: EoirTask;
  fallbackRangeM: number;
  useFallback?: boolean;
}

/** The span, m, at which an EO/IR detect range is quoted: spec value, else the Group 1 planning factor. */
export function refSpanMFor(spec: SensorSpec): number {
  const r = spec.refSpanM;
  return r != null && Number.isFinite(r) && r > 0 ? r : EO_REF_SPAN_M;
}

/** True when the thermal channel carries the detection: a thermal sensor, or a dual sensor at night. */
function eoThermalCarries(spec: SensorSpec, env: EnvironmentSpec): boolean {
  const band = spec.eoBand ?? 'dual';
  if (band === 'thermal') return true;
  if (band === 'visible') return false;
  return env.apply && (env.light ?? 'day') === 'night';
}

/**
 * Instantaneous angular field per detector pixel, radians. Pitch/focal
 * length is authoritative when complete; horizontal field/pixel count is
 * the fallback optics pair. Null means the sensor has no usable optics.
 */
export function eoIfovRadFor(spec: SensorSpec): number | null {
  const pitchUm = spec.pixelPitchUm;
  const focalMm = spec.focalLengthMm;
  if (
    pitchUm != null &&
    Number.isFinite(pitchUm) &&
    pitchUm > 0 &&
    focalMm != null &&
    Number.isFinite(focalMm) &&
    focalMm > 0
  ) {
    return (pitchUm / focalMm) * 1e-3;
  }
  const fovDeg = spec.fovDeg;
  const pixels = spec.detectorPixelsH;
  if (
    fovDeg != null &&
    Number.isFinite(fovDeg) &&
    fovDeg > 0 &&
    pixels != null &&
    Number.isFinite(pixels) &&
    pixels > 0
  ) {
    return (fovDeg * Math.PI) / 180 / pixels;
  }
  return null;
}

/** Meteorological visibility in use, meters: the environment value, else the precipitation default. */
export function visibilityMFor(env: EnvironmentSpec): number {
  const v = env.visibilityM;
  if (v != null && Number.isFinite(v) && v > 0) return v;
  return VISIBILITY_BY_PRECIP[env.precipitation ?? 'clear'];
}

/** Active imaging band: a dual sensor uses visible by day and thermal at night. */
export function eoBandFor(spec: SensorSpec, env: EnvironmentSpec): 'visible' | 'thermal' {
  const band = spec.eoBand ?? 'dual';
  if (band !== 'dual') return band;
  return env.apply && (env.light ?? 'day') === 'night' ? 'thermal' : 'visible';
}

/**
 * Atmospheric extinction, inverse meters. Koschmieder gives
 * sigma = -ln(0.02) / visibility. Thermal uses the ITU-derived smaller
 * constant ratio; an environment that is not applied has no extinction.
 */
export function eoExtinctionPerM(spec: SensorSpec, env: EnvironmentSpec): number {
  if (!env.apply) return 0;
  const visible = -Math.log(KOSCHMIEDER_CONTRAST) / visibilityMFor(env);
  return visible * (eoBandFor(spec, env) === 'thermal' ? THERMAL_EXTINCTION_RATIO : 1);
}

/** Beer-Lambert one-way contrast transmission exp(-sigma * range). */
export function eoTransmissionAt(spec: SensorSpec, env: EnvironmentSpec, rangeM: number): number {
  return Math.exp(-eoExtinctionPerM(spec, env) * Math.max(0, rangeM));
}

/** Detector pixels across a target's critical span at one slant range. */
export function eoPixelsOnTarget(spanM: number, rangeM: number, ifovRad: number): number {
  if (!(spanM > 0) || !(rangeM > 0) || !(ifovRad > 0)) return 0;
  return spanM / (rangeM * ifovRad);
}

/**
 * Solve R * exp(sigma R) = clearRange without adding a Lambert-W
 * dependency. The left side is monotone and the attenuated answer lies in
 * [0, clearRange]; 64 bisections resolve well below floating-point input
 * precision for the ranges represented by the library.
 */
function attenuatedRangeM(clearRangeM: number, extinctionPerM: number): number {
  if (!(extinctionPerM > 0)) return clearRangeM;
  let lo = 0;
  let hi = clearRangeM;
  for (let i = 0; i < 64; i += 1) {
    const mid = (lo + hi) / 2;
    const logRatio = Math.log(mid / clearRangeM) + extinctionPerM * mid;
    if (logRatio > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Optics-based DRI ranges for one target, meters. At range R the available
 * line pairs are
 *
 *   span * bandFactor * environmentFactor * exp(-sigma R)
 *   ------------------------------------------------------
 *                    2 R IFOV
 *
 * and the task range is where that value meets JOHNSON_CYCLES[task]. Null
 * means this is not an EO/IR case with a target and a complete optics pair,
 * so the caller must use its legacy result.
 */
export function eoIrDriRangesM(
  spec: SensorSpec,
  target: UasSpec | undefined,
  env: EnvironmentSpec,
): EoirDriRanges | null {
  if (spec.sensorType !== 'eo-ir' || !target) return null;
  const ifovRad = eoIfovRadFor(spec);
  if (ifovRad == null) return null;

  let bandFactor = 1;
  if (eoBandFor(spec, env) === 'thermal') {
    bandFactor *= IR_SIGNATURE_FACTOR[irSignatureFor(target)];
  } else if (env.apply && (env.light ?? 'day') === 'night') {
    bandFactor *= NIGHT_VISIBLE_FACTOR;
  }
  const numeratorM = spanMFor(target) * bandFactor * sensorEnvFactor('eo-ir', env);
  const extinctionPerM = eoExtinctionPerM(spec, env);
  const rangeFor = (task: EoirTask): number =>
    attenuatedRangeM(numeratorM / (2 * JOHNSON_CYCLES[task] * ifovRad), extinctionPerM);
  return {
    detectM: rangeFor('detect'),
    recognizeM: rangeFor('recognize'),
    identifyM: rangeFor('identify'),
  };
}

/**
 * One DRI task range for sensorEnv.ts, meters. The switch, incomplete optics
 * and a missing target return the supplied legacy value unchanged.
 */
export function eoIrRangeM(
  spec: SensorSpec,
  target: UasSpec | undefined,
  env: EnvironmentSpec,
  options: EoirRangeOptions,
): number {
  if (options.useFallback) return options.fallbackRangeM;
  const dri = eoIrDriRangesM(spec, target, env);
  if (dri == null) return options.fallbackRangeM;
  if (options.task === 'detect') return dri.detectM;
  if (options.task === 'recognize') return dri.recognizeM;
  return dri.identifyM;
}

/**
 * EO/IR range multiplier for one target. Size term: target span over the
 * reference span (Johnson criteria: the line pairs across the critical
 * dimension scale linearly with range). Thermal term: the target's contrast
 * class, when the thermal channel carries. Night: a visible-only sensor
 * falls to NIGHT_VISIBLE_FACTOR; thermal and dual sensors keep range. The
 * target terms are physics, not weather, so they apply whether or not the
 * environment toggle is on; night is weather and follows the toggle.
 */
export function eoRangeFactor(
  spec: SensorSpec,
  target: UasSpec | undefined,
  env: EnvironmentSpec,
): number {
  if (spec.sensorType !== 'eo-ir') return 1;
  let f = 1;
  if (env.apply && (env.light ?? 'day') === 'night' && (spec.eoBand ?? 'dual') === 'visible') {
    f *= NIGHT_VISIBLE_FACTOR;
  }
  if (target && targetScaled(spec)) {
    f *= spanMFor(target) / refSpanMFor(spec);
    if (eoThermalCarries(spec, env)) f *= IR_SIGNATURE_FACTOR[irSignatureFor(target)];
  }
  return f;
}

/** Koschmieder cap: no EO/IR contrast survives beyond the meteorological visibility. */
export function capVisibility(spec: SensorSpec, env: EnvironmentSpec, rangeM: number): number {
  if (spec.sensorType !== 'eo-ir' || !env.apply) return rangeM;
  return Math.min(rangeM, visibilityMFor(env));
}

/** Roles that hold only a cued target (narrow field of view). */
const CUED_EO_ROLES: ReadonlySet<SensorRole> = new Set([
  'classification',
  'fire-control',
  'tracking',
  'target-acquisition',
]);

/**
 * True when this EO/IR sensor needs a cue from another sensor before it holds
 * a track (COURAGEOUS: narrow-FOV cameras verify cued targets, they do not
 * search). Surveillance and early-warning roles hold without a cue.
 */
export function eoIrNeedsCue(spec: SensorSpec): boolean {
  return spec.sensorType === 'eo-ir' && CUED_EO_ROLES.has(defaultSensorRole(spec));
}
