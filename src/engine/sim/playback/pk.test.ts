// @vitest-environment node
import { expect, it } from 'vitest';
import type { EffectorSpec, UasSpec } from '../model/types';
import { kineticPk, missDistanceSigmaM } from './pk';
import {
  gunBurstModelApplies,
  interceptorMissModelApplies,
  kineticEffectProbability,
  projectileMissSigmaM,
  rayleighProbabilityWithin,
} from './pk/kinetic';

it('kineticPk multiplies base Pk by falloff, size penalty and fpv evasion, zero past max range', () => {
  const fpv = { group: 1, airframe: 'fpv' } as UasSpec;
  // 0.8 * (1 - 0.3 * 0.5) * 0.7 (group 1) * 0.7 (fpv) = 0.3332
  expect(kineticPk(0.8, 10000, fpv, 5000)).toBeCloseTo(0.3332, 9);
  const fixed = { group: 4, airframe: 'fixed-wing' } as UasSpec;
  expect(kineticPk(0.8, 10000, fixed, 0)).toBeCloseTo(0.8, 9);
  expect(kineticPk(0.8, 10000, undefined, 10000.5)).toBe(0);
});

it('missDistanceSigmaM is the root sum square of prediction and guidance error', () => {
  expect(missDistanceSigmaM(null, 40)).toBe(40);
  // sqrt(30^2 + 40^2) = 50
  expect(missDistanceSigmaM(30, 40)).toBeCloseTo(50, 12);
  expect(missDistanceSigmaM(0, 7)).toBeCloseTo(7, 12);
});

it('maps an isotropic miss through the Rayleigh CDF', () => {
  expect(rayleighProbabilityWithin(0, 1)).toBe(0);
  expect(rayleighProbabilityWithin(1, 0)).toBe(1);
  expect(rayleighProbabilityWithin(10, 5)).toBeCloseTo(1 - Math.exp(-2), 12);
});

it('requires finite physical interceptor fields at their correct numeric boundaries', () => {
  const interceptor = {
    effectorType: 'interceptor',
    minRangeM: 0,
    maxRangeM: 10000,
    engageTimeS: 0,
    lethalRadiusM: 10,
    guidanceNoiseM: 0,
    flyoutSpeedMps: 100,
  } as EffectorSpec;

  expect(interceptorMissModelApplies(interceptor)).toBe(true);
  expect(interceptorMissModelApplies({ ...interceptor, lethalRadiusM: Number.MIN_VALUE })).toBe(
    true,
  );
  expect(interceptorMissModelApplies({ ...interceptor, flyoutSpeedMps: Number.MIN_VALUE })).toBe(
    true,
  );
  expect(interceptorMissModelApplies({ ...interceptor, guidanceNoiseM: null })).toBe(false);
  expect(interceptorMissModelApplies({ ...interceptor, guidanceNoiseM: -Number.MIN_VALUE })).toBe(
    false,
  );
  expect(interceptorMissModelApplies({ ...interceptor, guidanceNoiseM: Number.NaN })).toBe(false);
  expect(
    interceptorMissModelApplies({ ...interceptor, guidanceNoiseM: Number.POSITIVE_INFINITY }),
  ).toBe(false);
  expect(interceptorMissModelApplies({ ...interceptor, lethalRadiusM: 0 })).toBe(false);
  expect(
    interceptorMissModelApplies({ ...interceptor, lethalRadiusM: Number.POSITIVE_INFINITY }),
  ).toBe(false);
  expect(interceptorMissModelApplies({ ...interceptor, flyoutSpeedMps: 0 })).toBe(false);
  expect(
    interceptorMissModelApplies({ ...interceptor, flyoutSpeedMps: Number.POSITIVE_INFINITY }),
  ).toBe(false);
  expect(interceptorMissModelApplies(interceptor, true)).toBe(false);
});

it('combines projectile angular error with track error in meters', () => {
  // 3 km * hypot(1, 1) mrad = 4.2426 m, then RSS with 3 m track error = 5.1962 m.
  expect(projectileMissSigmaM(3000, 1, 1, 3)).toBeCloseTo(Math.sqrt(27), 12);
});

it('uses the explicit fallback unchanged and compounds projectile intercepts by burst', () => {
  const uas = {
    group: 1,
    airframe: 'quad',
    spanM: 0.4,
    cruiseSpeedMps: 15,
    maxSpeedMps: 20,
    enduranceMin: 30,
    altBandFt: [0, 400],
    navMode: 'gps',
    emissionsNote: '',
  } as UasSpec;
  const gun = {
    effectorType: 'gun',
    minRangeM: 0,
    maxRangeM: 3000,
    engageTimeS: 0,
    dispersionMils: 1,
    fireControlErrorMils: 1,
    burstRounds: 20,
    rateOfFireRpm: 1200,
    muzzleVelocityMps: 1050,
  } as EffectorSpec;
  const context = { basePk: 0.8, uas, slantM: 1000, predictionSigmaM: 0, fallback: false };
  const sigma = Math.sqrt(2);
  const perProjectile = 1 - Math.exp(-(0.2 ** 2) / (2 * sigma ** 2));
  expect(kineticEffectProbability(gun, context)).toBeCloseTo(1 - (1 - perProjectile) ** 20, 12);
  expect(kineticEffectProbability(gun, { ...context, fallback: true })).toBe(
    kineticPk(context.basePk, gun.maxRangeM, uas, context.slantM),
  );
  expect(kineticEffectProbability({ ...gun, dispersionMils: null }, context)).toBe(
    kineticPk(context.basePk, gun.maxRangeM, uas, context.slantM),
  );

  expect(gunBurstModelApplies(gun)).toBe(true);
  expect(gunBurstModelApplies(gun, true)).toBe(false);
  const legacy = kineticPk(context.basePk, gun.maxRangeM, uas, context.slantM);
  for (const field of [
    'dispersionMils',
    'fireControlErrorMils',
    'burstRounds',
    'rateOfFireRpm',
    'muzzleVelocityMps',
  ] as const) {
    const partial = { ...gun, [field]: null };
    expect(gunBurstModelApplies(partial)).toBe(false);
    expect(kineticEffectProbability(partial, context)).toBe(legacy);
  }
  expect(gunBurstModelApplies({ ...gun, burstRounds: 0 })).toBe(false);
  expect(gunBurstModelApplies({ ...gun, rateOfFireRpm: 0 })).toBe(false);
  expect(gunBurstModelApplies({ ...gun, muzzleVelocityMps: Number.POSITIVE_INFINITY })).toBe(false);
  expect(gunBurstModelApplies({ ...gun, fireControlErrorMils: 0 })).toBe(true);
  expect(gunBurstModelApplies({ ...gun, dispersionMils: -Number.MIN_VALUE })).toBe(false);
});
