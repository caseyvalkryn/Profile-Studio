// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SensorSpec, SwerlingCase } from '../model/types';
import {
  RADAR_DWELL_PRF_HZ,
  radarDwellPulses,
  shnidmanPdFromSnr,
  shnidmanSnrForPd,
} from './radarDwell';

const RADAR: SensorSpec = {
  sensorType: 'radar',
  detectRangeM: 1_000,
  classifyRangeM: null,
  sectorDeg: 360,
};

describe('radarDwellPulses', () => {
  it('prefers a stated pulse count and otherwise derives one from dwell time at 5 kHz', () => {
    expect(radarDwellPulses({ ...RADAR, pulsesPerDwell: 11, dwellTimeS: 0.02 })).toBe(11);
    expect(radarDwellPulses({ ...RADAR, pulsesPerDwell: null, dwellTimeS: 0.02 })).toBe(100);
    expect(radarDwellPulses({ ...RADAR, dwellTimeS: 0.033 })).toBe(165);
    expect(RADAR_DWELL_PRF_HZ).toBe(5_000);
  });

  it('returns null when neither dwell field carries a positive finite value', () => {
    expect(radarDwellPulses(RADAR)).toBeNull();
    expect(radarDwellPulses({ ...RADAR, pulsesPerDwell: null, dwellTimeS: null })).toBeNull();
    expect(radarDwellPulses({ ...RADAR, pulsesPerDwell: 0, dwellTimeS: 0 })).toBeNull();
  });
});

describe('Shnidman inverse', () => {
  it('round-trips Pd through required per-pulse SNR for every carried Swerling case', () => {
    for (const swerling of [0, 1, 3] as SwerlingCase[]) {
      for (const pulses of [1, 10, 100]) {
        for (const pd of [0.1, 0.5, 0.872, 0.9, 0.99]) {
          const snr = shnidmanSnrForPd(pd, 1e-6, pulses, swerling);
          expect(shnidmanPdFromSnr(snr, 1e-6, pulses, swerling)).toBeCloseTo(pd, 7);
        }
      }
    }
  });

  it('is monotone and guards the physical probability bounds', () => {
    for (const swerling of [0, 1, 3] as SwerlingCase[]) {
      expect(shnidmanPdFromSnr(0, 1e-6, 20, swerling)).toBe(1e-6);
      expect(shnidmanPdFromSnr(Infinity, 1e-6, 20, swerling)).toBe(1);
      let prior = 0;
      for (let db = -20; db <= 30; db += 1) {
        const pd = shnidmanPdFromSnr(Math.pow(10, db / 10), 1e-6, 20, swerling);
        expect(pd).toBeGreaterThanOrEqual(prior);
        expect(pd).toBeLessThanOrEqual(1);
        prior = pd;
      }
    }
  });
});
