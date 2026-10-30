// @vitest-environment node
import { expect, it } from 'vitest';
import type { EffectorSpec } from '../model/types';
import {
  lastProjectileEffectS,
  projectileBurstDurationS,
  projectileCount,
  projectileFlightTimeS,
  projectileSpacingS,
} from './ballistics';

const gun = {
  effectorType: 'gun',
  minRangeM: 0,
  maxRangeM: 3000,
  engageTimeS: 0,
  burstRounds: 20,
  rateOfFireRpm: 1200,
  muzzleVelocityMps: 1050,
} as EffectorSpec;

it('resolves projectile count, cyclic spacing and burst duration', () => {
  expect(projectileCount(gun)).toBe(20);
  expect(projectileSpacingS(1200)).toBe(0.05);
  expect(projectileBurstDurationS(gun)).toBe(1);
  expect(projectileCount({ ...gun, burstRounds: 19.6 })).toBe(20);
});

it('uses drag-free slant distance for flight and the last-projectile effect', () => {
  expect(projectileFlightTimeS(1050, 1050)).toBe(1);
  // Commit 10 s + one-second burst + 1050 m / 1050 m/s = effect at 12 s.
  expect(lastProjectileEffectS(10, 1050, gun)).toBe(12);
  expect(projectileFlightTimeS(1, 0)).toBeNull();
});
