import type { EffectorSpec, UasSpec } from '../model/types';

/**
 * RF-field effector model.
 *
 * MIL-STD-461G table XI gives RS103 radiated-susceptibility test levels of
 * 10, 20, 50 and 200 V/m for different DoD equipment/platform environments.
 * RangeBoard uses those published severity levels as an explicit planning
 * ladder for target airframes; the standard does not state UAS defeat
 * thresholds and these values must not be read as measured HPM lethality.
 * Source, read 2026-09-10:
 * https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=35789
 *
 * AFRL reports THOR's pulse effect as instantaneous and its swarm firing as
 * near-continuous. The seed recharge remains the timing input; no additional
 * pulse dwell is invented here.
 * https://afresearchlab.com/counter-swarm-high-power-weapon/
 * https://afresearchlab.com/news/afrl-conducts-swarm-technology-demonstration/
 */

/** Planning susceptibility ladder from the RS103 severity levels. */
export const HPM_EFFECT_THRESHOLD_VM: Readonly<Record<UasSpec['airframe'], number>> = Object.freeze(
  {
    fpv: 10,
    quad: 20,
    vtol: 50,
    'fixed-wing': 50,
    'one-way-attack': 200,
  },
);

export interface HpmFieldAssessment {
  effective: boolean;
  fieldStrengthVm: number;
  thresholdVm: number;
  thresholdRangeM: number;
  insideBeam: boolean;
}

/** True when the RF-field law has every field it needs. */
export function hpmFieldModelApplies(spec: EffectorSpec, fallback = false): boolean {
  return (
    !fallback &&
    spec.effectorType === 'hpm' &&
    spec.fieldStrengthVm != null &&
    Number.isFinite(spec.fieldStrengthVm) &&
    spec.fieldStrengthVm > 0 &&
    spec.fieldStrengthRangeM != null &&
    Number.isFinite(spec.fieldStrengthRangeM) &&
    spec.fieldStrengthRangeM > 0 &&
    spec.beamwidthDeg != null &&
    Number.isFinite(spec.beamwidthDeg) &&
    spec.beamwidthDeg > 0
  );
}

/** Far-field electric field by inverse distance from the stated reference point. */
export function hpmFieldStrengthAtVm(spec: EffectorSpec, rangeM: number): number | null {
  if (!hpmFieldModelApplies(spec) || !(rangeM > 0) || !Number.isFinite(rangeM)) return null;
  return spec.fieldStrengthVm! * (spec.fieldStrengthRangeM! / rangeM);
}

/** Range where the inverse-distance field equals one airframe's threshold. */
export function hpmThresholdRangeM(spec: EffectorSpec, uas?: UasSpec): number | null {
  if (!hpmFieldModelApplies(spec)) return null;
  const thresholdVm = HPM_EFFECT_THRESHOLD_VM[uas?.airframe ?? 'quad'];
  return (spec.fieldStrengthVm! * spec.fieldStrengthRangeM!) / thresholdVm;
}

/** Field closure and half-power beamwidth gate at one target position. */
export function assessHpmField(
  spec: EffectorSpec,
  uas: UasSpec | undefined,
  rangeM: number,
  offBoresightDeg = 0,
): HpmFieldAssessment | null {
  const fieldStrengthVm = hpmFieldStrengthAtVm(spec, rangeM);
  const thresholdRangeM = hpmThresholdRangeM(spec, uas);
  if (fieldStrengthVm == null || thresholdRangeM == null) return null;
  const thresholdVm = HPM_EFFECT_THRESHOLD_VM[uas?.airframe ?? 'quad'];
  const insideBeam =
    Number.isFinite(offBoresightDeg) && Math.abs(offBoresightDeg) <= spec.beamwidthDeg! / 2;
  return {
    effective: insideBeam && fieldStrengthVm >= thresholdVm,
    fieldStrengthVm,
    thresholdVm,
    thresholdRangeM,
    insideBeam,
  };
}

/** HPM cooldown: recharge replaces the legacy salvo cooldown when stated. */
export function hpmRechargeS(spec: EffectorSpec, legacyCooldownS: number): number {
  if (
    spec.effectorType === 'hpm' &&
    spec.rechargeS != null &&
    Number.isFinite(spec.rechargeS) &&
    spec.rechargeS >= 0
  )
    return spec.rechargeS;
  return legacyCooldownS;
}
