/**
 * Class priors: what a field of one class of system tends to be, from the L1
 * (public, sourced) entries of the library alone. `scripts/derive-priors.mjs`
 * writes `data/priors/<class>.json` and `classPriors.generated.ts`; this
 * module reads them at runtime.
 *
 * Class rule (mirror of `classOf` in scripts/derive-priors.mjs; a test proves
 * both agree on every seed model). The key joins kind, type, band and target
 * class with '/':
 *   sensor/<sensorType>/<band>/any     band: the eoBand ('dual' when absent) for
 *                                      eo-ir, the sorted rfBands joined by '+'
 *                                      for rf ('any' when absent), 'any' for
 *                                      radar and acoustic. SensorSpec carries no
 *                                      target-group key, so the target class is
 *                                      'any' for every sensor.
 *   effector/<effectorType>/<band>/any band: the sorted jamBands joined by '+',
 *                                      else 'any'.
 *   uas/<airframe>/<group>/any         group: the JP 3-30 UAS group.
 * The file name is the key in lowercase with '/' replaced by '__'.
 */

import type { SpecModel, Spread } from '../model/types';
import { CLASS_PRIORS } from './classPriors.generated';

/** A multiplicative (lognormal family) prior: median of ln(v), sample sd of 20*log10(v). */
export interface LogPrior {
  logMedian: number;
  sigmaDb: number;
  n: number;
  members: string[];
}

/** An additive prior: mean and sample sd of the values. */
export interface LinearPrior {
  mean: number;
  sd: number;
  n: number;
  members: string[];
}

export type FieldPrior = LogPrior | LinearPrior;

export interface ClassPrior {
  class: string;
  kind: string;
  type: string;
  band: string;
  targetClass: string;
  dataPackageVersion: number;
  /** Union of every field's members. */
  members: string[];
  fields: Record<string, FieldPrior>;
}

export type ClassPriorTable = Record<string, ClassPrior>;

export { CLASS_PRIORS };

const sortedJoin = (bands: readonly string[] | undefined): string =>
  bands && bands.length ? [...bands].sort().join('+') : 'any';

/** The class key of a runtime model, or null when it carries no spec. */
export function classOfModel(model: SpecModel): string | null {
  if (model.sensor) {
    const s = model.sensor;
    let band = 'any';
    if (s.sensorType === 'eo-ir') band = s.eoBand ?? 'dual';
    else if (s.sensorType === 'rf') band = sortedJoin(s.rfBands);
    return `sensor/${s.sensorType}/${band}/any`;
  }
  if (model.effector) {
    const e = model.effector;
    return `effector/${e.effectorType}/${sortedJoin(e.jamBands)}/any`;
  }
  if (model.uas) return `uas/${model.uas.airframe}/${model.uas.group}/any`;
  return null;
}

function isLogPrior(prior: FieldPrior): prior is LogPrior {
  return 'logMedian' in prior;
}

/**
 * The prior of `field` for this model's class as a sampler Spread, or null when
 * the class or the field has none. A multiplicative prior is the lognormal
 * with the class sigmaDb. An additive prior becomes the symmetric triangular
 * `nominal * (1 + lo) .. nominal * (1 + hi)`: a symmetric triangular of half
 * width w has sd = w / sqrt(6), so w = sd * sqrt(6) and, as a fraction of the
 * mean, lo = -sd * sqrt(6) / mean and hi = +sd * sqrt(6) / mean. Null when the
 * mean is 0, as no fraction of it exists.
 */
export function classPriorFor(
  model: SpecModel,
  field: string,
  table: ClassPriorTable = CLASS_PRIORS,
): Spread | null {
  const key = classOfModel(model);
  const prior = key ? table[key]?.fields[field] : undefined;
  if (!prior) return null;
  if (isLogPrior(prior)) return { kind: 'lognormal', sigmaDb: prior.sigmaDb };
  if (prior.mean === 0) return null;
  const half = (prior.sd * Math.sqrt(6)) / prior.mean;
  return { kind: 'triangular', lo: -half, hi: half };
}
