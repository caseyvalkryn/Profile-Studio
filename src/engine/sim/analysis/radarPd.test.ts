// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SwerlingCase, UasSpec } from '../model/types';
import { SWERLING_BY_AIRFRAME } from '../model/types';
import { swerlingFor } from '../model/rcsFactors';
import {
  mOfN,
  pdAtRange,
  pdFromSnr,
  rangeForPd,
  snrAtRange,
  snrForPd,
  type RadarCalibration,
} from './radarPd';

const db = (snr: number) => 10 * Math.log10(snr);
const lin = (dB: number) => Math.pow(10, dB / 10);

const CAL: RadarCalibration = { r0M: 4000, rcs0M2: 0.01, pd0: 0.5, pfa: 1e-6, swerling0: 1 };
const CASES: SwerlingCase[] = [0, 1, 3];

describe('pdFromSnr / snrForPd', () => {
  it('Swerling 1 at Pfa 1e-6 needs 12.8 dB for Pd 0.5 and 21.1 dB for Pd 0.9', () => {
    expect(db(snrForPd(0.5, 1e-6, 1))).toBeCloseTo(12.8, 1);
    expect(db(snrForPd(0.9, 1e-6, 1))).toBeCloseTo(21.1, 1);
  });

  // Reference: Mahafza Eq. 13.51 (np = 1) recomputed by numeric integration of
  // the Marcum Q over the 4-dof chi-square target at Pfa 1e-6: 11.954 dB
  // (Pd 0.5), 15.305 dB (Pd 0.8), 17.296 dB (Pd 0.9). No tabulated published
  // curve reading at Pfa 1e-6 was available to check; the closed form and the
  // integration agree to under 0.001 dB.
  it('Swerling 3 at Pfa 1e-6 pins three points within 0.5 dB', () => {
    expect(Math.abs(db(snrForPd(0.5, 1e-6, 3)) - 11.954)).toBeLessThan(0.5);
    expect(Math.abs(db(snrForPd(0.8, 1e-6, 3)) - 15.305)).toBeLessThan(0.5);
    expect(Math.abs(db(snrForPd(0.9, 1e-6, 3)) - 17.296)).toBeLessThan(0.5);
  });

  it('Swerling 3 sits between the non-fluctuating and Swerling 1 cases', () => {
    for (const pd of [0.5, 0.8, 0.9]) {
      expect(snrForPd(pd, 1e-6, 0)).toBeLessThan(snrForPd(pd, 1e-6, 3));
      expect(snrForPd(pd, 1e-6, 3)).toBeLessThan(snrForPd(pd, 1e-6, 1));
    }
  });

  // Nonfluctuating single pulse: the Marcum Q. Reference values from a
  // 20 000-point quadrature of the Rician density: Pd 0.9 at Pfa 1e-6 needs
  // 13.183 dB, Pd 0.5 11.243 dB, Pd 0.1 8.729 dB; at 6 dB Pd is 0.0106, at
  // 0 dB 1.22e-4.
  it('Swerling 0 is the Marcum Q: 13.18 dB at Pd 0.9, and the tail falls to Pfa', () => {
    expect(db(snrForPd(0.9, 1e-6, 0))).toBeCloseTo(13.183, 2);
    expect(db(snrForPd(0.5, 1e-6, 0))).toBeCloseTo(11.243, 2);
    expect(db(snrForPd(0.1, 1e-6, 0))).toBeCloseTo(8.729, 2);
    expect(pdFromSnr(Math.pow(10, 0.6), 1e-6, 0)).toBeCloseTo(0.0106, 4);
    expect(pdFromSnr(1, 1e-6, 0)).toBeCloseTo(1.2214e-4, 7);
    expect(pdFromSnr(0, 1e-6, 0)).toBeCloseTo(1e-6, 12);
    expect(pdFromSnr(0.1, 1e-6, 0)).toBeLessThan(1e-5);
    expect(pdFromSnr(1, 1e-4, 0)).toBeCloseTo(0.0037, 4);
    // A finite range exists at Pd 0.01 for a nonfluctuating target.
    expect(Number.isFinite(rangeForPd(CAL, CAL.rcs0M2, 0.01, 1, 0))).toBe(true);
  });

  it('snrForPd inverts pdFromSnr to 1e-6 for every case', () => {
    for (const sw of CASES) {
      for (const pd of [0.1, 0.3, 0.5, 0.7, 0.9, 0.95]) {
        for (const pfa of [1e-4, 1e-6, 1e-7]) {
          expect(Math.abs(pdFromSnr(snrForPd(pd, pfa, sw), pfa, sw) - pd)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('pdFromSnr is monotone in SNR and bounded in [0, 1]', () => {
    for (const sw of CASES) {
      let prev = 0;
      for (let dB = -20; dB <= 40; dB += 0.5) {
        const pd = pdFromSnr(lin(dB), 1e-6, sw);
        expect(pd).toBeGreaterThanOrEqual(prev);
        expect(pd).toBeLessThanOrEqual(1);
        prev = pd;
      }
    }
  });

  it('guards the edges without NaN', () => {
    for (const sw of CASES) {
      expect(pdFromSnr(0, 1e-6, sw)).toBeGreaterThan(0);
      expect(pdFromSnr(-5, 1e-6, sw)).toBe(pdFromSnr(0, 1e-6, sw));
      expect(pdFromSnr(Infinity, 1e-6, sw)).toBe(1);
      expect(pdFromSnr(NaN, 1e-6, sw)).toBe(pdFromSnr(0, 1e-6, sw));
      expect(snrForPd(0, 1e-6, sw)).toBe(0);
      expect(snrForPd(1, 1e-6, sw)).toBe(Infinity);
      expect(Number.isNaN(snrForPd(0.5, NaN, sw))).toBe(false);
    }
    expect(pdFromSnr(0, 1e-6, 1)).toBeCloseTo(1e-6, 9);
    expect(pdFromSnr(0, 1e-6, 3)).toBeCloseTo(1e-6, 9);
  });
});

describe('calibrated range law', () => {
  it('rangeForPd at the placard point returns r0M exactly', () => {
    const r = rangeForPd(CAL, CAL.rcs0M2, CAL.pd0, 1, CAL.swerling0);
    expect(Math.abs(r - CAL.r0M) / CAL.r0M).toBeLessThan(1e-9);
  });

  it('matching case at pd0 follows the fourth-root RCS law and scales by the environment factor', () => {
    for (const rcs of [0.001, 0.05, 1, 5]) {
      const law = CAL.r0M * Math.pow(rcs / CAL.rcs0M2, 0.25);
      const r = rangeForPd(CAL, rcs, CAL.pd0, 1, CAL.swerling0);
      expect(Math.abs(r - law) / law).toBeLessThan(1e-9);
      expect(rangeForPd(CAL, rcs, CAL.pd0, 0.7, CAL.swerling0)).toBe(
        CAL.r0M * 0.7 * Math.pow(rcs / CAL.rcs0M2, 0.25),
      );
    }
  });

  it('pdAtRange at rangeForPd returns the asked Pd for every case', () => {
    for (const sw of CASES) {
      for (const pd of [0.2, 0.5, 0.9]) {
        for (const m of [1, 0.6]) {
          const r = rangeForPd(CAL, 0.2, pd, m, sw);
          expect(Math.abs(pdAtRange(CAL, 0.2, r, m, sw) - pd)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('the environment multiplier enters the SNR as the fourth power', () => {
    const base = snrAtRange(CAL, 0.01, 2000, 1);
    expect(snrAtRange(CAL, 0.01, 2000, 0.5) / base).toBeCloseTo(0.0625, 9);
    expect(snrAtRange(CAL, 0.04, 2000, 1) / base).toBeCloseTo(4, 9);
    expect(snrAtRange(CAL, 0.01, 4000, 1) / base).toBeCloseTo(1 / 16, 9);
  });

  it('a higher Pd threshold shrinks the range and a bigger target grows it', () => {
    expect(rangeForPd(CAL, 0.01, 0.9, 1, 1)).toBeLessThan(CAL.r0M);
    expect(rangeForPd(CAL, 0.01, 0.2, 1, 1)).toBeGreaterThan(CAL.r0M);
    expect(rangeForPd(CAL, 1, 0.5, 1, 1)).toBeGreaterThan(CAL.r0M);
  });

  it('a calibration in one case sees a target in another through the same SNR', () => {
    const cal3: RadarCalibration = { ...CAL, swerling0: 3 };
    expect(rangeForPd(cal3, CAL.rcs0M2, 0.5, 1, 3)).toBeCloseTo(CAL.r0M, 6);
    expect(rangeForPd(cal3, CAL.rcs0M2, 0.5, 1, 1)).toBeLessThan(CAL.r0M);
  });

  it('guards the edges without NaN', () => {
    expect(rangeForPd(CAL, 0.01, 1, 1, 1)).toBe(0);
    expect(rangeForPd(CAL, 0.01, 0, 1, 1)).toBe(Infinity);
    expect(rangeForPd(CAL, 0.01, 1e-9, 1, 1)).toBe(Infinity);
    expect(pdAtRange(CAL, 0.01, 0, 1, 1)).toBe(1);
    expect(pdAtRange(CAL, 0.01, 0, 1, 3)).toBe(1);
    expect(pdAtRange(CAL, 0.01, 1e9, 1, 0)).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(rangeForPd({ ...CAL, r0M: 0 }, 0.01, 0.5, 1, 1))).toBe(false);
    expect(Number.isNaN(snrAtRange({ ...CAL, rcs0M2: 0 }, 0.01, 100, 1))).toBe(false);
  });
});

describe('mOfN', () => {
  it('matches the binomial tail', () => {
    expect(mOfN(0.5, 3, 5)).toBeCloseTo(0.5, 12);
    // 10 p^3 q^2 + 5 p^4 q + p^5 at p = 0.73.
    expect(mOfN(0.73, 3, 5)).toBeCloseTo(0.87428, 4);
    expect(mOfN(0.3, 1, 1)).toBe(0.3);
    expect(mOfN(0.3, 0, 4)).toBe(1);
    expect(mOfN(0.3, 5, 4)).toBe(0);
    expect(mOfN(1, 4, 4)).toBe(1);
    expect(mOfN(0, 1, 4)).toBe(0);
  });
});

describe('swerlingFor', () => {
  const uas = (patch: Partial<UasSpec>): UasSpec =>
    ({
      group: 1,
      airframe: 'quad',
      cruiseSpeedMps: 15,
      maxSpeedMps: 20,
      enduranceMin: 30,
      altBandFt: [100, 400],
      navMode: 'gps',
      emissionsNote: '',
      ...patch,
    }) as UasSpec;

  it('takes the spec value first', () => {
    expect(swerlingFor(uas({ airframe: 'fixed-wing', swerling: 1 }))).toBe(1);
    expect(swerlingFor(uas({ airframe: 'quad', swerling: 0 }))).toBe(0);
  });

  it('falls back to the airframe table: fixed-wing 3, everything else 1', () => {
    expect(swerlingFor(uas({ airframe: 'fixed-wing' }))).toBe(3);
    expect(swerlingFor(uas({ airframe: 'fixed-wing', swerling: null }))).toBe(3);
    for (const airframe of ['quad', 'vtol', 'one-way-attack', 'fpv'] as const) {
      expect(swerlingFor(uas({ airframe }))).toBe(1);
      expect(SWERLING_BY_AIRFRAME[airframe]).toBe(1);
    }
  });
});
