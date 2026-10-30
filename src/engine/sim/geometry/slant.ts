/**
 * Vertical geometry for a plan-view board: slant range, ground projection,
 * elevation angle and the radio horizon. Meters and degrees. Pure math.
 */

const DEG = 180 / Math.PI;

/**
 * Radio-horizon constant, meters per square root of a meter. The standard
 * radio line-of-sight formula is d_km = 4.12 * sqrt(h_m), so d_m = 4120 *
 * sqrt(h_m). The 4.12 already carries the 4/3 earth-radius refraction factor
 * (the geometric horizon constant is 3.57).
 */
const HORIZON_K_M = 4120;

/** Slant range for a ground range and an altitude difference, meters. */
export function slantRangeM(groundM: number, dAltM: number): number {
  return Math.hypot(groundM, dAltM);
}

/**
 * Ground projection of a slant range, meters. Returns 0 when the altitude
 * difference is at or beyond the slant range, so a ring never gets a
 * negative or imaginary radius.
 */
export function groundRangeM(slantM: number, dAltM: number): number {
  return Math.sqrt(Math.max(0, slantM * slantM - dAltM * dAltM));
}

/**
 * Elevation angle from the observer to the target, degrees. Positive above
 * the horizontal, negative below it.
 */
export function elevationDeg(groundM: number, dAltM: number): number {
  return Math.atan2(dAltM, groundM) * DEG;
}

/**
 * 4/3 earth radio horizon between two heights, meters:
 * 4120 * (sqrt(h1) + sqrt(h2)). From the standard radio line-of-sight
 * formula d_km = 4.12 * sqrt(h_m), applied to each end of the path.
 * A negative height clamps to 0.
 */
export function radioHorizonM(h1M: number, h2M: number): number {
  return HORIZON_K_M * (Math.sqrt(Math.max(0, h1M)) + Math.sqrt(Math.max(0, h2M)));
}
