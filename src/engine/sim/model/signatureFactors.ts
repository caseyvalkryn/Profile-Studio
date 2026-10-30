/**
 * EO/IR and acoustic signature planning factors for T&E laydown work. Every
 * quoted sensor range is conditioned on a reference target; group tiers fill
 * the blanks and a sourced per-model value overrides the tier. Nothing here
 * is measured signature data.
 *
 * Span: the Johnson criteria put a fixed number of resolvable line pairs
 * across a target's critical dimension for detection, so at fixed optics the
 * range scales linearly with that dimension.
 *
 * Acoustic: broadband source levels are class values. Small electric
 * multirotors sit in the 60-80 dB band at 1 m; piston and turbojet
 * one-way-attack airframes sit at 90-105 dB.
 */
import type { IrSignature, UasGroup, UasSpec } from './types';

/** Planning-factor characteristic dimension by UAS group, meters. */
export const SPAN_PLANNING_M: Record<UasGroup, number> = {
  1: 0.4, // Mavic / 7-inch FPV class diagonal
  2: 1.2, // Matrice 350 / Lancet class
  3: 3, // Shahed-136 / Orlan-10 wingspan class
  4: 10, // TB2 / Mohajer-6 wingspan class
  5: 20, // Reaper class
};

/** The span at which EO/IR detect ranges are quoted when the source names no target. */
export const EO_REF_SPAN_M = SPAN_PLANNING_M[1];

/** Characteristic dimension for a threat, meters: spec value first, then the group tier. */
export function spanMFor(uas: UasSpec): number {
  if (uas.spanM != null && Number.isFinite(uas.spanM) && uas.spanM > 0) return uas.spanM;
  return SPAN_PLANNING_M[uas.group] ?? EO_REF_SPAN_M;
}

/** Thermal-channel range multiplier by contrast class. */
export const IR_SIGNATURE_FACTOR: Record<IrSignature, number> = {
  low: 0.7,
  medium: 0.85,
  high: 1,
};

/**
 * Thermal contrast class: spec value first, then the airframe default.
 * Electric multirotor, FPV and VTOL airframes carry small motors and no
 * exhaust (low); fixed-wing and one-way-attack airframes carry a piston or
 * jet engine (high). A seed may override, e.g. an electric pusher OWA.
 */
export function irSignatureFor(uas: UasSpec): IrSignature {
  if (uas.irSignature) return uas.irSignature;
  return uas.airframe === 'fixed-wing' || uas.airframe === 'one-way-attack' ? 'high' : 'low';
}

/** Planning-factor broadband source level by UAS group, dB re 20 uPa at 1 m. */
export const ACOUSTIC_PLANNING_DB: Record<UasGroup, number> = {
  1: 70,
  2: 80,
  3: 95,
  4: 100,
  5: 105,
};

/** The source level at which acoustic detect ranges are quoted when the source names no target. */
export const ACOUSTIC_REF_DB = ACOUSTIC_PLANNING_DB[1];

/** Broadband source level for a threat, dB at 1 m: spec value first, then the group tier. */
export function acousticDbFor(uas: UasSpec): number {
  if (uas.acousticDb != null && Number.isFinite(uas.acousticDb) && uas.acousticDb > 0) {
    return uas.acousticDb;
  }
  return ACOUSTIC_PLANNING_DB[uas.group] ?? ACOUSTIC_REF_DB;
}
