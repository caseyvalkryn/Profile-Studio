/**
 * Score run rows against the vignette's measure settings. One `Score` per setting, named
 * by DroneScore id. Proportions take a Wilson interval; ranges and times take the mean
 * with a seeded percentile bootstrap. A row with no formula, or whose inputs the rows
 * cannot produce, scores null with a note. Never invent a measure.
 */
import type { MeasureSetting, Op, RunRow, Vignette } from '../domain/types';
import { measureById } from '../domain/measures';
import type { SourceClass } from '../domain/measures';
import { wilson } from './sim/analysis/stats';
import { mulberry32 } from './sim/geometry/prng';
import { stageAtLeast } from './run';

export type Evaluation = 'meets' | 'does-not-meet' | 'inconclusive';

export type Score = {
  id: string;
  /** Rows in the denominator (proportion) or sample (mean). */
  n: number;
  value: number | null;
  interval: { low: number; high: number } | null;
  threshold: number;
  op: Op;
  unit: string;
  evaluation: Evaluation;
  sourceClass: SourceClass;
  /** Why the value is null, or how it was formed. */
  note?: string;
};

/** Fewest qualifying rows for a sample interval; below it the bootstrap degenerates to a point. */
export const MIN_INTERVAL_N = 2;

/**
 * Threshold conversion from the setting's unit into the row's canonical unit (measures.ts).
 * An empty setting unit means the canonical unit. Returns null for a pair it cannot convert.
 */
export function thresholdInCanonical(
  threshold: number,
  unit: string,
  canonical: string,
): number | null {
  const u = unit.trim().toLowerCase();
  const c = canonical.trim().toLowerCase();
  if (u === '' || u === c) return threshold;
  if (u === 'km' && c === 'm') return threshold * 1000;
  if (u === 'm' && c === 'km') return threshold / 1000;
  if (c === '%' && (u === 'proportion' || u === 'fraction' || u === 'ratio'))
    return threshold * 100;
  if (u === '%' && (c === 'proportion' || c === 'fraction' || c === 'ratio'))
    return threshold / 100;
  return null;
}

export type ScoreOptions = {
  /** Bootstrap resamples for mean rows. */
  bootstrapN?: number;
  /** Seed of the bootstrap resampler. */
  seed?: number;
  /** Wilson z. */
  z?: number;
  /**
   * Entered values by DroneScore id (`enteredValues`). An Entered-class row scores from this
   * value, with no interval, against its threshold (spec section 4).
   */
  entered?: Record<string, number>;
};

/**
 * Numeric entered values by DroneScore id, from the vignette's sensors then effectors. When two
 * assets enter the same row, the first in that order is used.
 */
export function enteredValues(v: Pick<Vignette, 'sensors' | 'effectors'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of [...v.sensors, ...v.effectors])
    for (const [id, e] of Object.entries(a.entered))
      if (!(id in out) && typeof e.value === 'number' && Number.isFinite(e.value))
        out[id] = e.value;
  return out;
}

/**
 * A proportion: `inPopulation` picks the denominator rows, `success` the numerator. Reported
 * in percent, the DroneScore unit for these rows.
 */
type ProportionFormula = {
  kind: 'proportion';
  inPopulation: (r: RunRow) => boolean;
  success: (r: RunRow) => boolean;
  note?: string;
};

/** A sample statistic over `value(row)` where it is not null, with a bootstrap interval. */
type SampleFormula = {
  kind: 'sample';
  value: (r: RunRow) => number | null;
  /** Statistic over the sample; mean when absent. */
  statistic?: (xs: number[]) => number;
  note?: string;
};

type NullFormula = { kind: 'null'; note: string };

export type MeasureFormula = ProportionFormula | SampleFormula | NullFormula;

const detected = (r: RunRow) => stageAtLeast(r.stage_reached, 'detect');
const tracked = (r: RunRow) => stageAtLeast(r.stage_reached, 'track');
const identified = (r: RunRow) => stageAtLeast(r.stage_reached, 'identify');
const engaged = (r: RunRow) => stageAtLeast(r.stage_reached, 'engage');
const defeated = (r: RunRow) => r.outcome === 'Success';
const km = (f: (r: RunRow) => number | null) => (r: RunRow) => {
  const v = f(r);
  return v == null ? null : v / 1000;
};
const max = (xs: number[]) => Math.max(...xs);

