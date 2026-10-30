// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { EffectorSpec, UasSpec } from '../model/types';
import {
  HPM_EFFECT_THRESHOLD_VM,
  assessHpmField,
  hpmFieldModelApplies,
  hpmFieldStrengthAtVm,
  hpmRechargeS,
  hpmThresholdRangeM,
} from './hpm';

function hpm(patch: Partial<EffectorSpec> = {}): EffectorSpec {
  return {
    effectorType: 'hpm',
    minRangeM: 0,
    maxRangeM: 4000,
    engageTimeS: 1,
    fieldStrengthVm: 200,
    fieldStrengthRangeM: 100,
    beamwidthDeg: 60,
    rechargeS: 0.75,
    ...patch,
  };
}

function target(airframe: UasSpec['airframe'] = 'quad'): UasSpec {
  return {
    group: 1,
    airframe,
    cruiseSpeedMps: 15,
    maxSpeedMps: 20,
    enduranceMin: 30,
    altBandFt: [0, 400],
    navMode: 'gps',
    emissionsNote: '',
  };
}

describe('HPM field effect', () => {
  it('falls by inverse distance and solves each airframe threshold ring', () => {
    expect(hpmFieldStrengthAtVm(hpm(), 400)).toBeCloseTo(50, 12);
    expect(hpmThresholdRangeM(hpm(), target('quad'))).toBeCloseTo(1000, 12);
    expect(hpmThresholdRangeM(hpm(), target('one-way-attack'))).toBeCloseTo(100, 12);
    expect(HPM_EFFECT_THRESHOLD_VM.fpv).toBe(10);
  });

  it('requires both threshold closure and the half-beamwidth gate', () => {
    expect(assessHpmField(hpm(), target(), 900, 30)).toMatchObject({
      effective: true,
      insideBeam: true,
    });
    expect(assessHpmField(hpm(), target(), 900, 30.01)).toMatchObject({
      effective: false,
      insideBeam: false,
    });
    expect(assessHpmField(hpm(), target(), 1001, 0)?.effective).toBe(false);
  });

  it('uses recharge as cooldown and keeps legacy cooldown without a valid recharge', () => {
    expect(hpmRechargeS(hpm(), 4)).toBe(0.75);
    expect(hpmRechargeS(hpm({ rechargeS: null }), 4)).toBe(4);
    expect(hpmRechargeS(hpm({ rechargeS: -1 }), 4)).toBe(4);
  });

  it('does not model a null reference field or an explicit fallback', () => {
    expect(hpmFieldModelApplies(hpm())).toBe(true);
    expect(hpmFieldModelApplies(hpm(), true)).toBe(false);
    expect(hpmFieldStrengthAtVm(hpm({ fieldStrengthVm: null }), 100)).toBeNull();
  });
});
