import type { EffectorSpec } from '../model/types';
import type { ExpenditureChannel } from './pk';

export interface ThreatAttrition {
  uasId: string;
  /** Ships in the formation; 1 when the entity flies alone. */
  shipCount: number;
  /**
   * DEFEATS: expected ships killed at or before arrival, hard plus soft. Kill
   * mass whose effect landed after the threat was already inside the defended
   * asset's boundary is NOT here; it is in expectedLateKills.
   */
  expectedKills: number;
  /** Pre-arrival ships destroyed by hard-kill effectors. */
  expectedHardKills: number;
  /** Pre-arrival mission kills through the soft channel (jam ends the approach). */
  expectedSoftKills: number;
  /**
   * Kill mass whose effect landed strictly after arrival. Real destruction,
   * but it did not defend the asset, so it never counts toward the defeat
   * rate. Always 0 for a threat with no arrival.
   */
  expectedLateKills: number;
  /** Post-arrival hard-kill mass; part of expectedLateKills. */
  expectedLateHardKills: number;
  /** Post-arrival soft-kill mass; part of expectedLateKills. */
  expectedLateSoftKills: number;
  /**
   * True when this threat crossed a defended boundary, i.e. its assessment
   * carries an arrivalS. False for a fly-by and for every threat when no
   * asset is placed.
   */
  arrived: boolean;
  /**
   * Ships of this threat that reached the defended asset undefeated:
   * shipCount minus the pre-arrival kill mass. Zero when arrived is false.
   * Kill mass that landed after the crossing stays inside this figure; a
   * leaker destroyed too late still leaked.
   */
  expectedLeakers: number;
  /**
   * Ships of this threat that were neither defeated nor arrived: they never
   * crossed a defended boundary. Zero when arrived is true. Together with
   * expectedKills and expectedLeakers this partitions shipCount exactly.
   */
  expectedNoArrival: number;
  /** Mean per-ship survival probability AT ARRIVAL; 1 = certain leaker. */
  leakProbability: number;
  /** Mean probability a ship's track is jam-degraded on arrival ('continue'). */
  continueJamProb: number;
  /** First salvo of any channel at this threat; null when never engaged. */
  firstShotS: number | null;
  /** Kinetic salvos (interceptor, gun, net) fired at this threat. */
  shotsFired: number;
  /** Directed-energy bursts (DE, HPM) directed at this threat. */
  deSalvos: number;
  /** Jammer salvos of every behavior directed at this threat. */
  jamSalvos: number;
  /** Effector with the largest expected-kill contribution, late mass included. */
  killedByEffectorId: string | null;
  /** True when killedByEffectorId is a jammer: the dominant kill is soft. */
  killedBySoft: boolean;
}

export interface EffectorAttrition {
  effectorId: string;
  /** Kinetic salvos; 0 for DE, HPM, and jammers (see deSalvos, jamSalvos). */
  shotsFired: number;
  /** Directed-energy bursts; 0 for every other effector class. */
  deSalvos: number;
  /** Jammer salvos of every behavior; 0 for every other effector class. */
  jamSalvos: number;
  /** Null when the magazine is unlimited (jammers, DE, HPM). */
  expectedRoundsRemaining: number | null;
}