const NO_CLASSIFY: NullFormula = {
  kind: 'null',
  note: 'rangeboard has no classification rung distinct from identification (unknown, suspected, hostile), so stage_reached never holds classify',
};

/** Every simulated or derived DroneScore row the RunRow fields can produce, keyed by id. */
export const MEASURE_FORMULAS: Record<string, MeasureFormula> = {
  // 1. Detection & Tracking
  '1.1.1': { kind: 'proportion', inPopulation: () => true, success: detected },
  '1.1.2': { kind: 'sample', value: (r) => r.detect_range_m },
  '1.1.3': {
    kind: 'sample',
    value: (r) =>
      r.detect_range_m == null || r.detect_alt_m == null
        ? null
        : Math.hypot(r.detect_range_m, r.detect_alt_m),
  },
  '1.1': { kind: 'sample', value: km((r) => r.detect_range_m), note: 'same value as 1.1.2, km' },
  '1.2': { kind: 'proportion', inPopulation: () => true, success: detected, note: 'same as 1.1.1' },
  '1.5': {
    kind: 'sample',
    value: (r) => r.detect_alt_m,
    statistic: max,
    note: 'maximum of detect_alt_m',
  },
  '1.2.1': { kind: 'proportion', inPopulation: detected, success: tracked },
  '1.2.2': { kind: 'sample', value: (r) => r.track_continuity_pct },
  '1.2.3': {
    kind: 'sample',
    value: (r) => r.track_error_m,
    note: 'ground-plane error; the simulated track carries no altitude estimate',
  },
  // 2. Classification & Identification
  '2.1.1': NO_CLASSIFY,
  '2.1.2': { kind: 'proportion', inPopulation: tracked, success: (r) => r.identified_ok === true },
  '2.1.3': { kind: 'sample', value: (r) => r.id_range_m },
  '2.1.3t': { kind: 'sample', value: (r) => r.id_time_s },
  '2.1.4': {
    kind: 'null',
    note: 'rangeboard does not surface a wrong declaration, so identified_ok is never false',
  },
  '3a.2': NO_CLASSIFY,
  '3b.1': { kind: 'sample', value: km((r) => r.id_range_m), note: 'same value as 2.1.3, km' },
  // 3. Threat Defeat & Denial
  '3.1.1': { kind: 'proportion', inPopulation: identified, success: engaged },
  '3.1.2': { kind: 'proportion', inPopulation: engaged, success: defeated },
  '3.1.3': {
    kind: 'sample',
    value: (r) => (defeated(r) ? r.engagement_range_m : null),
    note: 'engagement_range_m over defeated rows',
  },
  '3.1.4': { kind: 'sample', value: (r) => r.time_to_intercept_s },
  '5.1': {
    kind: 'sample',
    value: km((r) => (defeated(r) ? r.engagement_range_m : null)),
    note: 'same value as 3.1.3, km',
  },
  '5.3': {
    kind: 'null',
    note: 'needs reload time and per-launcher engagement time; the vignette carries neither',
  },
  '5.4': { kind: 'proportion', inPopulation: engaged, success: defeated, note: 'same as 3.1.2' },
  '5.4e': {
    kind: 'proportion',
    inPopulation: engaged,
    success: defeated,
    note: 'same as 3.1.2; the rows do not say which effector kind fired',
  },
  '5.8': { kind: 'null', note: 'needs unit cost and interceptors spent; the rows carry neither' },
};

function mean(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Seeded percentile bootstrap of `statistic` over `xs`: [2.5, 97.5] percentiles of B resamples. */
export function bootstrap(
  xs: number[],
  statistic: (sample: number[]) => number,
  B: number,
  seed: number,
): { low: number; high: number } {
  const n = xs.length;
  if (n < 2) {
    const v = statistic(xs);
    return { low: v, high: v };
  }
  const rand = mulberry32(seed);
  const stats = new Array<number>(B);
  const sample = new Array<number>(n);
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) sample[i] = xs[Math.floor(rand() * n)]!;
    stats[b] = statistic(sample);
  }
  stats.sort((a, c) => a - c);
  const at = (q: number) => stats[Math.min(B - 1, Math.max(0, Math.round(q * (B - 1))))]!;
  return { low: at(0.025), high: at(0.975) };
}

