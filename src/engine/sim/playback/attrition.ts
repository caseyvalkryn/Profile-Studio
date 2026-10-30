import type { Entity, FlightPath, Scenario, SpecModel, Vec2 } from '../model/types';
import {
  DEFAULT_REQUIREMENT_THRESHOLDS,
  defaultJamBehavior,
  effectiveDoctrine,
  entityActive,
  mountHeightOf,
  physicsSwitches,
  runSettings,
} from '../model/types';
import { FT_TO_M } from '../analysis/sensorEnv';
import type { ThreatAssessment } from './sim';
import { assessAllThreats } from './sim';
import { createSweepClock } from './clock';
import { sampleFlightPath, threatAltitudeFt } from './tracks';
import { killChainRoutes } from './killChain';
import {
  CONTINUE_TRACK_DEGRADE,
  DEFAULT_PK,
  DEFAULT_SALVO_COOLDOWN_S,
  expenditureChannel,
  isHardKill,
  SHIP_DEAD_BELOW,
} from './pk';
import type {
  AttritionReport,
  EffectorAttrition,
  EngagementEvent,
  ThreatAttrition,
} from './attritionReport';
import type { EffectorState, JamHold, PendingEffect, ShipState, ThreatState } from './sweepState';
import { EPS, intervalIndexAt, launchPolicyReleases, membersAtTime } from './intercept';
import type { ShotAccepted, ShotContext } from './shot';
import type { FusedTrack } from './trackTypes';
import { evaluateShot } from './shot';
import type { DrawPolicy } from './policy';
import { deterministicPolicy } from './policy';
import { effectivePathDelayS } from './raid';
import { profileFor } from '../model/integration';
import { bdaSFor, commitPkFor } from '../analysis/doctrineFactors';
import type { FalseTrackLoad } from './falseTracks';
import type { OperatorQueue } from './operator';
import { createOperatorQueue, firstC2Of } from './operator';
import type { KillChainRoute } from './killChain';
import { projectileCount } from './ballistics';
import { hpmRechargeS } from './hpm';

/**
 * Deterministic expected-value attrition over the raid. No random rolls in
 * the deterministic policy: each salvo multiplies the target ship's survival
 * by (1 - Pk) and the magazine ledger counts the salvo. Pure function of the
 * scenario. Per-shot Pk = basePk * distanceFalloff * sizePenalty *
 * evasionPenalty (PicoGrid drone-swarm engagement calculator).
 *
 * Target assignment is global at ship level: at each tick a ready effector
 * engages, among every gated threat whose window contains t and tEffect, the
 * ship with the highest effective survival (survival discounted by salvos in
 * flight at it). Expected-dead ships (below SHIP_DEAD_BELOW) draw no fire.
 * Ties break by the threat closing soonest, then scenario order, then ship
 * index.
 *
 * A threat is a candidate for an effector only from gateS plus that
 * (effector, threat) route latency. A salvo assigned at t takes effect at
 * tEffect = t + engageTimeS + flyout (interceptAt); it is fired only when an
 * in-range interval of the same effector still contains tEffect and the
 * interceptor can reach the point. Kill math is evaluated at tEffect;
 * magazine, cooldown, firstShotS and expenditure counts stay at assignment.
 * Pending effects apply in tEffect order.
 *
 * Hard kills (interceptor, gun, net, DE, HPM) destroy the airframe. Soft
 * kills (jammer) apply the threat's JamBehavior: 'drift' and 'return-home'
 * end the approach as a soft mission kill; 'continue' leaves the threat
 * inbound with a degraded track. A 'continue' jam is illumination: its hold
 * lapses when the target leaves the jammer's in-range interval (JamHold).
 *
 * Arrival rule: a salvo whose tEffectS is strictly after the threat's
 * arrivalS is lateEffect. Survival still decrements; only the credit splits.
 * expectedKills carries pre-arrival mass (the defeat number);
 * expectedLateKills the rest, a sub-measure of the leaker mass.
 *
 * Raid partition: expectedKills + expectedLeakers + expectedNoArrival ===
 * raidSize. Leakers count only for threats that crossed a boundary; the rest
 * of the undefeated mass is no-arrival. With no asset on the board
 * expectedLeakers is 0 for arithmetic reasons, so totals.reportedLeakers is
 * null there and callers display that, never the partition term.
 *
 * Expenditure splits by effector class independently of the kill channel:
 * shotsFired (kinetic), deSalvos (DE, HPM), jamSalvos (jammer).
 */

function specFor(scenario: Scenario, entity: Entity): SpecModel | undefined {
  return scenario.library.find((m) => m.id === entity.specId) ?? undefined;
}

