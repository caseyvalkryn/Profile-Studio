import type { JamBand } from '../model/types';

/** Exact speed of light in vacuum, meters per second. */
const C_MPS = 299_792_458;

/**
 * Representative center frequency of each coarse planning band, hertz.
 *
 * GNSS is GPS L1 (IS-GPS-800J, 1575.42 MHz). UHF-433 is the midpoint of
 * ETSI's 433.05 to 434.79 MHz SRD interval. The other centers are the
 * midpoints of the FCC Part 15.247 intervals 902 to 928, 2400 to 2483.5,
 * and 5725 to 5850 MHz.
 * Sources, read 2026-09-10:
 * https://www.gps.gov/sites/default/files/2025-07/IS-GPS-800J.pdf
 * https://www.etsi.org/deliver/etsi_en/302000_302099/3020650401/02.01.00_20/en_3020650401v020100a.pdf
 * https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-15/subpart-C/section-15.247
 */
export const RF_BAND_CENTER_HZ: Readonly<Record<JamBand, number>> = Object.freeze({
  gnss: 1_575_420_000,
  'uhf-433': 433_920_000,
  'ism-915': 915_000_000,
  'ism-2400': 2_441_750_000,
  'ism-5800': 5_787_500_000,
});

/**
 * Fixed urban excess-loss term, dB. ITU-R P.1411-9 equation 61 defines
 * Lurban as 6.8 dB for its urban category. RangeBoard carries that term as
 * a coarse margin on top of free space rather than claiming the full model.
 * Source, read 2026-09-10:
 * https://www.itu.int/dms_pubrec/itu-r/rec/p/R-REC-P.1411-9-201706-I%21%21PDF-E.pdf
 */
export const URBAN_EXCESS_LOSS_DB = 6.8;

/** Center frequency for one modeled band, hertz. */
export function bandCenterHz(band: JamBand): number {
  return RF_BAND_CENTER_HZ[band];
}

/** EIRP in watts to dBW. Zero or an invalid power is RF silent. */
export function wattsToDbw(powerW: number): number {
  return Number.isFinite(powerW) && powerW > 0 ? 10 * Math.log10(powerW) : Number.NEGATIVE_INFINITY;
}

/**
 * Free-space basic transmission loss in dB from ITU-R P.525:
 * Lbf = 20 log10(4 pi d f / c). The point at zero range carries no path loss.
 * Source, read 2026-09-10:
 * https://www.itu.int/rec/R-REC-P.525-5-202411-I/en
 */
export function freeSpacePathLossDb(rangeM: number, frequencyHz: number): number {
  if (!Number.isFinite(rangeM) || rangeM < 0) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return Number.POSITIVE_INFINITY;
  if (rangeM === 0) return 0;
  return 20 * Math.log10((4 * Math.PI * rangeM * frequencyHz) / C_MPS);
}

/**
 * Isotropically received power in dBm. `additionalLossDb` carries propagation
 * losses outside free space, such as the fixed urban margin.
 */
export function receivedPowerDbm(
  radiatedPowerW: number,
  rangeM: number,
  band: JamBand,
  additionalLossDb = 0,
): number {
  if (!Number.isFinite(additionalLossDb) || additionalLossDb < 0) return Number.NEGATIVE_INFINITY;
  const eirpDbw = wattsToDbw(radiatedPowerW);
  if (!Number.isFinite(eirpDbw)) return Number.NEGATIVE_INFINITY;
  return eirpDbw + 30 - freeSpacePathLossDb(rangeM, bandCenterHz(band)) - additionalLossDb;
}

/** Received-power margin over the receiver sensitivity, dB. */
export function linkMarginDb(
  radiatedPowerW: number,
  rangeM: number,
  band: JamBand,
  receiverSensitivityDbm: number,
  additionalLossDb = 0,
): number {
  if (!Number.isFinite(receiverSensitivityDbm)) return Number.NEGATIVE_INFINITY;
  return receivedPowerDbm(radiatedPowerW, rangeM, band, additionalLossDb) - receiverSensitivityDbm;
}

/**
 * Range in meters where received power equals sensitivity. This is the
 * inverse of receivedPowerDbm under the same band and additional loss.
 */
export function linkBudgetRangeM(
  radiatedPowerW: number,
  band: JamBand,
  receiverSensitivityDbm: number,
  additionalLossDb = 0,
): number {
  if (!(radiatedPowerW > 0) || !Number.isFinite(radiatedPowerW)) return 0;
  if (!Number.isFinite(receiverSensitivityDbm)) return 0;
  if (!Number.isFinite(additionalLossDb) || additionalLossDb < 0) return 0;
  const allowableLossDb =
    wattsToDbw(radiatedPowerW) + 30 - receiverSensitivityDbm - additionalLossDb;
  return (C_MPS / (4 * Math.PI * bandCenterHz(band))) * Math.pow(10, allowableLossDb / 20);
}

/** Convert an SNR difference in dB to a linear power ratio. */
export function snrRatio(relativeSnrDb: number): number {
  return Number.isFinite(relativeSnrDb) ? Math.pow(10, relativeSnrDb / 10) : 0;
}

/**
 * Direction-finding 1-sigma error under the Cramer-Rao SNR law. The input
 * ratio is SNR / reference SNR. Error scales as 1 / sqrt(ratio), while the
 * published seed accuracy is the best supported floor.
 */
export function directionFindingAccuracyDeg(
  seedAccuracyDeg: number,
  snrOverReference: number,
): number | null {
  if (!(seedAccuracyDeg > 0) || !Number.isFinite(seedAccuracyDeg)) return null;
  if (!(snrOverReference > 0) || !Number.isFinite(snrOverReference)) return null;
  return Math.max(seedAccuracyDeg, seedAccuracyDeg / Math.sqrt(snrOverReference));
}

/** Cross-range 1-sigma error at one range from a bearing 1-sigma error. */
export function crossRangeSigmaM(rangeM: number, azimuthAccuracyDeg: number): number | null {
  if (!(rangeM >= 0) || !Number.isFinite(rangeM)) return null;
  if (!(azimuthAccuracyDeg > 0) || !Number.isFinite(azimuthAccuracyDeg)) return null;
  return rangeM * ((azimuthAccuracyDeg * Math.PI) / 180);
}

/**
 * Broadside cross-bearing range uncertainty for a node baseline B:
 * sigma_range = (R / B) sigma_cross = R^2 sigma_az_rad / B.
 * At R = B the range sigma is the cross-range sigma at the baseline geometry.
 */
export function crossBearingRangeSigmaM(
  rangeM: number,
  baselineM: number,
  azimuthAccuracyDeg: number,
): number | null {
  if (!(baselineM > 0) || !Number.isFinite(baselineM)) return null;
  const crossRangeM = crossRangeSigmaM(rangeM, azimuthAccuracyDeg);
  return crossRangeM == null ? null : (rangeM / baselineM) * crossRangeM;
}
