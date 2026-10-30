import type { Entity, Scenario, SpecModel, Spread } from '../model/types';
import { effectiveDoctrine, entityActive } from '../model/types';
import { classPriorFor } from './classPriors';
import type { ClassPriorTable } from './classPriors';

/** One PF spread row: the spread and its provenance-style source and date. */
export interface PfSpreadRow {
  spread: Spread;
  source: string;
  date: string;
}

const PF_SOURCE = 'planning factor';
const PF_DATE = '2026-09-04';
const pf = (spread: Spread): PfSpreadRow => ({ spread, source: PF_SOURCE, date: PF_DATE });

/**
 * PF spread by field name, one provenance-style row each (basis 'pf').
 * Triangular bounds are fractions of the nominal; the beta `successes` is
 * informational, since the sampler rescales it to the field's own nominal and
 * keeps `trials` as the pseudo-count.
 */
export const PF_SPREAD: Record<string, PfSpreadRow> = {
  rcsM2: pf({ kind: 'lognormal', sigmaDb: 6 }), // PF
  detectRangeM: pf({ kind: 'lognormal', sigmaDb: 3 }), // PF
  pk: pf({ kind: 'beta', successes: 17, trials: 20, pseudo: true }), // PF
  engageTimeS: pf({ kind: 'triangular', lo: -0.2, hi: 0.3 }), // PF
  latencyS: pf({ kind: 'triangular', lo: -0.5, hi: 1.0 }), // PF
  trackInitS: pf({ kind: 'triangular', lo: -0.3, hi: 0.5 }), // PF
  declareHostileS: pf({ kind: 'triangular', lo: -0.3, hi: 0.5 }), // PF
  targetS: pf({ kind: 'triangular', lo: -0.3, hi: 0.5 }), // PF
  bdaS: pf({ kind: 'triangular', lo: -0.3, hi: 0.5 }), // PF
};

/** Where a field's spread came from: a provenance row, its class prior, the PF table, or none (fixed). */
export type SpreadBasis = 'row' | 'class-prior' | 'pf' | 'fixed';

/**
 * The one spread resolver: the row's spread, else the class prior when a
 * `priors` table is given, else PF_SPREAD by field, else null (fixed). A row
 * with `spread: null` is pinned by the user and is fixed.
 */
export function spreadFor(
  model: SpecModel,
  field: string,
  priors?: ClassPriorTable,
): Spread | null {
  const row = model.provenance?.find((r) => r.field === field);
  if (row?.spread) return row.spread;
  if (row && row.spread === null) return null;
  if (priors) {
    const prior = classPriorFor(model, field, priors);
    if (prior) return prior;
  }
  return PF_SPREAD[field]?.spread ?? null;
}

/** The step of `spreadFor` that answered, for the Systems tab and the run record. */
export function spreadBasisFor(
  model: SpecModel,
  field: string,
  priors?: ClassPriorTable,
): SpreadBasis {
  const row = model.provenance?.find((r) => r.field === field);
  if (row?.spread) return 'row';
  if (row && row.spread === null) return 'fixed';
  if (priors && classPriorFor(model, field, priors)) return 'class-prior';
  return PF_SPREAD[field]?.spread ? 'pf' : 'fixed';
}

/** One uncertain (modelId, field) pair. `modelId` is a connection id or 'doctrine' off-library. */
export interface UncertainField {
  modelId: string;
  field: string;
  spread: Spread;
}

/**
 * Library field order per kind, the order the sampler and Morris walk. The
 * sensor accuracy fields and the c2 decision latency have no PF_SPREAD row,
 * so a model with no spread on its provenance row keeps them fixed.
 */
export const FIELDS_BY_KIND: Partial<Record<Entity['kind'], string[]>> = {
  sensor: [
    'detectRangeM',
    'trackInitS',
    'rangeAccuracyM',
    'azimuthAccuracyDeg',
    'elevationAccuracyDeg',
    'falseAlarmRatePerScan',
  ],
  effector: ['pk', 'engageTimeS', 'targetS', 'bdaS'],
  uas: ['rcsM2'],
  c2: ['decisionLatencyS'],
};

/** Whether this model has the spec required by its sampled kind. */
export function hasSpec(model: SpecModel): boolean {
  if (model.kind === 'sensor') return model.sensor != null;
  if (model.kind === 'effector') return model.effector != null;
  if (model.kind === 'uas') return model.uas != null;
  if (model.kind === 'c2') return model.c2 != null;
  return false;
}

/** Ids of the library models in use: at least one active entity references the model. */
export function modelsInUse(scenario: Scenario): Set<string> {
  const ids = new Set<string>();
  for (const e of scenario.entities) if (e.specId && entityActive(e)) ids.add(e.specId);
  return ids;
}

/**
 * Every (modelId, field) pair with a spread in this scenario, in a stable order: library
 * models in use, in library order (FIELDS_BY_KIND per kind), then connections as `{ modelId: connection.id,
 * field: 'latencyS' }`, then `{ modelId: 'doctrine', field: 'declareHostileS' }` when
 * doctrine is enabled. A field with no spread is skipped, and so is a model no active
 * entity uses.
 */
export function uncertainFields(scenario: Scenario): UncertainField[] {
  const out: UncertainField[] = [];
  const inUse = modelsInUse(scenario);
  for (const model of scenario.library) {
    if (!inUse.has(model.id) || !hasSpec(model)) continue;
    for (const field of FIELDS_BY_KIND[model.kind] ?? []) {
      const spread = spreadFor(model, field);
      if (spread) out.push({ modelId: model.id, field, spread });
    }
  }
  const latency = PF_SPREAD.latencyS?.spread;
  if (latency) {
    for (const c of scenario.connections) {
      out.push({ modelId: c.id, field: 'latencyS', spread: latency });
    }
  }
  const declare = PF_SPREAD.declareHostileS?.spread;
  if (declare && effectiveDoctrine(scenario).enabled) {
    out.push({ modelId: 'doctrine', field: 'declareHostileS', spread: declare });
  }
  return out;
}
