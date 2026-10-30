import type { C2Spec, Scenario } from '../model/types';
import { entityActive, physicsSwitches } from '../model/types';
import { normalQuantile } from '../analysis/uncertainty';
import type { FalseTrackLoad } from './falseTracks';
import { prepareFalseTracks, scenarioHorizonS } from './falseTracks';
import type { KillChainRoute } from './killChain';
import type { DrawPolicy } from './policy';
import type { ThreatAssessment } from './sim';

/**
 * Operator queue at a C2 node. Each operator decision on a threat (the
 * declare-hostile gate and the weapon-assignment gate in attrition.ts) waits
 * an extra decision latency drawn lognormal with median
 * `C2Spec.decisionLatencyS` and sigma `decisionLatencySigmaDb` (10 log10 of
 * the ratio to the median, the lognormal `Spread` convention), from the
 * policy's kind-10 uniform `draw.latency(c2Id, uasId, tS)`.
 *
 * Overload. When the live tracks at the C2 (real threats currently tracked plus
 * the false tracks of the radars that feed it) exceed `operatorTrackCapacity`,
 * the latency multiplies by load / capacity. The model is linear because one
 * operator serves the queue in turn.
 *
 * The doctrine dwells (`declareHostileS`, `targetS`) already charge the
 * planning decision time, so the queue adds only the excess over the median:
 * the tail of the draw and the overload penalty. At the median with no overload
 * the extra is 0.
 *
 * Inactive, at zero latency: no C2 with a `c2` spec that states a median, the
 * `noOperatorQueue` switch, or a threat whose route has no C2 node. The C2 node
 * of a route is its first c2 entity.
 */

/** The hash uniform is [0, 1); clamp so the quantile is finite (as sampleSpread does). */
const U_EPS = 2 ** -32;

/**
 * One decision latency, seconds: `medianS * 10^(sigmaDb * z / 10)` with
 * `z = normalQuantile(u)`. A null sigma is a fixed latency at the median.
 */
export function decisionLatencyS(
  medianS: number,
  sigmaDb: number | null | undefined,
  uRaw: number,
): number {
  if (!(medianS > 0) || !Number.isFinite(medianS)) return 0;
  if (sigmaDb == null || !(sigmaDb > 0)) return medianS;
  const u = Math.min(1 - U_EPS, Math.max(U_EPS, uRaw));
  return medianS * Math.pow(10, (sigmaDb * normalQuantile(u)) / 10);
}

/** Linear overload multiplier: 1 up to capacity, load / capacity above it; 1 with no capacity stated. */
export function overloadFactor(load: number, capacity: number | null | undefined): number {
  if (capacity == null || !(capacity > 0) || !Number.isFinite(capacity)) return 1;
  return load > capacity ? load / capacity : 1;
}

/** The C2 node that decides for a route: its first c2 entity, or null for a direct or standalone route. */
export function firstC2Of(route: Pick<KillChainRoute, 'viaC2Ids'>): string | null {
  return route.viaC2Ids.length > 0 ? route.viaC2Ids[0]! : null;
}

/**
 * What one operator decision charged, and whether the floor at 0 applied.
 * `floored` means the raw excess `base * overload - medianS` was strictly below
 * 0, so the queue charged nothing. A raw excess of exactly 0 is not floored:
 * nothing was discarded.
 */
export interface OperatorDelay {
  /** Extra seconds over the doctrine dwell; never negative. */
  readonly extraS: number;
  /** True when the raw excess was below 0 and the floor discarded it. */
  readonly floored: boolean;
  /** True when this C2 drew a latency: the decision the stamp counts. False for a C2 the queue does not model. */
  readonly decided: boolean;
}

/** No charge and no floor: an inactive queue, or a C2 the queue does not know. */
const NO_DELAY: OperatorDelay = Object.freeze({ extraS: 0, floored: false, decided: false });

/** The operator queue of one replicate. */
export interface OperatorQueue {
  /** True when some C2 adds latency: a c2 spec with a median and the switch off. */
  readonly active: boolean;
  /**
   * Extra latency over the doctrine dwell of one decision (0 declare, 1 assign)
   * on `uasId` at `c2Id` taken at `tS`, seconds: the drawn latency times the
   * overload factor, less the median, floored at 0. All three fields read zero
   * or false when the queue is inactive or `c2Id` states no median.
   */
  delayS(c2Id: string, uasId: string, tS: number, decision: number): OperatorDelay;
  /** Live tracks at the C2 at `tS`: real threats tracked plus the false tracks of its feeding radars. */
  loadAt(c2Id: string, tS: number): number;
}

