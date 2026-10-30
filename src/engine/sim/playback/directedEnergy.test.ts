// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { EffectorSpec, EnvironmentSpec, UasSpec } from '../model/types';
import {
  AIRFRAME_FLUENCE_FACTOR,
  DEFAULT_FLUENCE_SPREAD,
  GROUP1_QUAD_FLUENCE_J_M2,
  fluenceThresholdJm2,
  opticalDwellAt,
  opticalDwellModelApplies,
  opticalSpotAt,
  opticalTransmissionAt,
  sampledFluenceThresholdJm2,
} from './directedEnergy';

const CLEAR_AIR: EnvironmentSpec = {
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

function laser(patch: Partial<EffectorSpec> = {}): EffectorSpec {
  return {
    effectorType: 'de',
    minRangeM: 100,
    maxRangeM: 10_000,
    engageTimeS: 5,
    outputPowerKw: 100,
    beamQualityM2: 2,
    apertureM: 0.3,
    jitterUrad: 10,
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

describe('optical directed energy', () => {
  it('combines diffraction and pointing jitter by root sum square', () => {
    const spot = opticalSpotAt(10_000, 0.3, 2, 10)!;
    expect(spot.diffractionRadiusM).toBeCloseTo(0.08702666666666665, 12);
    expect(spot.jitterRadiusM).toBeCloseTo(0.1, 12);
    expect(spot.radiusM).toBeCloseTo(Math.hypot(0.08702666666666665, 0.1), 12);
    expect(spot.areaM2).toBeCloseTo(Math.PI * spot.radiusM ** 2, 12);
  });

  it('uses Koschmieder extinction only when environment physics applies', () => {
    expect(opticalTransmissionAt(CLEAR_AIR, 10_000)).toBeCloseTo(Math.exp(-3.912 / 2), 12);
    expect(opticalTransmissionAt({ ...CLEAR_AIR, apply: false }, 10_000)).toBe(1);
  });

  it('scales the calibrated fluence threshold by airframe class', () => {
    for (const [airframe, factor] of Object.entries(AIRFRAME_FLUENCE_FACTOR)) {
      expect(fluenceThresholdJm2(target(airframe as UasSpec['airframe']))).toBeCloseTo(
        GROUP1_QUAD_FLUENCE_J_M2 * factor,
        9,
      );
    }
  });

  it('uses the recorded 2 dB dwell spread by default and permits an explicit pin', () => {
    expect(DEFAULT_FLUENCE_SPREAD).toEqual({ kind: 'lognormal', sigmaDb: 2 });
    const hi = sampledFluenceThresholdJm2(100, undefined, 0.8413447460685429);
    expect(hi).toBeCloseTo(100 * 10 ** 0.2, 7);
    expect(sampledFluenceThresholdJm2(100, null, 0.8413447460685429)).toBe(100);
    expect(sampledFluenceThresholdJm2(100, undefined, undefined)).toBe(100);
  });

  it('returns null when a required physical field is missing or fallback is selected', () => {
    expect(opticalDwellModelApplies(laser())).toBe(true);
    expect(opticalDwellModelApplies(laser(), true)).toBe(false);
    expect(opticalDwellAt(laser({ outputPowerKw: null }), target(), 1000, CLEAR_AIR)).toBeNull();
    expect(opticalDwellAt(laser({ apertureM: null }), target(), 1000, CLEAR_AIR)).toBeNull();
  });
});