export interface AttritionTotals {
  /** Total ships across all threats with flight paths. */
  raidSize: number;
  /** Pre-arrival hard plus soft kills: the raid's defeat mass. */
  expectedKills: number;
  expectedHardKills: number;
  expectedSoftKills: number;
  /**
   * Kill mass that landed after arrival. Excluded from expectedKills and
   * included in expectedLeakers: it is a sub-measure of the leaker mass, not
   * a deduction from it.
   */
  expectedLateKills: number;
  /**
   * PARTITION TERM, not a display value: ships that reached a defended asset
   * undefeated. Zero when nothing arrived, which an asset-free run cannot
   * tell apart from a perfect defence, so print reportedLeakers instead.
   */
  expectedLeakers: number;
  /**
   * Ships neither defeated nor arrived: they never crossed a defended
   * boundary. A fly-by that turned away short, or a run with no asset placed.
   * expectedKills + expectedLeakers + expectedNoArrival === raidSize.
   */
  expectedNoArrival: number;
  /**
   * The leaker figure a caller may DISPLAY: expectedLeakers when the scenario
   * places at least one asset, null when it places none. Null means "not
   * measurable", so render a dash, never 0.
   */
  reportedLeakers: number | null;
  /** Kinetic salvos (interceptor, gun, net) only. */
  shotsFired: number;
  /** Directed-energy bursts (DE, HPM). */
  deSalvos: number;
  /** Jammer salvos of every behavior. */
  jamSalvos: number;
  /**
   * Operator decisions the C2 queue took over the run: two per (threat,
   * effector) pair it decided for, the declare gate and the weapon assignment
   * (operator.ts). 0 with an inactive queue. Absent in a legacy ledger.
   */
  operatorDecisions?: number;
  /**
   * Of those decisions, the ones whose raw wait fell below 0 and the floor
   * discarded: the draw came back faster than its median, so the queue charged
   * nothing. 0 with an inactive queue. Absent in a legacy ledger.
   */
  operatorFlooredDecisions?: number;
}

/**
 * One salvo in the engagement ledger. Events are emitted in assignment-time
 * order; killDelta is filled in when the effect applies at tEffectS. Prefix
 * aggregation by tS gives shots-so-far; by tEffectS it gives kills-so-far
 * and per-threat expected state at any sim time.
 */
export interface EngagementEvent {
  /** Assignment (trigger) time; magazine, cooldown, and counts land here. */
  tS: number;
  /** Physical release: assignment plus resolved engagement delay. Absent in legacy ledgers. */
  tReleaseS?: number;
  /** Effect time: tS + engageTimeS + the flyout (interceptAt); kill or jam math lands here. */
  tEffectS: number;
  effectorId: string;
  uasId: string;
  /** Formation ship the salvo is aimed at; 0 for a lone airframe. */
  shipIdx: number;
  /** 'jam' = a 'continue' jam salvo (degrades the track, removes no
   *  survival); 'kill' = any salvo that removes survival, hard or soft. */
  channel: 'kill' | 'jam';
  /** True when the firing effector is a jammer (soft channel). */
  softShot: boolean;
  /** Firing effector's type, so a reader never has to re-look up the spec. */
  effectorType: EffectorSpec['effectorType'];
  /** What the salvo cost: kinetic round, directed-energy burst, or EW dwell. */
  channelClass: ExpenditureChannel;
  /**
   * True when tEffectS is strictly after the target threat's arrivalS. The
   * kill still happens; it just lands too late to have defended the asset, so
   * its mass is credited to expectedLateKills. False when the threat has no
   * arrival.
   */
  lateEffect: boolean;
  /** Geometry Pk evaluated at tEffect. */
  pk: number;
  /** Expected-kill mass removed when the effect applied; 0 for 'continue' jams. */
  killDelta: number;
  /**
   * The C2 node that assigned the salvo: the last node on the kill-chain route
   * (`KillChainRoute.viaC2Ids`) from the sensors that had detected the threat
   * when the route was built. Null on a direct or standalone route with no C2
   * node. Absent in a legacy ledger, whose reader falls back to routing the
   * effector over the full-run detecting sensors.
   */
  c2Id?: string | null;
  /**
   * Present only when the flight time was capped at the end of the in-range
   * window: the target would have left the envelope before the interceptor
   * arrived, so the effect lands at the window end.
   */
  flightCapped?: true;
}

export interface AttritionReport {
  threats: ThreatAttrition[];
  effectors: EffectorAttrition[];
  totals: AttritionTotals;
  /** Every salvo, in assignment-time order (see EngagementEvent). */
  events: EngagementEvent[];
}