/** Effective path speed: override, spec cruise, or 15 m/s (matches store.pathSpeed). */
function speedFor(scenario: Scenario, path: FlightPath): number {
  if (path.speedMps && path.speedMps > 0) return path.speedMps;
  const entity = scenario.entities.find((e) => e.id === path.entityId);
  const model = entity ? specFor(scenario, entity) : undefined;
  return model?.uas?.cruiseSpeedMps ?? 15;
}

/** Survival discounted by the kill salvos already in flight at the ship. */
function effectiveAlive(s: ShipState): number {
  return s.alive * s.killDiscount;
}

/**
 * Probability the ship's track is jam-degraded at t. A hold counts only
 * while t sits inside the same in-range interval of the jammer that fired
 * it (see JamHold); independent jammers combine as 1 - product of misses.
 */
function jammedAt(ts: ThreatState, s: ShipState, t: number): number {
  if (s.jamBy.size === 0) return 0;
  let unjammed = 1;
  for (const [effectorId, hold] of s.jamBy) {
    if (intervalIndexAt(ts.windows.get(effectorId), t) === hold.intervalIdx) {
      unjammed *= 1 - hold.value;
    }
  }
  return 1 - unjammed;
}

/**
 * Take one salvo out of a ship's in-flight set and restore its discount.
 * Exact 1 when the set empties (no float drift can survive an empty set);
 * divide out the retired factor otherwise, recomputing the product from the
 * survivors when the factor is too small to divide by safely.
 */
function retirePending(set: Set<PendingEffect>, discount: number, fx: PendingEffect): number {
  set.delete(fx);
  if (set.size === 0) return 1;
  const factor = 1 - fx.pk;
  if (factor > EPS) return discount / factor;
  let p = 1;
  for (const rem of set) p *= 1 - rem.pk;
  return p;
}

/**
 * What the operator queue charged one (threat, effector) pair: the seconds, the
 * decisions taken and how many of them the floor at 0 caught. A pair the queue
 * never decided for charges nothing and counts nothing.
 */
interface OperatorCharge {
  /** Extra seconds on this pair's release-ready time. */
  extraS: number;
  /** Decisions taken: 2 (declare, assign) when the queue decided, else 0. */
  decisions: number;
  /** Of those decisions, the ones whose raw wait fell below 0 (operator.ts). */
  floored: number;
}

const NO_CHARGE: OperatorCharge = { extraS: 0, decisions: 0, floored: 0 };

/**
 * Operator delay on one (threat, effector) pair, seconds (operator.ts): the
 * declare-hostile decision taken at the gate, then the weapon-assignment
 * decision taken once the cue has crossed the route latency. Nothing with no
 * C2 node on the route or no gate for the pair. Under doctrine the gate is
 * the effector's own (effectorGates), else the threat's engageGateS.
 */
function operatorDelayS(
  queue: OperatorQueue,
  route: KillChainRoute,
  a: ThreatAssessment,
  effectorId: string,
  doctrineOn: boolean,
): OperatorCharge {
  const c2Id = firstC2Of(route);
  if (!c2Id) return NO_CHARGE;
  const gateS = doctrineOn
    ? (a.effectorGates?.find((g) => g.effectorId === effectorId)?.gateS ?? null)
    : a.engageGateS;
  if (gateS == null) return NO_CHARGE;
  const declare = queue.delayS(c2Id, a.uasId, gateS, 0);
  const assign = queue.delayS(c2Id, a.uasId, gateS + declare.extraS + route.latencyS, 1);
  return {
    extraS: declare.extraS + assign.extraS,
    decisions: (declare.decided ? 1 : 0) + (assign.decided ? 1 : 0),
    floored: (declare.floored ? 1 : 0) + (assign.floored ? 1 : 0),
  };
}

/**
 * Resolve every engagement window into expected kills, leakers and magazine
 * use. Sweeps at the manifest step (clock.ts SweepClock), with a per-effector
 * fine step available inside a burst or dwell window. Each ready effector fires
 * one salvo per salvoCooldownS at the eligible ship with the highest effective
 * survival, or holds fire with no magazine spend and no cooldown. Effects still
 * pending when the sweep ends are flushed in tEffect order. `falseLoad` is the
 * replicate's false-track load when the caller already ran that process; the
 * operator queue builds its own otherwise.
 */
