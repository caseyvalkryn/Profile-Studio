/**
 * Shape of the JSON data package under `data/library/<kind>/<slug>.json`,
 * which compiles into the runtime library. Every number the board draws
 * carries its grade, layer and lineage here.
 */

import type { EntityKind, Spread, ThreatProfile } from './types';

/** Evidence grade of one value, from `docs/inventory/provenance.md`. */
export type LibraryGrade =
  /** Authoritative documentation. */
  | 'VERIFIED'
  /** Two or more credible independent sources. */
  | 'CORROBORATED'
  /** Credible single reporting. */
  | 'REPORTED'
  /** OEM datasheet or product page. */
  | 'MANUFACTURER_CLAIM'
  /** Reasonable but not documented. */
  | 'INFERRED'
  /** No public evidence. */
  | 'UNKNOWN';

/**
 * What the value is: L1 a public value with its condition, L2 a representative
 * planning figure with a stated basis (never measured performance), L3 left to
 * the user (`value` null, the app draws nothing).
 */
export type LibraryLayer = 'L1' | 'L2' | 'L3';

/**
 * Which range a distance is. Detection, instrumented, track, classification
 * and effective engagement ranges are different quantities and are never
 * substituted for one another.
 */
export type RangeType =
  'detection' | 'instrumented' | 'track' | 'classification' | 'effective-engagement';

/** How an L2 figure was produced when no public value exists. */
export type FieldEstimator = 'class-median' | 'planning-factor' | 'analyst';

/**
 * One numeric spec field with its lineage. `unit` is an SI unit string
 * ('m', 's', 'deg', 'm2', 'ft', 'kg', 'W', 'dB'), 'fraction' for a
 * probability, or 'count' for a count. `spread` reuses the runtime Spread:
 * absent means the fallback spread table by field, null means fixed.
 */
export interface LibraryField<T> {
  /** Null on an L3 field: no value, nothing drawn. */
  value: T | null;
  unit: string;
  rangeType?: RangeType;
  /** The circumstance the value holds under (target class, weather, mode). */
  condition?: string;
  grade: LibraryGrade;
  layer: LibraryLayer;
  source?: string;
  url?: string | null;
  /** ISO date the source was read. */
  date?: string;
  spread?: Spread | null;
  estimator?: FieldEstimator;
  /** Model ids an estimator drew on, so a class median can be traced. */
  comparisonSet?: string[];
  note?: string;
  /** The old provenance basis of the row, kept so the build reconstructs the row byte for byte. */
  basis?: 'datasheet' | 'reference' | 'pf';
}

/**
 * One library file. Split rule: a spec key whose value is a number, a tuple
 * of numbers, or null goes under `fields` as a LibraryField; every other spec
 * key (strings, enums, booleans, string arrays) goes under `attributes` as a
 * bare value. `type` is the sensorType, effector type or uas airframe,
 * whichever the kind has; null for kinds without one.
 */
export interface LibraryFile {
  id: string;
  kind: EntityKind;
  type: string | null;
  /** Per-file revision; bump on any edit. */
  version: number;
  name: string;
  description: string;
  color: string;
  builtin: boolean;
  /** Which spec block the fields and attributes compile into; null for asset/marker and for a c2 file with no spec yet. */
  spec: 'sensor' | 'uas' | 'effector' | 'c2' | null;
  fields: Record<string, LibraryField<unknown>>;
  attributes: Record<string, unknown>;
  threatProfile?: ThreatProfile;
  /** Spec keys that carried a provenance row in the seed library, in row order; the build emits exactly these. */
  provenanceOrder?: string[];
  /** Lineage of a categorical attribute (a band list, for example), which the split rule keeps bare. */
  attributeProvenance?: Record<string, AttributeProvenance>;
}

/** A provenance row on an attribute: the quoted value text and its source, never a numeric field. */
export interface AttributeProvenance {
  value: string;
  source: string;
  url?: string | null;
  date: string;
  basis: 'datasheet' | 'reference' | 'pf';
  grade: LibraryGrade;
  layer: LibraryLayer;
  condition?: string;
  note?: string;
}

/** A user's replacement of one library field value, with the reason on record. */
export interface Override {
  modelId: string;
  /** The spec key, as in `LibraryFile.fields`. */
  field: string;
  value: unknown;
  reason: string;
  /** ISO date of the override. */
  date: string;
}

/** Persisted shape under `OVERRIDES_KEY`. */
export interface OverrideSet {
  overrides: Override[];
}

/** Engine simplifications a run may switch on; each is recorded in the manifest. */
export type PhysicsSwitch =
  | 'truthTracks'
  | 'noFalseTracks'
  | 'noOperatorQueue'
  | 'singlePulseRadar'
  // Fallbacks: constant-speed waypoints with no wind, the RF band gate with no
  // link budget, the EO/IR span ratio with the Koschmieder cap, and the shared
  // kinetic Pk formula for interceptors and guns and for directed energy and HPM.
  | 'noFlightLimits'
  | 'rfBandGate'
  | 'eoirSpanRatio'
  | 'legacyKineticPk'
  | 'legacyBeamPk';

/** Lowest model fidelity a run accepted, best to worst. */
export type FidelityTier = 'analytic' | 'datasheet' | 'calibrated' | 'fallback';

/** Current data package version. Every library change bumps it. */
export const DATA_PACKAGE_VERSION = 3;
