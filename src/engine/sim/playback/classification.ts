import type { ClassificationBand, ClassificationMatrix, SensorSpec } from '../model/types';
import type { DrawPolicy } from './policy';

/**
 * Classification by confusion matrix. A sensor whose spec carries
 * a `ClassificationMatrix` declares a track's class from the range band the
 * track sits in: with probability `pCorrect` a hostile track is declared
 * hostile after the band's `timeToDeclareS`; a non-hostile track is declared
 * hostile with `pFalseHostile`. The outcome is one draw per declaration
 * attempt through `DrawPolicy.classify` (kind 8, keyed by sensor, threat and
 * step); the deterministic policy returns 0.5, so a band declares a hostile
 * track when `pCorrect > 0.5` and never declares a false hostile with
 * `pFalseHostile <= 0.5`. A sensor without a matrix leaves the rule ladder
 * of sim.ts to classify as before.
 */

/** Keys of one declaration attempt: the sensor, the threat and the attempt time. */
export interface ClassificationKeys {
  sensorId: string;
  uasId: string;
  tS: number;
}

/** The outcome of one declaration attempt. */
export interface ClassificationDecision {
  /** True when the sensor declares the track hostile. */
  declaredHostile: boolean;
  /** Dwell from the attempt to the declaration, seconds (the band's). */
  timeToDeclareS: number;
  /** The band that applied. */
  band: ClassificationBand;
  /** The uniform the outcome was drawn from. */
  u: number;
}

/** The sensor's confusion matrix, or null when the rule ladder classifies. */
export function matrixFor(spec: SensorSpec): ClassificationMatrix | null {
  return spec.classification ?? null;
}

/**
 * The band that applies at `rangeM`: `bands` sorted by `maxRangeM`
 * ascending, the first whose `maxRangeM` exceeds the range. Null beyond the
 * last band (no classification) and for an empty matrix.
 */
export function bandFor(matrix: ClassificationMatrix, rangeM: number): ClassificationBand | null {
  for (const band of matrix.bands) if (band.maxRangeM > rangeM) return band;
  return null;
}

/**
 * One declaration attempt at `rangeM`. Null when no band applies (no draw
 * is taken). Otherwise one draw: a hostile track (`trueHostile`, the
 * default, since every threat entity the sweep follows is a hostile) is
 * declared hostile when `u < pCorrect`; a non-hostile one when
 * `u < pFalseHostile`.
 */
export function classifyByMatrix(
  matrix: ClassificationMatrix,
  rangeM: number,
  draw: Pick<DrawPolicy, 'classify'>,
  keys: ClassificationKeys,
  trueHostile = true,
): ClassificationDecision | null {
  const band = bandFor(matrix, rangeM);
  if (!band) return null;
  const u = draw.classify(keys.sensorId, keys.uasId, keys.tS);
  const declaredHostile = u < (trueHostile ? band.pCorrect : band.pFalseHostile);
  return { declaredHostile, timeToDeclareS: band.timeToDeclareS, band, u };
}
