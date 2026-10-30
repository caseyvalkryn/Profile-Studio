import type { EnvironmentSpec, JamBand, SensorSpec, UasSpec } from '../../model/types';
import { JAM_BANDS } from '../../model/types';
import { targetLinkBands } from '../ewPhysics';
import {
  crossBearingRangeSigmaM,
  directionFindingAccuracyDeg,
  linkMarginDb,
  linkBudgetRangeM,
  snrRatio,
  URBAN_EXCESS_LOSS_DB,
} from '../rfLink';
import { envFactorImpl, sensorEnvFactor } from './common';

/**
 * Passive RF detection rules and the environment adapter around rfLink.ts.
 * The pure link math stays reusable by the effect model; this module resolves
 * RF sensor/target fields, the legacy fallback and multi-node accuracy.
 */

/**
 * True when the UAS emits an RF control or video link a passive RF sensor can
 * hear. Autonomous, inertial, optical, and fiber-guided threats are RF silent
 * (COURAGEOUS: frequency monitors only detect active transmissions).
 */
export function rfDetectable(uas: UasSpec): boolean {
  return uas.navMode === 'rf-manual' || uas.navMode === 'mixed';
}

/** True when a jammer has something to deny: an RF link or GNSS navigation. */
export function jammable(uas: UasSpec): boolean {
  return uas.navMode === 'gps' || uas.navMode === 'rf-manual' || uas.navMode === 'mixed';
}

/** Bands an RF sensor receives. Absent means every band. */
export function rfSensorBands(spec: SensorSpec): JamBand[] {
  return spec.rfBands && spec.rfBands.length > 0 ? spec.rfBands : JAM_BANDS;
}

/**
 * True when the RF sensor can hear this threat: it emits at all, and one of
 * its EMITTING link bands is inside the receiver's coverage. GNSS is a
 * band the threat receives, never one it transmits, so it never counts.
 */
export function rfCanHear(spec: SensorSpec, uas: UasSpec): boolean {
  if (!rfDetectable(uas)) return false;
  const rx = new Set(rfSensorBands(spec));
  return targetLinkBands(uas).some((b) => b !== 'gnss' && rx.has(b));
}

/** Emitting bands shared by this sensor and target. GNSS is not a target emission. */
export function rfOverlapBands(spec: SensorSpec, uas: UasSpec): JamBand[] {
  if (!rfDetectable(uas)) return [];
  const rx = new Set(rfSensorBands(spec));
  return targetLinkBands(uas).filter((band) => band !== 'gnss' && rx.has(band));
}

/** True when the environment's urban override applies to this RF sensor. */
function urbanOverride(spec: SensorSpec, env: EnvironmentSpec): boolean {
  return (
    spec.sensorType === 'rf' &&
    spec.detectRangeM > 0 &&
    env.apply &&
    (env.emBackground ?? 'rural') === 'urban' &&
    spec.urbanRangeM != null &&
    Number.isFinite(spec.urbanRangeM) &&
    spec.urbanRangeM > 0
  );
}

/** Urban excess-loss term applied by the RF link budget under the environment toggle. */
export function rfUrbanMarginDb(env: EnvironmentSpec): number {
  return env.apply && (env.emBackground ?? 'rural') === 'urban' ? URBAN_EXCESS_LOSS_DB : 0;
}

/**
 * True when the physics path has every required field. `fallback` is the
 * caller's rfBandGate state; the analysis module does not read scenario state.
 */
export function rfLinkBudgetModeled(spec: SensorSpec, uas: UasSpec, fallback = false): boolean {
  return (
    !fallback &&
    spec.sensorType === 'rf' &&
    spec.receiverSensitivityDbm != null &&
    Number.isFinite(spec.receiverSensitivityDbm) &&
    uas.radiatedPowerW != null &&
    Number.isFinite(uas.radiatedPowerW)
  );
}

/** True when the complete link model is both available and exercised by this pair. */
export function rfLinkModelApplies(spec: SensorSpec, uas: UasSpec, fallback = false): boolean {
  return rfLinkBudgetModeled(spec, uas, fallback) && rfCanHear(spec, uas);
}

