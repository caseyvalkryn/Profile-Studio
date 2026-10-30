import type { Scenario } from '../model/types';
import { physicsSwitches, runSettings } from '../model/types';
import type { FidelityTier, Override, PhysicsSwitch } from '../model/libraryField';
import { DATA_PACKAGE_VERSION } from '../model/libraryField';
import { idHash } from '../geometry/prng';
import type { AttritionReport } from './attritionReport';
import type { SensorScanObservation } from './detection';
import type { ThreatAssessment } from './sim';
import type { TrackEstimate } from './trackTypes';

/** Compatibility tags, bumped when engine semantics or existing draw keys change. */
export const TRIAL_ENGINE_REVISION = 'rangeboard-trial-r4-v3';
export const TRIAL_DRAW_POLICY_VERSION = 'counter-fnv1a-fmix32-v1';
/** No build provenance is injected into local builds. Do not substitute a stale commit id. */
export const TRIAL_BUILD_REVISION: string | null = null;

export interface TrialManifest {
  readonly runId: string;
  readonly basisSignature: string;
  readonly seed: number;
  readonly replicateIndex: number;
  readonly basis: 'nominal-aleatory';
  readonly drawPolicyVersion: string;
  readonly engineRevision: string;
  readonly buildRevision: string | null;
  /** Sweep step the trial sampled at, seconds (`McSettings.sweepStepS`, default DT). */
  readonly sweepStepS: number;
  /** Library package the run drew its values from. */
  readonly dataPackageVersion: number;
  /** Field overrides in force, so the record says which values were not the library's. */
  readonly overrides: readonly Override[];
  readonly physicsSwitches: readonly PhysicsSwitch[];
  readonly fidelityFloor: FidelityTier;
  readonly producer: 'browser' | 'cli';
}

/** The manifest keys a caller may set; everything else comes from the scenario and engine tags. */
export type TrialManifestExtras = Partial<
  Pick<
    TrialManifest,
    'dataPackageVersion' | 'overrides' | 'physicsSwitches' | 'fidelityFloor' | 'producer'
  >
>;

export function createTrialManifest(
  scenario: Scenario,
  runId: string,
  basisSignature: string,
  extras: TrialManifestExtras = {},
): TrialManifest {
  if (!runId || !basisSignature) throw new Error('Trial requires a run id and configuration basis');
  // A physics switch runs a model on its fallback, so the floor drops with it.
  const switches = extras.physicsSwitches ?? physicsSwitches(scenario);
  const settings = runSettings(scenario);
  return Object.freeze({
    runId,
    basisSignature,
    seed: settings.seed,
    replicateIndex: idHash(runId),
    basis: 'nominal-aleatory',
    drawPolicyVersion: TRIAL_DRAW_POLICY_VERSION,
    engineRevision: TRIAL_ENGINE_REVISION,
    buildRevision: TRIAL_BUILD_REVISION,
    sweepStepS: settings.sweepStepS,
    dataPackageVersion: extras.dataPackageVersion ?? DATA_PACKAGE_VERSION,
    overrides: extras.overrides ?? [],
    physicsSwitches: switches,
    fidelityFloor: extras.fidelityFloor ?? (switches.length > 0 ? 'fallback' : 'datasheet'),
    producer: extras.producer ?? 'browser',
  });
}

/**
 * Whether two manifests describe the same trial. Scalar keys compare by identity; the
 * array keys (`overrides`, `physicsSwitches`) compare by value, because a structured
 * clone from the worker or a fresh `createTrialManifest` never shares array identity.
 * `skip` names keys left out of the comparison (the selector ignores `buildRevision`).
 */
export function sameManifest(
  a: TrialManifest,
  b: TrialManifest,
  skip: readonly (keyof TrialManifest)[] = [],
): boolean {
  for (const key of Object.keys(a) as (keyof TrialManifest)[]) {
    if (skip.includes(key)) continue;
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) || Array.isArray(right)) {
      if (JSON.stringify(left) !== JSON.stringify(right)) return false;
    } else if (left !== right) return false;
  }
  return true;
}

/** Actual continue-jam outcomes, absent from killDelta in the engagement ledger.
 * Match ledger entries by effectorId, uasId and tEffectS; those share the jam draw key.
 */
export interface TrialJamDecision {
  effectorId: string;
  uasId: string;
  tEffectS: number;
  probability: number;
  outcome: number;
}

/** One trial's result; the caller keeps the captured scenario beside it. */
export interface TrialResult {
  manifest: TrialManifest;
  assessments: ThreatAssessment[];
  report: AttritionReport;
  /** Actual scan attempts, including misses and empty admission. Between-scan holds and
   * coast intervals remain in assessments; no extra samples or draws are synthesized.
   */
  observations: SensorScanObservation[];
  jamDecisions: TrialJamDecision[];
  /**
   * Sensor-level track estimates in time order, one entry per track per sweep
   * step it existed. Absent when no sink was attached. A reader takes the
   * latest entry per track id at or before its horizon.
   */
  tracks?: readonly TrackEstimate[];
}
