import type {
  EffectorSpec,
  Entity,
  FireDoctrine,
  LaunchPolicy,
  SensorRole,
  SensorSpec,
} from '../model/types';
import { TRACK_DROP_MISSES, TRACK_INIT_M, TRACK_INIT_N, defaultSensorRole } from '../model/types';

/**
 * Per-system doctrine planning factors, never measured performance. The
 * scenario-level FireDoctrine numbers apply to the whole laydown, so with
 * doctrine enabled the engine derives each system's factors here instead:
 * spec override first, then the role or type table, then the scenario value.
 *
 * What the tables vary with: track initiation with revisit rate, BDA with how
 * the kill is observed, commit Pk with cost per shot, and target dwell with
 * how long the shooter takes to slew, acquire and settle a firing solution.
 */

/** Continuous hold needed to initiate a stable track file, by sensor role, s. */
export const TRACK_INIT_S: Record<SensorRole, number> = {
  'fire-control': 2,
  tracking: 3,
  'target-acquisition': 4,
  classification: 5,
  surveillance: 6,
  'early-warning': 8,
};

/** Battle-damage-assessment dwell after a salvo's effect, by effector type, s. */
const BDA_S: Record<EffectorSpec['effectorType'], number> = {
  de: 3,
  hpm: 3,
  gun: 5,
  interceptor: 10,
  net: 20,
  jammer: 5,
};

/**
 * Weapon assignment and firing-solution dwell (TARGET step) by effector type,
 * s. Charged after the declaration gate and the kill-chain hop latency,
 * before the first possible release. A jammer is illumination, not a round,
 * and stays on the legacy release path.
 */
const TARGET_S: Record<EffectorSpec['effectorType'], number> = {
  gun: 4,
  de: 5,
  hpm: 3,
  interceptor: 8,
  net: 6,
  jammer: 0,
};

/** Hold-fire commit Pk by effector type: cheap fast shots commit earlier. */
const PK_COMMIT: Record<EffectorSpec['effectorType'], number> = {
  de: 0.2,
  hpm: 0.2,
  gun: 0.25,
  interceptor: 0.35,
  net: 0.35,
  jammer: 0,
};

/**
 * Default kill-chain edge latency by (from, to) kind, seconds, charged when
 * doctrine is enabled and the connection sets no latencyS of its own.
 * Machine-to-machine track forwarding is fast; an engage order still has a
 * human on the loop. With doctrine off, an unset latencyS stays 0 (legacy).
 */
export function defaultLinkLatencyS(fromKind: Entity['kind'], toKind: Entity['kind']): number {
  if (fromKind === 'c2' && toKind === 'effector') return 3;
  if (fromKind === 'c2' && toKind === 'c2') return 2;
  return 2; // sensor -> c2, sensor -> effector
}

/**
 * Declaration dwell multiplier when a second phenomenology already confirms
 * the track at declaration start: correlated ID halves the operator's
 * decision time. Single-source ID pays the full dwell.
 */
export const CONFIRMED_DECLARE_FACTOR = 0.5;

/** Track initiation time for one sensor: spec override, role table, fallback. */
export function trackInitSFor(spec: SensorSpec, doctrine: FireDoctrine): number {
  return spec.trackInitS ?? TRACK_INIT_S[defaultSensorRole(spec)] ?? doctrine.trackFirmS;
}

/** A recorded scan count, whole and positive; else the planning factor. */
function countOr(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.round(value));
}

/**
 * Scan period by role for a Pd-modeled radar with no stated updateRateS,
 * seconds. PF: a staring fire-control radar revisits twice a second, a
 * rotating early-warning search radar once per revolution.
 */
export const SCAN_S: Record<SensorRole, number> = {
  'fire-control': 0.5,
  tracking: 1,
  'target-acquisition': 2,
  classification: 2,
  surveillance: 2,
  'early-warning': 6,
};

/**
 * The one scan period: updateRateS when stated (any radar), else SCAN_S by
 * role for a Pd-modeled radar, else null (a threshold radar with no stated
 * period, EO/IR, RF, acoustic). A null period keeps the per-sample hold and
 * the role-table initiator.
 */
export function scanPeriodS(spec: SensorSpec, pdModeled: boolean): number | null {
  if (spec.sensorType !== 'radar') return null;
  const rate = spec.updateRateS;
  if (rate != null && Number.isFinite(rate) && rate > 0) return rate;
  return pdModeled ? SCAN_S[defaultSensorRole(spec)] : null;
}

/** M of the M-of-N initiation rule for one sensor: spec override, else TRACK_INIT_M. */
export function trackInitMFor(spec: SensorSpec): number {
  return countOr(spec.trackInitM, TRACK_INIT_M);
}

/** N of the M-of-N initiation rule for one sensor: spec override, else TRACK_INIT_N. */
export function trackInitNFor(spec: SensorSpec): number {
  return countOr(spec.trackInitN, TRACK_INIT_N);
}

/** Consecutive missed scans that drop a coasting track: spec override, else TRACK_DROP_MISSES. */
export function trackDropMissesFor(spec: SensorSpec): number {
  return countOr(spec.trackDropMisses, TRACK_DROP_MISSES);
}

/** BDA dwell for one effector: spec override, type table, fallback. */
export function bdaSFor(spec: EffectorSpec, doctrine: FireDoctrine): number {
  return spec.bdaS ?? BDA_S[spec.effectorType] ?? doctrine.bdaS;
}

/** Commit Pk for one effector: spec override, type table, fallback. */
export function commitPkFor(spec: EffectorSpec, doctrine: FireDoctrine): number {
  return spec.commitPk ?? PK_COMMIT[spec.effectorType] ?? doctrine.pkCommit;
}

/** Target dwell for one effector: spec override, type table, fallback. */
export function targetSFor(spec: EffectorSpec, doctrine: FireDoctrine): number {
  return spec.targetS ?? TARGET_S[spec.effectorType] ?? doctrine.targetS;
}

/** Launch-point policies in display order, with the one-line reading of each. */
export const LAUNCH_POLICIES: ReadonlyArray<{ v: LaunchPolicy; label: string; hint: string }> = [
  {
    v: 'max-range',
    label: 'Max range',
    hint: 'Release at the first in-envelope opportunity. Exercises the maximum engagement range; Pk pays the full range falloff.',
  },
  {
    v: 'range-fraction',
    label: 'Range fraction',
    hint: 'Release once the intercept point is inside the set fraction of max range (2/3 default). Mid-envelope shot with margin for a re-attack.',
  },
  {
    v: 'pk-commit',
    label: 'Pk commit',
    hint: 'Release once predicted per-shot Pk reaches the effector commit Pk. Quality firing solution first; the deadline still forces the shot.',
  },
  {
    v: 'latest',
    label: 'Latest launch',
    hint: 'Hold to the last launch that still preserves the re-engagement depth. Exercises the minimum-range, last-chance shot.',
  },
];

/** Display label of a launch policy. */
export function launchPolicyLabel(policy: LaunchPolicy): string {
  return LAUNCH_POLICIES.find((p) => p.v === policy)?.label ?? policy;
}