/** Today's RF placard/environment path, kept in one function for bit-identical fallback. */
export function legacyRfRangeM(spec: SensorSpec, quotedM: number, env: EnvironmentSpec): number {
  return urbanOverride(spec, env)
    ? quotedM * (spec.urbanRangeM! / spec.detectRangeM) * envFactorImpl('rf', env, false)
    : quotedM * sensorEnvFactor('rf', env);
}

/**
 * RF detect/classify range. Physics chooses the longest link-budget range of
 * the overlapping emitted bands, applies the quoted classify/detect ratio,
 * and treats a published urban range as a cap. The rfBandGate switch or a
 * missing required field returns legacyRfRangeM exactly.
 */
export function effectiveRfRangeM(
  spec: SensorSpec,
  quotedM: number,
  env: EnvironmentSpec,
  uas: UasSpec | undefined,
  fallback = false,
): number {
  if (!uas || !rfLinkBudgetModeled(spec, uas, fallback)) return legacyRfRangeM(spec, quotedM, env);
  const bands = rfOverlapBands(spec, uas);
  if (bands.length === 0) return 0;
  const marginDb = rfUrbanMarginDb(env);
  let detectM = 0;
  for (const band of bands) {
    detectM = Math.max(
      detectM,
      linkBudgetRangeM(uas.radiatedPowerW!, band, spec.receiverSensitivityDbm!, marginDb),
    );
  }
  if (urbanOverride(spec, env)) detectM = Math.min(detectM, spec.urbanRangeM!);
  const quotedRatio = spec.detectRangeM > 0 ? quotedM / spec.detectRangeM : 0;
  return detectM * quotedRatio;
}

/**
 * Received power above the sensitivity reference as a linear ratio. The
 * strongest overlapping emitted band carries the measurement; 1 is the
 * threshold/reference value. Null means the link-budget model does not
 * apply, so callers should keep the legacy tracker path.
 */
export function rfSnrOverReference(
  spec: SensorSpec,
  uas: UasSpec,
  env: EnvironmentSpec,
  rangeM: number,
  fallback = false,
): number | null {
  if (!rfLinkModelApplies(spec, uas, fallback)) return null;
  let bestMarginDb = Number.NEGATIVE_INFINITY;
  for (const band of rfOverlapBands(spec, uas)) {
    bestMarginDb = Math.max(
      bestMarginDb,
      linkMarginDb(
        uas.radiatedPowerW!,
        rangeM,
        band,
        spec.receiverSensitivityDbm!,
        rfUrbanMarginDb(env),
      ),
    );
  }
  return Math.max(1, snrRatio(bestMarginDb));
}

/** Published DF seed adjusted by an SNR/reference-SNR power ratio. */
export function rfDirectionFindingAccuracyDeg(
  spec: SensorSpec,
  snrOverReference: number,
): number | null {
  return directionFindingAccuracyDeg(spec.azimuthAccuracyDeg ?? 0, snrOverReference);
}

export interface RfMeasurementAccuracy {
  /** Bearing 1-sigma error after the SNR law, degrees. */
  azimuthAccuracyDeg: number | null;
  /** Cross-bearing range 1-sigma error, or null while the sensor is bearing only. */
  rangeAccuracyM: number | null;
}

/**
 * Accuracy presented to the tracker for one same-model RF network. A network
 * remains bearing only until its documented minimum node count hears the
 * target at once. `baselineM` is the effective broadside separation supplied
 * by the caller's laydown geometry.
 */
export function rfMeasurementAccuracy(
  spec: SensorSpec,
  snrOverReference: number,
  sameModelHearingNodes: number,
  rangeM: number,
  baselineM: number,
): RfMeasurementAccuracy {
  const azimuthAccuracyDeg = rfDirectionFindingAccuracyDeg(spec, snrOverReference);
  const minNodes = spec.geolocationMinNodes;
  const geolocates =
    minNodes != null &&
    Number.isFinite(minNodes) &&
    minNodes >= 2 &&
    sameModelHearingNodes >= Math.ceil(minNodes) &&
    azimuthAccuracyDeg != null;
  return {
    azimuthAccuracyDeg,
    rangeAccuracyM: geolocates
      ? crossBearingRangeSigmaM(rangeM, baselineM, azimuthAccuracyDeg)
      : null,
  };
}
