import type { EffectorSpec, EnvironmentSpec, SensorSpec, SensorType } from '../../model/types';
import { elevationDeg, radioHorizonM } from '../../geometry/slant';

/**
 * Shared terms of the sensor physics: the environment factor table, the
 * range-basis rule, the vertical geometry gates and the unit constants.
 *
 * Environment factors follow the COURAGEOUS project findings (Brewczynski
 * et al., Remote Sens. 2024, 16, 3714): rain and fog attenuate radar and
 * EO/IR, visible-light cameras are daylight sensors, urban EM clutter cuts
 * RF detection, and wind masks acoustic signatures. Values are
 * representative planning factors, not test data.
 */
export const SENSOR_ENV_MODEL = {
  rain: { radar: 0.75, 'eo-ir': 0.6, rf: 1, acoustic: 0.7 } as Record<SensorType, number>,
  fog: { radar: 0.85, 'eo-ir': 0.4, rf: 1, acoustic: 1 } as Record<SensorType, number>,
  urbanEm: { radar: 0.9, 'eo-ir': 1, rf: 0.6, acoustic: 0.85 } as Record<SensorType, number>,
  /** Acoustic range loss per m/s of wind, with a floor. */
  acousticWindLossPerMps: 0.03,
  acousticWindFloor: 0.4,
  source: 'COURAGEOUS project (Remote Sens. 2024) + radar range equation',
};

/** The environment factor with the urban term switchable (the RF urban override supplies its own). */
export function envFactorImpl(
  type: SensorType,
  env: EnvironmentSpec,
  includeUrban: boolean,
): number {
  if (!env.apply) return 1;
  let f = 1;
  const precip = env.precipitation ?? 'clear';
  if (precip === 'rain') f *= SENSOR_ENV_MODEL.rain[type];
  if (precip === 'fog') f *= SENSOR_ENV_MODEL.fog[type];
  if (includeUrban && (env.emBackground ?? 'rural') === 'urban')
    f *= SENSOR_ENV_MODEL.urbanEm[type];
  if (type === 'acoustic' && env.windSpeedMps > 0) {
    // Wind bearing relative to the source is out of scope: the loss is a
    // scalar noise-floor effect, the same in every direction.
    f *= Math.max(
      SENSOR_ENV_MODEL.acousticWindFloor,
      1 - env.windSpeedMps * SENSOR_ENV_MODEL.acousticWindLossPerMps,
    );
  }
  return f;
}

/**
 * Range multiplier for one sensor technology under the current environment,
 * (0, 1]. Type-wide effects only: rain, fog, urban EM, wind. Night is a
 * per-band EO/IR effect (eoRangeFactor) and is not in here.
 */
export function sensorEnvFactor(type: SensorType, env: EnvironmentSpec): number {
  return envFactorImpl(type, env, true);
}

/** True when the sensor's detect range is a sourced figure that target laws may scale. */
export function targetScaled(spec: SensorSpec): boolean {
  return (spec.rangeBasis ?? 'sourced') !== 'planning';
}

/** A probability strictly inside (0, 1), else the fallback. */
export function probabilityOr(p: number | null | undefined, fallback: number): number {
  return p != null && Number.isFinite(p) && p > 0 && p < 1 ? p : fallback;
}

/** Feet to meters. Altitudes are recorded in feet; the engine works in meters. */
export const FT_TO_M = 0.3048;

/** A recorded altitude ceiling in meters, or null when the spec states none. */
function ceilingM(maxAltitudeFt: number | null | undefined): number | null {
  return maxAltitudeFt != null && Number.isFinite(maxAltitudeFt) && maxAltitudeFt > 0
    ? maxAltitudeFt * FT_TO_M
    : null;
}

export type GeometryGate = 'ok' | 'below-horizon' | 'elevation' | 'ceiling';

/** Elevation gate tolerance at both edges, degrees. PF. */
const EL_EPS_DEG = 0.001;

/**
 * Vertical geometry gate for one sensor against one target position.
 * Ceiling applies only when spec.maxAltitudeFt is recorded. Horizon (4/3
 * earth radio line of sight between the phase center and the target)
 * applies to radar, RF and EO/IR, never to acoustic, which needs no line
 * of sight. Elevation applies only when spec.elevationDeg is recorded and
 * tests the angle from the phase center to the target against [min, max]
 * with a 0.001 degree tolerance at both edges (PF) so a target at the mount
 * height passes a 0 degree lower edge.
 * Heights are AGL over a flat plane, both measured from the same ground.
 */
export function sensorGeometryGate(
  spec: SensorSpec,
  sensorHeightM: number,
  targetAltM: number,
  groundM: number,
): GeometryGate {
  return sensorGeometryGateAt(spec, sensorHeightM, targetAltM)(groundM);
}

/**
 * sensorGeometryGate with the ceiling, the radio horizon and the height
 * difference resolved once for one sensor against one target altitude: the
 * gate the sweep tests per member per step.
 */
export function sensorGeometryGateAt(
  spec: SensorSpec,
  sensorHeightM: number,
  targetAltM: number,
): (groundM: number) => GeometryGate {
  const ceiling = ceilingM(spec.maxAltitudeFt);
  if (ceiling != null && targetAltM > ceiling) return () => 'ceiling';
  if (spec.sensorType === 'acoustic') return () => 'ok';
  const horizonM = radioHorizonM(sensorHeightM, targetAltM);
  const el = spec.elevationDeg;
  const dAltM = targetAltM - sensorHeightM;
  return (groundM) => {
    if (groundM > horizonM) return 'below-horizon';
    if (el) {
      const angle = elevationDeg(groundM, dAltM);
      if (angle < el[0] - EL_EPS_DEG || angle > el[1] + EL_EPS_DEG) return 'elevation';
    }
    return 'ok';
  };
}

/** Effector ceiling gate: 'ceiling' when spec.maxAltitudeFt is recorded and the target is above it. */
export function effectorGeometryGate(spec: EffectorSpec, targetAltM: number): 'ok' | 'ceiling' {
  const ceiling = ceilingM(spec.maxAltitudeFt);
  return ceiling != null && targetAltM > ceiling ? 'ceiling' : 'ok';
}