const INACTIVE_QUEUE: OperatorQueue = Object.freeze({
  active: false,
  delayS: () => NO_DELAY,
  loadAt: () => 0,
});

/** A C2 spec that states a decision median. */
function statesLatency(spec: C2Spec | undefined): spec is C2Spec {
  const median = spec?.decisionLatencyS;
  return median != null && Number.isFinite(median) && median > 0;
}

/**
 * Build the operator queue for one replicate from the threat assessments.
 * Inactive when no active C2 states a decision median or the switch is on;
 * an inactive queue consumes no draw and builds no false-track load. The
 * false-track load is built here from the scenario horizon unless the
 * caller already ran the process (the trial, with its sink).
 *
 * A real threat is a live track at a C2 from its first detection to the last
 * held sample (`trackQuality.lastTrackS`, else arrival, else CPA) when one of
 * its detecting sensors links directly to that C2. A formation is one track.
 */
export function createOperatorQueue(
  scenario: Scenario,
  assessments: readonly ThreatAssessment[],
  draw: DrawPolicy,
  falseLoad?: FalseTrackLoad,
): OperatorQueue {
  if (physicsSwitches(scenario).includes('noOperatorQueue')) return INACTIVE_QUEUE;
  const specs = new Map<string, C2Spec>();
  for (const e of scenario.entities) {
    if (e.kind !== 'c2' || !entityActive(e)) continue;
    const spec = scenario.library.find((m) => m.id === e.specId)?.c2;
    if (statesLatency(spec)) specs.set(e.id, spec);
  }
  if (specs.size === 0) return INACTIVE_QUEUE;

  const load = falseLoad ?? prepareFalseTracks(scenario, draw, scenarioHorizonS(scenario));

  // Radars feeding each C2 over a direct sensor -> c2 link.
  const feeds = new Map<string, string[]>();
  const byId = new Map(scenario.entities.filter(entityActive).map((e) => [e.id, e]));
  for (const c of scenario.connections) {
    const from = byId.get(c.fromId);
    const to = byId.get(c.toId);
    if (!from || !to || from.kind !== 'sensor' || to.kind !== 'c2') continue;
    const list = feeds.get(to.id);
    if (list) list.push(from.id);
    else feeds.set(to.id, [from.id]);
  }

  interface LiveThreat {
    startS: number;
    endS: number;
    sensorIds: string[];
  }
  const live: LiveThreat[] = [];
  for (const a of assessments) {
    if (a.firstDetectS == null) continue;
    const endS = a.trackQuality?.lastTrackS ?? a.arrivalS ?? a.cpaS ?? a.firstDetectS;
    live.push({ startS: a.firstDetectS, endS, sensorIds: a.detectingSensorIds });
  }

  const loadAt = (c2Id: string, tS: number): number => {
    const sensors = feeds.get(c2Id) ?? [];
    let n = 0;
    for (const sid of sensors) n += load.countAtSensor(sid, tS);
    for (const lt of live) {
      if (tS < lt.startS || tS > lt.endS) continue;
      if (lt.sensorIds.some((sid) => sensors.includes(sid))) n += 1;
    }
    return n;
  };

  return {
    active: true,
    loadAt,
    delayS(c2Id, uasId, tS, decision) {
      const spec = specs.get(c2Id);
      if (!spec) return NO_DELAY;
      const u = draw.latency(c2Id, uasId, tS, decision);
      const medianS = spec.decisionLatencyS!;
      const base = decisionLatencyS(medianS, spec.decisionLatencySigmaDb, u);
      // Only the excess over the median is charged; a decision faster than the
      // median never shortens a doctrine dwell, and the floor reports it.
      const raw = base * overloadFactor(loadAt(c2Id, tS), spec.operatorTrackCapacity) - medianS;
      return raw < 0
        ? { extraS: 0, floored: true, decided: true }
        : { extraS: raw, floored: false, decided: true };
    },
  };
}
