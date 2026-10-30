import type { Entity, Scenario } from '../model/types';
import { effectiveDoctrine, entityActive } from '../model/types';
import { profileFor } from '../model/integration';
import { defaultLinkLatencyS } from '../analysis/doctrineFactors';

/**
 * One effector's best kill-chain route from the detecting sensors.
 * latencyS is the minimum summed edge latency over every valid path.
 */
export interface KillChainRoute {
  effectorId: string;
  latencyS: number;
  /** C2 entities on the min-latency path, in hop order (empty for direct/standalone). */
  viaC2Ids: string[];
  /**
   * Every detecting sensor with ANY valid path to this effector. Doctrine
   * uses it for route-aware track gating: only a firm track from one of
   * these sensors can authorize this effector's shot. Empty for a standalone
   * effector's own-radar route.
   */
  sourceSensorIds: string[];
  /**
   * Detecting sensors on any valid path that satisfy the effector's
   * fire-control uplink: profile fcSources, or a researched fc-uplink pairing
   * with the effector. A cue-role pairing is NOT fire control (TPQ-50 cues
   * Coyote inside FS-LIDS but cannot close the engagement).
   */
  fcSourceIds: string[];
  /**
   * True when every valid path is fully typed (researched links only): the
   * profile's fc-uplink gate binds. Any untyped hand-drawn edge — or a
   * standalone effector's own-radar path — keeps legacy semantics.
   */
  typed: boolean;
}

/** C2-to-C2 interop hops a route may traverse (interop is mutual: both directions). */
const MAX_C2_HOPS = 2;

/**
 * Kill-chain routing graph over active entities. Paths run sensor -> effector
 * direct, or sensor -> c2 (-> c2, up to MAX_C2_HOPS interop hops) -> effector;
 * sensor->c2 and c2->effector edges keep their stored direction, c2-c2 edges
 * traverse both ways. Edge latency is the connection's latencyS (absent = 0).
 * A fully typed path to an effector whose profile sets requiredC2 only counts
 * when a qualifying C2 sits on it — a failing path is no path at all.
 * Standalone effectors (own radar / operator-aimed) always get a zero-latency
 * route with no via.
 */
