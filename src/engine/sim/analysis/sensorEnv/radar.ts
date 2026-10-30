import type { EnvironmentSpec, SensorSpec, UasSpec } from '../../model/types';
import { PLACARD_PD, PLACARD_PFA, PLACARD_SWERLING } from '../../model/types';
import { RADAR_REF_RCS_M2, rcsM2For, swerlingFor } from '../../model/rcsFactors';
import type { RadarCalibration } from '../radarPd';
import { pdAtRange } from '../radarPd';
import { radarDwellPulses } from '../../playback/radarDwell';
import { probabilityOr, sensorEnvFactor, targetScaled } from './common';

/**
 * Radar target law and Pd model. The spec range is quoted against a reference
 * RCS; the range against another target follows the fourth root of the RCS
 * ratio (radar range equation), and a sourced-basis radar against a known
 * target reads the placard-calibrated Pd curve (radarPd.ts).
 */

/** The RCS, m2, at which a radar's detect range is quoted: spec value, else the Group 1 planning factor. */
export function refRcsM2For(spec: SensorSpec): number {
  const r = spec.refRcsM2;
  return r != null && Number.isFinite(r) && r > 0 ? r : RADAR_REF_RCS_M2;
}

/**
 * Radar range multiplier for one target: (target RCS / reference RCS)^(1/4),
 * the radar range equation with everything but the target held fixed. The
 * target the range was quoted against scores exactly 1, and so do non-radar
 * sensors, an unknown target and a planning-basis range.
 */
export function rcsRangeFactor(spec: SensorSpec, target: UasSpec | undefined): number {
  if (spec.sensorType !== 'radar' || !target || !targetScaled(spec)) return 1;
  return Math.pow(rcsM2For(target) / refRcsM2For(spec), 0.25);
}

/** The instrumented range when the spec records one, else null. */
export function instrumentedM(spec: SensorSpec): number | null {
  const cap = spec.instrumentedRangeM;
  return cap != null && Number.isFinite(cap) && cap > 0 ? cap : null;
}

/** Cap at the radar's instrumented range: nothing is reported beyond what the radar processes. */
export function capInstrumented(spec: SensorSpec, rangeM: number): number {
  const cap = instrumentedM(spec);
  return cap != null ? Math.min(rangeM, cap) : rangeM;
}

/**
 * Placard calibration of one radar: r0M = detectRangeM, rcs0M2 =
 * refRcsM2For(spec), pd0 = placardPd ?? PLACARD_PD, pfa = pfa ?? PLACARD_PFA,
 * swerling0 = PLACARD_SWERLING, and pulsesPerDwell resolves from the stated
 * count or the dwell-time planning PRF. A recorded Pd or Pfa outside (0, 1)
 * falls back to the planning factor. `singlePulseRadar` forces the legacy
 * calibration for the scenario switch without changing existing call sites.
 */
export function radarCalibration(spec: SensorSpec, singlePulseRadar = false): RadarCalibration {
  return {
    r0M: spec.detectRangeM,
    rcs0M2: refRcsM2For(spec),
    pd0: probabilityOr(spec.placardPd, PLACARD_PD),
    pfa: probabilityOr(spec.pfa, PLACARD_PFA),
    swerling0: PLACARD_SWERLING,
    pulsesPerDwell: singlePulseRadar ? null : radarDwellPulses(spec),
  };
}

/**
 * True when the Pd model applies: a radar whose detect range is a sourced
 * figure, against a known target. A planning-basis radar skips the Pd model
 * exactly as it skips RCS scaling.
 */
export function radarPdModeled(spec: SensorSpec, target: UasSpec | undefined): target is UasSpec {
  return spec.sensorType === 'radar' && !!target && targetScaled(spec);
}

/**
 * Single-scan Pd of one radar against one target at one slant range. Null
 * when the sensor is not a radar, has a 'planning' range basis, or has no
 * target. 0 beyond instrumentedRangeM. The environment multiplier enters the
 * SNR as the fourth power (through sensorEnvFactor('radar', env)).
 */
export function radarPdAt(
  spec: SensorSpec,
  env: EnvironmentSpec,
  target: UasSpec | undefined,
  slantM: number,
  singlePulseRadar = false,
): number | null {
  return radarPdCurve(spec, env, target, singlePulseRadar)?.(slantM) ?? null;
}

/**
 * radarPdAt with the calibration, the target terms and the environment
 * factor resolved once: the curve the sweep evaluates per admitted member
 * per step. Null when the Pd model does not apply.
 */
export function radarPdCurve(
  spec: SensorSpec,
  env: EnvironmentSpec,
  target: UasSpec | undefined,
  singlePulseRadar = false,
): ((slantM: number) => number) | null {
  if (!radarPdModeled(spec, target)) return null;
  const cap = instrumentedM(spec);
  const cal = radarCalibration(spec, singlePulseRadar);
  const rcsM2 = rcsM2For(target);
  const envFactor = sensorEnvFactor('radar', env);
  const swerling = swerlingFor(target);
  return (slantM) =>
    cap != null && slantM > cap ? 0 : pdAtRange(cal, rcsM2, slantM, envFactor, swerling);
}