export function resolveEngagements(
  scenario: Scenario,
  precomputed?: ThreatAssessment[],
  policy?: DrawPolicy,
  falseLoad?: FalseTrackLoad,
): AttritionReport {
  // A missing policy is the deterministic expected-value run.
  const draw =
    policy ?? deterministicPolicy({ ...DEFAULT_REQUIREMENT_THRESHOLDS, ...scenario.requirements });
  const assessments = (precomputed ?? assessAllThreats(scenario, draw)).filter(
    (a) => a.status !== 'no-path',
  );
  // The engagement clock: the manifest step from t = 0. `commitSalvo` may call
  // `clock.requestFineStep` for a gun burst or a directed-energy dwell; outside
  // a requested window the tick stays at the base step.
  const clock = createSweepClock(runSettings(scenario).sweepStepS, 0);
  const doctrine = effectiveDoctrine(scenario);
  const physics = physicsSwitches(scenario);
  const legacyKineticPk = physics.includes('legacyKineticPk');
  const legacyBeamPk = physics.includes('legacyBeamPk');
  // Operator queue: inactive, at no draw and zero delay, with no c2 spec that
  // states a median or with the noOperatorQueue switch.
  const operator = createOperatorQueue(scenario, assessments, draw, falseLoad);
  // The floor stamp: decisions the queue took, and the ones whose raw wait the
  // floor at 0 discarded. Both stay 0 while the queue is inactive.
  let operatorDecisions = 0;
  let operatorFlooredDecisions = 0;

  const threats: ThreatState[] = assessments.map((a) => {
    const entity = scenario.entities.find((e) => e.id === a.uasId)!;
    const uasSpec = specFor(scenario, entity)?.uas;
    const path = scenario.paths.find((p) => p.entityId === a.uasId);
    const count = entity.formation && entity.formation.count > 1 ? entity.formation.count : 1;
    const windows = new Map<string, Array<[number, number]>>();
    const routeLatencyS = new Map<string, number>();
    const assignC2Ids = new Map<string, string | null>();
    const effectorReadyS = new Map((a.effectorGates ?? []).map((g) => [g.effectorId, g.readyS]));
    if (a.status === 'engageable') {
      const routes = killChainRoutes(scenario, new Set(a.detectingSensorIds));
      for (const w of a.effectorWindows) {
        const route = routes.get(w.effectorId);
        if (!route) continue;
        // Same fc-uplink gate as assessThreat.
        if (route.typed && route.fcSourceIds.length === 0) {
          const eff = scenario.entities.find((e) => e.id === w.effectorId);
          if (profileFor(eff?.specId ?? null)?.guidance === 'fc-uplink') continue;
        }
        windows.set(w.effectorId, w.intervals);
        routeLatencyS.set(w.effectorId, route.latencyS);
        // The node that assigns this effector's salvos, fixed at route time.
        assignC2Ids.set(w.effectorId, route.viaC2Ids.at(-1) ?? null);
        if (!operator.active) continue;
        // Both operator decisions delay this pair's release-ready time: the
        // legacy path reads gateS + routeLatencyS, doctrine reads effectorReadyS.
        const charge = operatorDelayS(operator, route, a, w.effectorId, doctrine.enabled);
        operatorDecisions += charge.decisions;
        operatorFlooredDecisions += charge.floored;
        if (charge.extraS <= 0) continue;
        routeLatencyS.set(w.effectorId, route.latencyS + charge.extraS);
        const readyS = effectorReadyS.get(w.effectorId);
        if (readyS != null) effectorReadyS.set(w.effectorId, readyS + charge.extraS);
      }
    }
    return {
      a,
      entity,
      uasSpec,
      altM: threatAltitudeFt(scenario, entity) * FT_TO_M,
      path,
      sampleFlightAt: path ? (tS) => sampleFlightPath(scenario, path, tS) : undefined,
      speedMps: path ? speedFor(scenario, path) : 15,
      delayS: path ? effectivePathDelayS(scenario, path) : 0,
      ships: Array.from({ length: count }, () => ({
        alive: 1,
        hard: 0,
        soft: 0,
        lateHard: 0,
        lateSoft: 0,
        jamBy: new Map<string, JamHold>(),
        holdUntilS: 0,
        pendingKill: new Set<PendingEffect>(),
        pendingJam: new Set<PendingEffect>(),
        killDiscount: 1,
        jamDiscount: 1,
      })),
      jamBehavior: uasSpec ? defaultJamBehavior(uasSpec) : 'drift',
      windows,
      routeLatencyS,
      assignC2Ids,
      gateS: a.engageGateS,
      effectorReadyS,
      shotsFired: 0,
      deSalvos: 0,
      jamSalvos: 0,
      lastJamEffectS: null,
      firstShotS: null,
      killContrib: new Map(),
    };
  });

  const effectors = new Map<string, EffectorState>();
  for (const e of scenario.entities) {
    if (e.kind !== 'effector' || !entityActive(e)) continue;
    const spec = specFor(scenario, e)?.effector;
    if (!spec) continue;
    const legacyCooldownS = Math.max(
      spec.salvoCooldownS ?? DEFAULT_SALVO_COOLDOWN_S[spec.effectorType],
      clock.baseS,
    );
    effectors.set(e.id, {
      entity: e,
      spec,
      mountM: mountHeightOf(spec),
      pk: spec.pk ?? DEFAULT_PK[spec.effectorType],
      cooldownS: legacyBeamPk ? legacyCooldownS : hpmRechargeS(spec, legacyCooldownS),
      engageTimeS: spec.engageTimeS ?? 0,
      rounds: spec.magazineSize ?? null,
      // Route latency is charged per threat from its gate, so the battery starts ready.
      nextReadyS: 0,
      shotsFired: 0,
      deSalvos: 0,
      jamSalvos: 0,
    });
  }

  let tEnd = 0;
  for (const ts of threats) {
    for (const intervals of ts.windows.values()) {
      for (const [, s1] of intervals) if (s1 > tEnd) tEnd = s1;
    }
  }

  const events: EngagementEvent[] = [];
  // Salvos per (effector, threat, ship), every channel: the kill draw key.
  const salvoCounts = new Map<string, number>();

  // Salvos in flight, applied in tEffect order so an earlier jam degrades a later kill.
  const pending: PendingEffect[] = [];

  const applyEffect = (fx: PendingEffect) => {
    const ship = fx.target.ships[fx.shipIdx]!;
    if (fx.continueJam) {
      // A dwell in a new in-range interval starts a fresh hold: the link
      // recovered while the target was outside the beam.
      const idx = intervalIndexAt(fx.target.windows.get(fx.effectorId), fx.tEffectS);
      const hold = ship.jamBy.get(fx.effectorId);
      const p = draw.jam(fx.pk, fx.effectorId, fx.target.a.uasId, fx.tEffectS);
      if (hold && hold.intervalIdx === idx) hold.value += (1 - hold.value) * p;
      else ship.jamBy.set(fx.effectorId, { value: p, intervalIdx: idx });
      if (fx.target.lastJamEffectS == null || fx.tEffectS > fx.target.lastJamEffectS) {
        fx.target.lastJamEffectS = fx.tEffectS;
      }
    } else {
      // A track jam-degraded at the effect time worsens the firing solution.
      const pEff = fx.pk * (1 - CONTINUE_TRACK_DEGRADE * jammedAt(fx.target, ship!, fx.tEffectS));
      const kill =
        ship.alive *
        draw.kill(pEff, fx.effectorId, fx.target.a.uasId, fx.shipIdx, fx.salvoIdx, fx.tEffectS);
      ship.alive -= kill;
      // Only the credit splits: late mass defended nothing.
      if (fx.event.lateEffect) {
        if (fx.softShot) ship.lateSoft += kill;
        else ship.lateHard += kill;
      } else if (fx.softShot) {
        ship.soft += kill;
      } else {
        ship.hard += kill;
      }
      fx.event.killDelta = kill;
      fx.target.killContrib.set(
        fx.effectorId,
        (fx.target.killContrib.get(fx.effectorId) ?? 0) + kill,
      );
    }
  };

  const applyDueEffects = (upToS: number) => {
    if (pending.length === 0) return;
    pending.sort((a, b) => a.tEffectS - b.tEffectS);
    while (pending.length > 0 && pending[0]!.tEffectS <= upToS + EPS) {
      const fx = pending.shift()!;
      const ship = fx.target.ships[fx.shipIdx]!;
      if (fx.continueJam) ship.jamDiscount = retirePending(ship.pendingJam, ship.jamDiscount, fx);
      else ship.killDiscount = retirePending(ship.pendingKill, ship.killDiscount, fx);
      applyEffect(fx);
    }
  };

  // Per-tick geometry cache keyed by (threat, tEffect): effectors sharing an
  // engageTimeS land at the same tEffect.
  let tickGeom = new Map<ThreatState, Map<number, Vec2[]>>();
  const membersAt = (ts: ThreatState, tEffect: number): Vec2[] => {
    let byT = tickGeom.get(ts);
    if (!byT) {
      byT = new Map();
      tickGeom.set(ts, byT);
    }
    let g = byT.get(tEffect);
    if (!g) {
      g = membersAtTime(ts, tEffect);
      byT.set(tEffect, g);
    }
    return g;
  };

  // One salvo, committed. Shared by the volley loop and the doctrine
  // assignment pass so the bookkeeping cannot diverge.
  const commitSalvo = (
    es: EffectorState,
    target: ThreatState,
    shipIdx: number,
    pk: number,
    t: number,
    tEffect: number,
    continueJam: boolean,
    capped: boolean,
    releaseDelayS: number,
    dwellS: number,
    cooldownS: number,
  ) => {
    const softShot = !isHardKill(es.spec.effectorType);
    // Kill draw key: an added threat never shifts the key of a shot at another one.
    const salvoKey = `${es.entity.id}:${target.a.uasId}:${shipIdx}`;
    const salvoIdx = salvoCounts.get(salvoKey) ?? 0;
    salvoCounts.set(salvoKey, salvoIdx + 1);
    // The assigning node is read once at assignment; a sensor that joins the
    // chain later never moves this salvo to another node.
    const c2Id = target.assignC2Ids?.get(es.entity.id);
    const event: EngagementEvent = {
      tS: t,
      tReleaseS: t + releaseDelayS,
      tEffectS: tEffect,
      effectorId: es.entity.id,
      uasId: target.a.uasId,
      shipIdx,
      channel: continueJam ? 'jam' : 'kill',
      softShot,
      effectorType: es.spec.effectorType,
      channelClass: expenditureChannel(es.spec.effectorType),
      // Strictly after: an effect landing exactly at arrival still defends.
      lateEffect: target.a.arrivalS != null && tEffect > target.a.arrivalS + EPS,
      pk,
      killDelta: 0,
      ...(c2Id !== undefined ? { c2Id } : {}),
      ...(capped ? { flightCapped: true as const } : {}),
    };
    events.push(event);

    const fx: PendingEffect = {
      tEffectS: tEffect,
      effectorId: es.entity.id,
      target,
      shipIdx,
      salvoIdx,
      pk,
      softShot,
      continueJam,
      event,
    };
    // Zero-latency effects land in the same step; the rest wait in flight and
    // discount later aiming at the same ship.
    if (tEffect <= t + EPS) {
      applyEffect(fx);
    } else {
      const ship = target.ships[shipIdx]!;
      if (continueJam) {
        ship.pendingJam.add(fx);
        ship.jamDiscount *= 1 - pk;
      } else {
        ship.pendingKill.add(fx);
        ship.killDiscount *= 1 - pk;
      }
      pending.push(fx);
    }

    if (event.channelClass === 'ew') {
      target.jamSalvos += 1;
      es.jamSalvos += 1;
    } else if (event.channelClass === 'directed-energy') {
      target.deSalvos += 1;
      es.deSalvos += 1;
    } else {
      target.shotsFired += 1;
      es.shotsFired += 1;
    }
    if (target.firstShotS == null) target.firstShotS = t;

    if (es.rounds != null) {
      const burstRounds =
        es.spec.effectorType === 'gun' &&
        !legacyKineticPk &&
        es.spec.dispersionMils != null &&
        es.spec.fireControlErrorMils != null &&
        es.spec.rateOfFireRpm != null &&
        es.spec.muzzleVelocityMps != null
          ? (projectileCount(es.spec) ?? 1)
          : 1;
      es.rounds -= burstRounds;
    }
    // Cooldown is the spacing between assignments (one salvo per
    // salvoCooldownS, counted from t). A modeled optical dwell also holds
    // the beam director on this target until the effect lands, so the
    // effector is reserved through whichever ends later.
    es.nextReadyS = dwellS > 0 ? Math.max(t + cooldownS, tEffect) : t + cooldownS;
    // Fine-step hook (clock.ts): a burst or dwell lane requests its window
    // here. The dwell window is the credited illumination, release to effect.
    if (dwellS > 0) {
      clock.requestFineStep(es.entity.id, t + releaseDelayS, tEffect, 0.1);
    }
    if (
      es.spec.effectorType === 'gun' &&
      !legacyKineticPk &&
      es.spec.dispersionMils != null &&
      es.spec.burstRounds != null &&
      es.spec.rateOfFireRpm != null &&
      es.spec.burstRounds > 0 &&
      es.spec.rateOfFireRpm > 0
    )
      clock.requestFineStep(
        es.entity.id,
        t,
        t + (60 * Math.max(1, Math.round(es.spec.burstRounds))) / es.spec.rateOfFireRpm,
        0.1,
      );
  };

  // The fused track a shooter holds on each threat at t (sim.ts fusedTracks,
  // time-ordered): a cursor per threat advances with the tick, so the lookup
  // is amortized O(1). The picture must be current: an entry older than one
  // step is a dropped track, and the shot falls back to the truth-path
  // intercept as it does with no estimate at all. A truth-source estimate
  // keeps that path too, inside evaluateShot.
  const fusedCursor = new Map<string, number>();
  const fusedEstimateAt = (ts: ThreatState, t: number): FusedTrack | null => {
    const tracks = ts.a.fusedTracks;
    if (!tracks || tracks.length === 0) return null;
    let i = fusedCursor.get(ts.a.uasId) ?? -1;
    while (i + 1 < tracks.length && tracks[i + 1]!.state.tS <= t + EPS) i += 1;
    fusedCursor.set(ts.a.uasId, i);
    if (i < 0) return null;
    const latest = tracks[i]!;
    return t - latest.state.tS <= clock.baseS + EPS ? latest : null;
  };
  const shotContextFor = (base: ShotContext, ts: ThreatState, t: number): ShotContext => {
    const estimate = fusedEstimateAt(ts, t);
    return estimate ? { ...base, estimate } : base;
  };

  for (let t = 0; t <= tEnd + EPS; t = clock.next(t)) {
    applyDueEffects(t);
    tickGeom = new Map();
    const volleyShot: ShotContext = {
      t,
      effectContainment: 'any',
      membersAt,
      stepS: clock.baseS,
      legacyKineticPk,
      legacyBeamPk,
      environment: scenario.environment,
      beamFluenceDraw: (effectorId, uasId, shipIdx, tS) => {
        const salvoIdx = salvoCounts.get(`${effectorId}:${uasId}:${shipIdx}`) ?? 0;
        return draw.fluence?.(effectorId, uasId, shipIdx, salvoIdx, tS) ?? 0.5;
      },
    };
    const doctrineShot: ShotContext = {
      t,
      effectContainment: 'same',
      membersAt,
      stepS: clock.baseS,
      legacyKineticPk,
      legacyBeamPk,
      environment: scenario.environment,
      beamFluenceDraw: (effectorId, uasId, shipIdx, tS) => {
        const salvoIdx = salvoCounts.get(`${effectorId}:${uasId}:${shipIdx}`) ?? 0;
        return draw.fluence?.(effectorId, uasId, shipIdx, salvoIdx, tS) ?? 0.5;
      },
    };

    for (const es of effectors.values()) {
      // Under doctrine only jammers fire here: shoot-look-shoot does not apply to a dwell.
      if (doctrine.enabled && es.spec.effectorType !== 'jammer') continue;
      if (t + EPS < es.nextReadyS) continue;
      if (es.rounds != null && es.rounds <= 0) continue;
      const softShot = !isHardKill(es.spec.effectorType);

      // Global ship-level assignment (see the header). The scan order makes
      // the first candidate win exact ties. Shot eligibility (interval,
      // reach, containment, envelope, jam link) is evaluateShot's.
      let target: ThreatState | null = null;
      let shipIdx = -1;
      let hit: ShotAccepted | null = null;
      let bestWeight = 0;
      let bestArrivalS = Number.POSITIVE_INFINITY;
      for (const ts of threats) {
        if (ts.gateS == null || !ts.path) continue;
        if (!ts.windows.has(es.entity.id)) continue;
        // Under doctrine the release-ready time already carries the route latency.
        const readyS = doctrine.enabled
          ? ts.effectorReadyS.get(es.entity.id)
          : ts.gateS + (ts.routeLatencyS.get(es.entity.id) ?? 0);
        if (readyS == null || t + EPS < readyS) continue;
        const continueJam = softShot && ts.jamBehavior === 'continue';
        // Closing soonest: arrival, else closest approach for a fly-by.
        const arrivalS = ts.a.arrivalS ?? ts.a.cpaS ?? Number.POSITIVE_INFINITY;

        const volleyCtx = shotContextFor(volleyShot, ts, t);
        for (let i = 0; i < ts.ships.length; i++) {
          const shot = evaluateShot(volleyCtx, es, ts, i);
          if (shot.rejected) continue;
          const s = ts.ships[i]!;
          const alive = effectiveAlive(s!);
          if (alive < SHIP_DEAD_BELOW) continue; // expected dead: never targeted
          let weight = alive;
          if (continueJam) {
            // Un-jammed probability where the dwell would land, discounted by
            // the jam salvos already in flight.
            const unjammed = (1 - jammedAt(ts, s!, shot.intercept.tEffectS)) * s.jamDiscount;
            if (unjammed < SHIP_DEAD_BELOW) continue; // track saturated: hold
            weight = alive * unjammed;
          }
          if (
            target == null ||
            weight > bestWeight + EPS ||
            (weight > bestWeight - EPS && arrivalS < bestArrivalS - EPS)
          ) {
            target = ts;
            shipIdx = i;
            hit = shot;
            bestWeight = weight;
            bestArrivalS = arrivalS;
          }
        }
      }
      if (target == null || shipIdx < 0 || hit == null) continue;
      const continueJam = softShot && target.jamBehavior === 'continue';
      const ic = hit.intercept;
      commitSalvo(
        es,
        target,
        shipIdx,
        hit.pk,
        t,
        ic.tEffectS,
        continueJam,
        ic.capped,
        hit.releaseDelayS,
        hit.dwellS,
        hit.cooldownS,
      );
    }

    // Doctrine assignment pass (kinetic and DE). Shoot-look-shoot: a ship with
    // a kill salvo in flight or inside its BDA dwell (holdUntilS) draws no
    // fire. The best predicted per-shot Pk takes the shot. The launch policy
    // (launchPolicyReleases) decides where in the envelope a shooter
    // volunteers; every policy fires at the deadline, the last launch that
    // preserves `opportunities` engagement cycles before arrival (CPA for a
    // fly-by), capped by the closing in-range window.
    if (doctrine.enabled) {
      interface Candidate {
        es: EffectorState;
        ts: ThreatState;
        shipIdx: number;
        pk: number;
        arrivalS: number;
        /** interceptAt effect time of this ship, and its flight-time cap flag. */
        tEffectS: number;
        capped: boolean;
        releaseDelayS: number;
        dwellS: number;
        cooldownS: number;
      }
      const candidates: Candidate[] = [];
      for (const es of effectors.values()) {
        if (es.spec.effectorType === 'jammer') continue;
        if (t + EPS < es.nextReadyS) continue;
        if (es.rounds != null && es.rounds <= 0) continue;
        const esBdaS = bdaSFor(es.spec, doctrine);
        const esCommitPk = commitPkFor(es.spec, doctrine);
        for (const ts of threats) {
          if (!ts.path) continue;
          // No release-ready time for this effector: no shot.
          const readyS = ts.effectorReadyS.get(es.entity.id);
          if (readyS == null) continue;
          if (!ts.windows.has(es.entity.id)) continue;
          if (t + EPS < readyS) continue;
          const refS = ts.a.arrivalS ?? ts.a.cpaS;
          const arrivalS = ts.a.arrivalS ?? ts.a.cpaS ?? Number.POSITIVE_INFINITY;
          const doctrineCtx = shotContextFor(doctrineShot, ts, t);
          for (let i = 0; i < ts.ships.length; i++) {
            const ship = ts.ships[i]!;
            if (t + EPS < ship.holdUntilS) continue;
            if (effectiveAlive(ship!) < SHIP_DEAD_BELOW) continue;
            // The effect must land in the interval containing t: its end is the deadline.
            const shot = evaluateShot(doctrineCtx, es, ts, i);
            if (shot.rejected) continue;
            const { intercept: ic, interval: within, pk } = shot;
            const tEffect = ic.tEffectS;
            // Assignment-to-effect time: engage time plus the flyout.
            const flightS = es.engageTimeS + (tEffect - (t + es.engageTimeS));
            // A closing window is its own deadline: a high pkCommit can never
            // hold fire past the final physical shot.
            const windowDeadlineS = within[1] - flightS;
            const deadlineS =
              refS != null
                ? Math.min(refS - doctrine.opportunities * (flightS + esBdaS), windowDeadlineS)
                : windowDeadlineS;
            if (pk <= 0) continue;
            // The deadline overrides a "no" from every launch policy.
            if (!launchPolicyReleases(doctrine, pk, esCommitPk, ic.slantM, es.spec.maxRangeM)) {
              if (t + EPS < deadlineS) continue;
            }
            candidates.push({
              es,
              ts,
              shipIdx: i,
              pk,
              arrivalS,
              tEffectS: tEffect,
              capped: ic.capped,
              releaseDelayS: shot.releaseDelayS,
              dwellS: shot.dwellS,
              cooldownS: shot.cooldownS,
            });
          }
        }
      }
      // Best Pk first; near-ties (within 0.02) prefer unlimited, then fuller
      // magazines, then the threat closing soonest.
      candidates.sort((a, b) => {
        if (Math.abs(b.pk - a.pk) > 0.02) return b.pk - a.pk;
        const aInf = a.es.rounds == null ? 1 : 0;
        const bInf = b.es.rounds == null ? 1 : 0;
        if (aInf !== bInf) return bInf - aInf;
        if (a.es.rounds != null && b.es.rounds != null && a.es.rounds !== b.es.rounds) {
          return b.es.rounds - a.es.rounds;
        }
        return a.arrivalS - b.arrivalS;
      });
      const firedThisTick = new Set<EffectorState>();
      for (const c of candidates) {
        if (firedThisTick.has(c.es)) continue;
        const ship = c.ts.ships[c.shipIdx]!;
        if (t + EPS < ship.holdUntilS) continue;
        if (effectiveAlive(ship!) < SHIP_DEAD_BELOW) continue;
        commitSalvo(
          c.es,
          c.ts,
          c.shipIdx,
          c.pk,
          t,
          c.tEffectS,
          false,
          c.capped,
          c.releaseDelayS,
          c.dwellS,
          c.cooldownS,
        );
        ship.holdUntilS = c.tEffectS + bdaSFor(c.es.spec, doctrine);
        firedThisTick.add(c.es);
      }
    }
  }

  applyDueEffects(Number.POSITIVE_INFINITY);

  const threatRows: ThreatAttrition[] = threats.map((ts) => {
    const hardKills = ts.ships.reduce((s, v) => s + v.hard, 0);
    const softKills = ts.ships.reduce((s, v) => s + v.soft, 0);
    const lateHardKills = ts.ships.reduce((s, v) => s + v.lateHard, 0);
    const lateSoftKills = ts.ships.reduce((s, v) => s + v.lateSoft, 0);
    // Survival at arrival. Per-ship removed mass never exceeds 1, so the
    // partition is exact without a clamp.
    const survival = ts.ships.length - (hardKills + softKills);
    const arrived = ts.a.arrivalS != null;
    // Jam degrade is read at arrival, else at CPA, else at the last dwell.
    const jamRefS = ts.a.arrivalS ?? ts.a.cpaS ?? ts.lastJamEffectS;
    const jammed = jamRefS == null ? 0 : ts.ships.reduce((s, v) => s + jammedAt(ts, v, jamRefS), 0);
    let killedBy: string | null = null;
    let best = 0;
    for (const [id, v] of ts.killContrib) {
      if (v > best + EPS) {
        best = v;
        killedBy = id;
      }
    }
    const killedBySpec = killedBy ? effectors.get(killedBy)?.spec : undefined;
    return {
      uasId: ts.a.uasId,
      shipCount: ts.ships.length,
      expectedKills: hardKills + softKills,
      expectedHardKills: hardKills,
      expectedSoftKills: softKills,
      expectedLateKills: lateHardKills + lateSoftKills,
      expectedLateHardKills: lateHardKills,
      expectedLateSoftKills: lateSoftKills,
      arrived,
      expectedLeakers: arrived ? survival : 0,
      expectedNoArrival: arrived ? 0 : survival,
      leakProbability: ts.ships.length > 0 ? survival / ts.ships.length : 1,
      continueJamProb: ts.ships.length > 0 ? jammed / ts.ships.length : 0,
      firstShotS: ts.firstShotS,
      shotsFired: ts.shotsFired,
      deSalvos: ts.deSalvos,
      jamSalvos: ts.jamSalvos,
      killedByEffectorId: killedBy,
      killedBySoft: killedBySpec != null && !isHardKill(killedBySpec.effectorType),
    };
  });

  const effectorRows: EffectorAttrition[] = [...effectors.values()].map((es) => ({
    effectorId: es.entity.id,
    shotsFired: es.shotsFired,
    deSalvos: es.deSalvos,
    jamSalvos: es.jamSalvos,
    expectedRoundsRemaining: es.rounds,
  }));

  const raidSize = threatRows.reduce((s, t) => s + t.shipCount, 0);
  const expectedHardKills = threatRows.reduce((s, t) => s + t.expectedHardKills, 0);
  const expectedSoftKills = threatRows.reduce((s, t) => s + t.expectedSoftKills, 0);
  const expectedKills = expectedHardKills + expectedSoftKills;
  const expectedLeakers = threatRows.reduce((s, t) => s + t.expectedLeakers, 0);
  // Measurability is a property of the laydown, not of the flight paths.
  const hasAsset = scenario.entities.some((e) => e.kind === 'asset');
  return {
    threats: threatRows,
    effectors: effectorRows,
    totals: {
      raidSize,
      expectedKills,
      expectedHardKills,
      expectedSoftKills,
      expectedLateKills: threatRows.reduce((s, t) => s + t.expectedLateKills, 0),
      expectedLeakers,
      expectedNoArrival: threatRows.reduce((s, t) => s + t.expectedNoArrival, 0),
      reportedLeakers: hasAsset ? expectedLeakers : null,
      shotsFired: threatRows.reduce((s, t) => s + t.shotsFired, 0),
      deSalvos: threatRows.reduce((s, t) => s + t.deSalvos, 0),
      jamSalvos: threatRows.reduce((s, t) => s + t.jamSalvos, 0),
      operatorDecisions,
      operatorFlooredDecisions,
    },
    events,
  };
}