export function killChainRoutes(
  scenario: Scenario,
  sensorIds: ReadonlySet<string>,
): Map<string, KillChainRoute> {
  // Disabled entities drop out of the chain entirely.
  const active = scenario.entities.filter(entityActive);
  const byId = new Map(active.map((e) => [e.id, e]));

  interface Edge {
    toId: string;
    latencyS: number;
    typed: boolean;
  }
  const out = new Map<string, Edge[]>();
  const c2Adj = new Map<string, Edge[]>();
  const push = (m: Map<string, Edge[]>, key: string, e: Edge) => {
    const list = m.get(key);
    if (list) list.push(e);
    else m.set(key, [e]);
  };
  // Doctrine charges a realistic default hop latency on links that set none;
  // legacy keeps the unset-means-zero contract.
  const doctrine = effectiveDoctrine(scenario);
  for (const c of scenario.connections) {
    const from = byId.get(c.fromId);
    const to = byId.get(c.toId);
    if (!from || !to) continue;
    const latencyS = c.latencyS ?? (doctrine.enabled ? defaultLinkLatencyS(from.kind, to.kind) : 0);
    const typed = c.confidence != null;
    if (from.kind === 'c2' && to.kind === 'c2') {
      push(c2Adj, c.fromId, { toId: c.toId, latencyS, typed });
      push(c2Adj, c.toId, { toId: c.fromId, latencyS, typed });
    } else {
      push(out, c.fromId, { toId: c.toId, latencyS, typed });
    }
  }

  interface Scratch {
    latencyS: number;
    viaC2Ids: string[];
    fcSourceIds: Set<string>;
    sourceSensorIds: Set<string>;
    /** Stays true only while EVERY recorded path is fully typed. */
    typed: boolean;
  }
  const best = new Map<string, Scratch>();

  const record = (
    sensor: Entity,
    effectorId: string,
    latencyS: number,
    viaC2Ids: string[],
    pathTyped: boolean,
  ) => {
    const effSpecId = byId.get(effectorId)?.specId ?? null;
    const profile = profileFor(effSpecId);
    // requiredC2 gate binds on fully typed paths only.
    if (pathTyped && profile?.requiredC2?.length) {
      const satisfied = viaC2Ids.some((id) => {
        const specId = byId.get(id)?.specId;
        return specId != null && profile.requiredC2!.includes(specId);
      });
      if (!satisfied) return;
    }
    let s = best.get(effectorId);
    if (!s) {
      s = {
        latencyS,
        viaC2Ids,
        fcSourceIds: new Set(),
        sourceSensorIds: new Set(),
        typed: pathTyped,
      };
      best.set(effectorId, s);
    } else {
      if (latencyS < s.latencyS) {
        s.latencyS = latencyS;
        s.viaC2Ids = viaC2Ids;
      }
      s.typed = s.typed && pathTyped;
    }
    s.sourceSensorIds.add(sensor.id);
    const fcMatch =
      sensor.specId != null &&
      (profile?.fcSources?.includes(sensor.specId) ||
        profile?.pairs.some((p) => p.withSpecId === sensor.specId && p.role === 'fc-uplink') ||
        profileFor(sensor.specId)?.pairs.some(
          (p) => p.withSpecId === effSpecId && p.role === 'fc-uplink',
        ));
    if (fcMatch) s.fcSourceIds.add(sensor.id);
  };

  const walkC2 = (sensor: Entity, chain: string[], latencyS: number, typed: boolean) => {
    const last = chain[chain.length - 1];
    for (const e of out.get(last!) ?? []) {
      if (byId.get(e.toId)?.kind === 'effector') {
        record(sensor, e.toId, latencyS + e.latencyS, chain, typed && e.typed);
      }
    }
    if (chain.length > MAX_C2_HOPS) return;
    for (const e of c2Adj.get(last!) ?? []) {
      if (chain.includes(e.toId)) continue;
      walkC2(sensor, [...chain, e.toId], latencyS + e.latencyS, typed && e.typed);
    }
  };

  for (const sensorId of sensorIds) {
    const sensor = byId.get(sensorId);
    if (!sensor || sensor.kind !== 'sensor') continue;
    for (const e of out.get(sensorId) ?? []) {
      const next = byId.get(e.toId);
      if (next?.kind === 'effector') record(sensor, e.toId, e.latencyS, [], e.typed);
      else if (next?.kind === 'c2') walkC2(sensor, [e.toId], e.latencyS, e.typed);
    }
  }

  // Standalone effectors complete their role with zero connections: their
  // own-radar path is a zero-latency legacy route that wins any latency race.
  for (const e of active) {
    if (e.kind !== 'effector' || !profileFor(e.specId)?.standalone) continue;
    const s = best.get(e.id);
    if (s) {
      s.latencyS = 0;
      s.viaC2Ids = [];
      s.typed = false;
    } else {
      best.set(e.id, {
        latencyS: 0,
        viaC2Ids: [],
        fcSourceIds: new Set(),
        sourceSensorIds: new Set(),
        typed: false,
      });
    }
  }

  const routes = new Map<string, KillChainRoute>();
  for (const [effectorId, s] of best) {
    routes.set(effectorId, {
      effectorId,
      latencyS: s.latencyS,
      viaC2Ids: s.viaC2Ids,
      fcSourceIds: [...s.fcSourceIds],
      sourceSensorIds: [...s.sourceSensorIds],
      typed: s.typed,
    });
  }
  return routes;
}

/** Effector ids with a kill-chain route from the given sensors (incl. standalone). */
export function connectedEffectorIds(
  scenario: Scenario,
  sensorIds: ReadonlySet<string>,
): Set<string> {
  return new Set(killChainRoutes(scenario, sensorIds).keys());
}

/** True when some effector has a kill-chain route (or completes one standalone). */
export function killChainConnected(scenario: Scenario, sensorIds: ReadonlySet<string>): boolean {
  return connectedEffectorIds(scenario, sensorIds).size > 0;
}
