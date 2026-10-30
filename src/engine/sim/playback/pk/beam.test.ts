// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { EffectorSpec, EnvironmentSpec, UasSpec } from '../../model/types';
import { beamEffect } from './beam';
import { kineticPk } from './kinetic';

const ENV: EnvironmentSpec = {
  windSpeedMps: 0,
  windFromDeg: 0,
  temperatureC: 15,
  fieldElevationFt: 0,
  precipitation: 'clear',
  light: 'day',
  emBackground: 'rural',
  visibilityM: 20_000,
  apply: true,
};

const UAS: UasSpec = {
  group: 1,
  airframe: 'quad',
  cruiseSpeedMps: 15,
  maxSpeedMps: 20,
  enduranceMin: 30,
  altBandFt: [0, 400],
  navMode: 'gps',
  emissionsNote: '',
};

function effector(
  type: EffectorSpec['effectorType'],
  patch: Partial<EffectorSpec> = {},
): EffectorSpec {
  return {
    effectorType: type,
    minRangeM: 0,
    maxRangeM: 10_000,
    engageTimeS: 5,
    ...patch,
  };
}

describe('beamEffect', () => {
  it('uses optical dwell and does not apply kinetic range or target penalties', () => {
    const spec = effector('de', {
      outputPowerKw: 100,
      beamQualityM2: 2,
      apertureM: 0.3,
      jitterUrad: 10,
    });
    const effect = beamEffect(0.8, spec, UAS, 10_000, ENV, {
      legacyCooldownS: 5,
      fluenceSpread: null,
    });
    expect(effect.mode).toBe('de-dwell');
    expect(effect.pk).toBe(0.8);
    expect(effect.dwellS).toBeCloseTo(2, 12);
    expect(effect.effectDelayS).toBeCloseTo(3, 12);
  });

  it('uses HPM field closure and recharge', () => {
    const spec = effector('hpm', {
      fieldStrengthVm: 200,
      fieldStrengthRangeM: 100,
      beamwidthDeg: 60,
      rechargeS: 0.75,
    });
    expect(beamEffect(0.8, spec, UAS, 900, ENV, { legacyCooldownS: 5 })).toMatchObject({
      mode: 'hpm-field',
      pk: 0.8,
      cooldownS: 0.75,
    });
    expect(beamEffect(0.8, spec, UAS, 1100, ENV, { legacyCooldownS: 5 }).pk).toBe(0);
  });

  it('keeps kineticPk bit for bit under the switch and null physical fields', () => {
    const rangeM = 5000;
    const expected = kineticPk(0.8, 10_000, UAS, rangeM);
    const optical = effector('de', {
      outputPowerKw: 100,
      beamQualityM2: 2,
      apertureM: 0.3,
      jitterUrad: 10,
    });
    expect(
      beamEffect(0.8, optical, UAS, rangeM, ENV, {
        legacyCooldownS: 5,
        fallback: true,
      }).pk,
    ).toBe(expected);
    expect(
      beamEffect(0.8, { ...optical, outputPowerKw: null }, UAS, rangeM, ENV, {
        legacyCooldownS: 5,
      }).pk,
    ).toBe(expected);
    const rf = effector('hpm', { fieldStrengthVm: null });
    expect(beamEffect(0.8, rf, UAS, rangeM, ENV, { legacyCooldownS: 5 }).pk).toBe(expected);
  });
});
