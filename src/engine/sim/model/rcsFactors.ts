/**
 * Radar cross section planning factors for T&E laydown work.
 *
 * Public high-confidence sources do not consistently give radar cross section
 * by aspect and frequency, so nothing here is measured signature data. The
 * tiers are representative X/Ku-band nose-on class values that scale each
 * radar's quoted detect range to the threat in front of it.
 *
 * Anchors from vendor datasheets that condition a range on an RCS:
 *   Blighter A400/A422: 2.73 km at 0.01 m2 (DJI Phantom-class small drone),
 *   4.87 km at 0.1 m2, 8.66 km at 1.0 m2, 15.4 km at 10 m2. The four points
 *   follow the fourth-root law to within 1 percent.
 *   Echodyne EchoGuard: Phantom 4 over 1 km, Matrice 600 over 1.4 km, so
 *   the Group 2 airframe returns about 4x the Group 1 energy.
 *   HENSOLDT SPEXER 2000: UAV (0.2 m2 per trade reporting) 9 km, micro-UAV
 *   6 km, which back-solves to about 0.04 m2 for the micro-UAV line.
 */
import type { SwerlingCase, UasGroup, UasSpec } from './types';
import { PLACARD_SWERLING, SWERLING_BY_AIRFRAME } from './types';

/**
 * The RCS at which seed radar detect ranges are quoted when the source names
 * no condition: the Group 1 small-UAS class (Phantom / Mavic), m2.
 */
export const RADAR_REF_RCS_M2 = 0.01;

/** Planning-factor RCS by UAS group, m2. Representative tiers, not signature data. */
export const RCS_PLANNING_M2: Record<UasGroup, number> = {
  1: 0.01, // Phantom / Mavic / 7-inch FPV class
  2: 0.05, // Matrice 350, CW-15, Lancet class
  3: 0.2, // Shahed-136, Orlan-10, Mugin-5 class
  4: 1, // TB2, Mohajer-6 light-aircraft class
  5: 5, // Reaper class
};

/** Planning-factor RCS for a threat, m2: spec value first, then the group tier. */
export function rcsM2For(uas: UasSpec): number {
  if (uas.rcsM2 != null && Number.isFinite(uas.rcsM2) && uas.rcsM2 > 0) return uas.rcsM2;
  return RCS_PLANNING_M2[uas.group] ?? RADAR_REF_RCS_M2;
}

/** Fluctuation case for a threat: spec value first, then the airframe planning factor. */
export function swerlingFor(uas: UasSpec): SwerlingCase {
  const sw = uas.swerling;
  if (sw === 0 || sw === 1 || sw === 3) return sw;
  return SWERLING_BY_AIRFRAME[uas.airframe] ?? PLACARD_SWERLING;
}
