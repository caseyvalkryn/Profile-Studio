import type { AttritionReport, EngagementEvent } from './attritionReport';
import { SHIP_DEAD_BELOW } from './pk';

/**
 * The one dead rule, a per-ship latch that matches the engine's targeting
 * (attrition.ts: a ship whose survival is below SHIP_DEAD_BELOW is never
 * targeted, and each event's killDelta is the mass that salvo removed from
 * ship `shipIdx`). Per ship, alive is 1 minus the summed killDelta of that
 * ship's events in effect-time order (ledger order on a tie; the engine may
 * apply two effects within EPS of each other in the other order, a sum that
 * differs by at most one ulp); the ship latches dead at the event where alive first falls strictly below the
 * cutoff. killDelta is never negative, so the latch is one-way. The threat is
 * dead once every ship in [0, shipCount) has latched, at the latest ship
 * latch: the effect that killed its last ship. A threat that never reaches
 * that is alive (null).
 *
 * Late kill mass counts here exactly like pre-arrival mass: whether the
 * airframe still flies is a survival question, and a late kill still
 * destroys it. Fractional mass (the deterministic readers) and whole-ship
 * draws (every trial) go through the same rule.
 */

export interface DeathRecord {
  /** Effect time of the salvo that killed the last ship. */
  tS: number;
  /** True when that salvo came from a jammer: the last ship was mission-killed. */
  soft: boolean;
  /** True when that salvo landed after the threat's arrival (`lateEffect`). */
  late: boolean;
  /** True when the ship latches include both a hard and a soft kill. */
  mixed: boolean;
}

interface ShipLatch {
  tS: number;
  soft: boolean;
  late: boolean;
}

interface ThreatLatches {
  /** Ship count the report row states, or null when the threat has no row. */
  rowShipCount: number | null;
  /** Highest shipIdx seen in the ledger, plus one. */
  maxShipCount: number;
  /** Per shipIdx, the latching event, or undefined while the ship lives. */
  latches: Map<number, ShipLatch>;
}

/**
 * The per-ship latches, computed once per report. Readers call `deadTimeOf`
 * per frame, and the engine never mutates a report after it returns it
 * (`killDelta` is filled in while `resolveEngagements` runs), so identity is
 * a safe key.
 */
const latchCache = new WeakMap<AttritionReport, Map<string, ThreatLatches>>();

function latchesOf(report: AttritionReport): Map<string, ThreatLatches> {
  const hit = latchCache.get(report);
  if (hit) return hit;
  const out = new Map<string, ThreatLatches>();
  const threatOf = (uasId: string): ThreatLatches => {
    let t = out.get(uasId);
    if (!t) {
      t = { rowShipCount: null, maxShipCount: 0, latches: new Map() };
      out.set(uasId, t);
    }
    return t;
  };
  for (const row of report.threats) threatOf(row.uasId).rowShipCount = row.shipCount;
  const byThreat = new Map<string, EngagementEvent[]>();
  for (const event of report.events) {
    const list = byThreat.get(event.uasId);
    if (list) list.push(event);
    else byThreat.set(event.uasId, [event]);
  }
  for (const [uasId, events] of byThreat) {
    const t = threatOf(uasId);
    // A stable sort keeps ledger order on an effect-time tie.
    const ordered = events.map((e, i) => [e, i] as const);
    ordered.sort((a, b) => a[0].tEffectS - b[0].tEffectS || a[1] - b[1]);
    const alive = new Map<number, number>();
    for (const [event] of ordered) {
      const ship = event.shipIdx;
      if (ship + 1 > t.maxShipCount) t.maxShipCount = ship + 1;
      if (t.latches.has(ship)) continue;
      const left = (alive.get(ship) ?? 1) - event.killDelta;
      alive.set(ship, left);
      if (left < SHIP_DEAD_BELOW) {
        t.latches.set(ship, { tS: event.tEffectS, soft: event.softShot, late: event.lateEffect });
      }
    }
  }
  latchCache.set(report, out);
  return out;
}

/**
 * The threat's death, or null while any of its ships lives. `shipCount`
 * resolves as the report row's; with no row, the caller's; else the highest
 * `shipIdx` in the ledger plus one. A threat with no events, or a resolved
 * ship count of zero or less, is null.
 */
export function deadTimeOf(
  report: AttritionReport,
  uasId: string,
  shipCount?: number,
): DeathRecord | null {
  const t = latchesOf(report).get(uasId);
  if (!t || t.maxShipCount === 0) return null;
  const ships = t.rowShipCount ?? shipCount ?? t.maxShipCount;
  if (ships <= 0) return null;
  let last: ShipLatch | null = null;
  let hard = false;
  let soft = false;
  for (let ship = 0; ship < ships; ship++) {
    const latch = t.latches.get(ship);
    if (!latch) return null;
    if (latch.soft) soft = true;
    else hard = true;
    if (last == null || latch.tS > last.tS) last = latch;
  }
  if (last == null) return null;
  return { tS: last.tS, soft: last.soft, late: last.late, mixed: hard && soft };
}

/** The death of every dead threat in the report (rows and events), keyed by uasId. */
export function deadRecords(report: AttritionReport): Map<string, DeathRecord> {
  const out = new Map<string, DeathRecord>();
  for (const uasId of latchesOf(report).keys()) {
    const dead = deadTimeOf(report, uasId);
    if (dead) out.set(uasId, dead);
  }
  return out;
}

/** The death time of every dead threat in the report, keyed by uasId. */
export function expectedDeadTimes(report: AttritionReport): Map<string, number> {
  const out = new Map<string, number>();
  for (const [uasId, dead] of deadRecords(report)) out.set(uasId, dead.tS);
  return out;
}

/**
 * The hard cut: the death when every ship latched hard (`!soft && !mixed`),
 * else null. A mission-killed airframe still flies, so an all-soft or a mixed
 * defeat has no cut. Picture readers (holds, track quality, the
 * classification rung, the ghost span, the kill clip) bound at this time;
 * outcome readers read the death itself.
 */
export function hardKillTimeOf(death: DeathRecord | null): number | null {
  return death && !death.soft && !death.mixed ? death.tS : null;
}
