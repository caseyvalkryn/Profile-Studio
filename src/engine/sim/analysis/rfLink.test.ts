// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  RF_BAND_CENTER_HZ,
  URBAN_EXCESS_LOSS_DB,
  bandCenterHz,
  crossBearingRangeSigmaM,
  crossRangeSigmaM,
  directionFindingAccuracyDeg,
  freeSpacePathLossDb,
  linkBudgetRangeM,
  linkMarginDb,
  receivedPowerDbm,
  snrRatio,
  wattsToDbw,
} from './rfLink';

describe('RF band centers and link budget', () => {
  it('uses the center of each sourced band interval', () => {
    expect(RF_BAND_CENTER_HZ).toEqual({
      gnss: 1_575_420_000,
      'uhf-433': 433_920_000,
      'ism-915': 915_000_000,
      'ism-2400': 2_441_750_000,
      'ism-5800': 5_787_500_000,
    });
    expect(bandCenterHz('ism-2400')).toBe(2_441_750_000);
  });

  it('computes free-space loss and received dBm with consistent units', () => {
    // ITU-R P.525 at 1 km and the 2.4 GHz band center: 100.2018 dB.
    expect(freeSpacePathLossDb(1000, bandCenterHz('ism-2400'))).toBeCloseTo(100.2018, 4);
    expect(wattsToDbw(2)).toBeCloseTo(3.0103, 4);
    expect(receivedPowerDbm(2, 1000, 'ism-2400')).toBeCloseTo(-67.1915, 4);
    expect(linkMarginDb(2, 1000, 'ism-2400', -90)).toBeCloseTo(22.8085, 4);
  });

  it('solves the received-power threshold and applies urban loss once', () => {
    const ruralM = linkBudgetRangeM(0.4, 'ism-5800', -90);
    const urbanM = linkBudgetRangeM(0.4, 'ism-5800', -90, URBAN_EXCESS_LOSS_DB);
    expect(ruralM).toBeCloseTo(2607.0528, 4);
    expect(receivedPowerDbm(0.4, ruralM, 'ism-5800')).toBeCloseTo(-90, 10);
    expect(urbanM / ruralM).toBeCloseTo(Math.pow(10, -URBAN_EXCESS_LOSS_DB / 20), 12);
    expect(receivedPowerDbm(0.4, urbanM, 'ism-5800', URBAN_EXCESS_LOSS_DB)).toBeCloseTo(-90, 10);
  });

  it('treats zero or invalid inputs as no usable link', () => {
    expect(wattsToDbw(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(linkBudgetRangeM(0, 'ism-2400', -90)).toBe(0);
    expect(receivedPowerDbm(2, -1, 'ism-2400')).toBe(Number.NEGATIVE_INFINITY);
    expect(linkBudgetRangeM(2, 'ism-2400', Number.NaN)).toBe(0);
  });
});

describe('RF direction finding and cross-bearing geometry', () => {
  it('uses the inverse square-root SNR law with the seed as the best floor', () => {
    expect(snrRatio(-6.020599913)).toBeCloseTo(0.25, 10);
    expect(directionFindingAccuracyDeg(5, 0.25)).toBeCloseTo(10);
    expect(directionFindingAccuracyDeg(5, 1)).toBe(5);
    expect(directionFindingAccuracyDeg(5, 4)).toBe(5);
    expect(directionFindingAccuracyDeg(0, 1)).toBeNull();
  });

  it('turns bearing error into cross-range and broadside range sigma', () => {
    // At R = 2 km and sigma_az = 5 deg: sigma_cross = 2000 * 5 pi/180
    // = 174.533 m. With B = 1 km, sigma_range = R/B * sigma_cross
    // = 349.066 m. At B = R, the two sigmas are equal.
    const crossM = crossRangeSigmaM(2000, 5)!;
    expect(crossM).toBeCloseTo(174.5329, 4);
    expect(crossBearingRangeSigmaM(2000, 1000, 5)).toBeCloseTo(349.0659, 4);
    expect(crossBearingRangeSigmaM(2000, 2000, 5)).toBeCloseTo(crossM, 10);
    expect(crossBearingRangeSigmaM(2000, 0, 5)).toBeNull();
  });
});