/** Meets when the whole interval passes, does not meet when none of it does, else inconclusive. */
export function evaluate(
  interval: { low: number; high: number },
  op: Op,
  threshold: number,
): Evaluation {
  if (op === '>=') {
    if (interval.low >= threshold) return 'meets';
    if (interval.high < threshold) return 'does-not-meet';
    return 'inconclusive';
  }
  if (interval.high <= threshold) return 'meets';
  if (interval.low > threshold) return 'does-not-meet';
  return 'inconclusive';
}

function nullScore(s: MeasureSetting, sourceClass: SourceClass, n: number, note: string): Score {
  return {
    id: s.id,
    n,
    value: null,
    interval: null,
    threshold: s.threshold,
    op: s.op,
    unit: s.unit,
    evaluation: 'inconclusive',
    sourceClass,
    note,
  };
}

/** An Entered-class row: the asset's entered value, no interval, evaluated as a point. */
function enteredScore(s: MeasureSetting, canonical: string, value: number | undefined): Score {
  if (value == null) return nullScore(s, 'entered', 0, 'entered: no value on any asset');
  const threshold = thresholdInCanonical(s.threshold, s.unit, canonical);
  const score: Score = {
    id: s.id,
    n: 0,
    value,
    interval: null,
    threshold: s.threshold,
    op: s.op,
    unit: s.unit,
    evaluation:
      threshold == null ? 'inconclusive' : evaluate({ low: value, high: value }, s.op, threshold),
    sourceClass: 'entered',
    note: 'entered value, no interval',
  };
  if (threshold == null)
    score.note = `threshold unit "${s.unit}" cannot be converted to ${canonical}`;
  return score;
}

export function scoreOne(rows: RunRow[], s: MeasureSetting, opts: ScoreOptions = {}): Score {
  const B = opts.bootstrapN ?? 1000;
  const seed = opts.seed ?? 1;
  const measure = measureById(s.id);
  const sourceClass: SourceClass = measure?.sourceClass ?? 'not-simulated';
  if (!measure) return nullScore(s, sourceClass, 0, `unknown DroneScore id ${s.id}`);
  if (sourceClass === 'entered') return enteredScore(s, measure.unit, opts.entered?.[s.id]);
  const f = MEASURE_FORMULAS[s.id];
  if (!f) return nullScore(s, sourceClass, 0, `${sourceClass}: no simulated formula`);
  if (f.kind === 'null') return nullScore(s, sourceClass, 0, f.note);
  // The threshold is compared in the row's canonical unit; the Score keeps the setting's.
  const threshold = thresholdInCanonical(s.threshold, s.unit, measure.unit);
  if (f.kind === 'proportion') {
    const pop = rows.filter(f.inPopulation);
    const n = pop.length;
    if (n === 0) return nullScore(s, sourceClass, 0, 'no rows in the denominator');
    const x = pop.filter(f.success).length;
    const w = wilson(x, n, opts.z);
    const interval = { low: 100 * w.lo, high: 100 * w.hi };
    const score: Score = {
      id: s.id,
      n,
      value: (100 * x) / n,
      interval,
      threshold: s.threshold,
      op: s.op,
      unit: s.unit,
      evaluation: threshold == null ? 'inconclusive' : evaluate(interval, s.op, threshold),
      sourceClass,
    };
    if (threshold == null)
      score.note = `threshold unit "${s.unit}" cannot be converted to ${measure.unit}`;
    else if (f.note) score.note = f.note;
    return score;
  }
  const xs = rows.map(f.value).filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0)
    return nullScore(s, sourceClass, 0, 'no row reached the stage that produces this value');
  const stat = f.statistic ?? mean;
  const interval = bootstrap(xs, stat, B, seed);
  const score: Score = {
    id: s.id,
    n: xs.length,
    value: stat(xs),
    interval,
    threshold: s.threshold,
    op: s.op,
    unit: s.unit,
    evaluation:
      threshold == null || xs.length < MIN_INTERVAL_N
        ? 'inconclusive'
        : evaluate(interval, s.op, threshold),
    sourceClass,
  };
  if (threshold == null)
    score.note = `threshold unit "${s.unit}" cannot be converted to ${measure.unit}`;
  else if (xs.length < MIN_INTERVAL_N)
    score.note = `${xs.length} qualifying row; an interval needs at least ${MIN_INTERVAL_N}`;
  else if (f.note) score.note = f.note;
  return score;
}

/** One Score per setting, in setting order. */
export function score(
  rows: RunRow[],
  settings: MeasureSetting[],
  opts: ScoreOptions = {},
): Score[] {
  return settings.map((s) => scoreOne(rows, s, opts));
}
