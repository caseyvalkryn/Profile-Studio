import type { EffectorSpec, Entity, FlightPath, JamBehavior, UasSpec, Vec2 } from '../model/types';
import type { ThreatAssessment } from './sim';
import type { EngagementEvent } from './attritionReport';

/**
 * One jammer's 'continue' hold on one ship. Jamming is illumination, not
 * damage: the denial exists only while the transmitter keeps painting the
 * target, so the hold is valid only while the ship stays inside the SAME
 * in-range interval of that jammer that produced the dwells. A fixed cone
 * stops jamming the moment the target flies out behind it; a later re-entry
 * starts a fresh hold from zero.
 */
export interface JamHold {
  /** Compounded probability the jam degrades this ship's track. */
  value: number;
  /** Index of the jammer's in-range interval the dwells landed in; -1 when
   *  the geometry is unknown (the hold never lapses). */
  intervalIdx: number;
}

export interface ShipState {
  /** Probability the ship is still inbound (not hard- or mission-killed). */
  alive: number;
  /** Expected hard kills of this ship credited AT OR BEFORE arrival. */
  hard: number;
  /** Expected soft (mission) kills of this ship credited AT OR BEFORE arrival. */
  soft: number;
  /** Hard-kill mass that landed after arrival: destroyed, but too late. */
  lateHard: number;
  /** Soft-kill mass that landed after arrival: destroyed, but too late. */
  lateSoft: number;
  /** 'Continue' jam holds by jammer entity id (see JamHold). */
  jamBy: Map<string, JamHold>;
  /**
   * Doctrine shoot-look-shoot lockout: no kill salvo targets this ship
   * before this time (assigned salvo's effect time + the BDA dwell).
   * Always 0 when doctrine is off.
   */
  holdUntilS: number;
  /** Kill-channel salvos in flight at this ship (assigned, effect pending). */
  pendingKill: Set<PendingEffect>;
  /** 'Continue' jam salvos in flight at this ship. */
  pendingJam: Set<PendingEffect>;
  /** Running product of (1 - pk) over pendingKill, maintained on push/retire. */
  killDiscount: number;
  /** Running product of (1 - pk) over pendingJam. */
  jamDiscount: number;
}

/** Engine-internal state of one threat during the attrition sweep. */
export interface ThreatState {
  a: ThreatAssessment;
  entity: Entity;
  uasSpec: UasSpec | undefined;
  /** Flight altitude, meters AGL (threatAltitudeFt), constant along the path. */
  altM: number;
  path: FlightPath | undefined;
  /** Scenario-aware flight sampler; absent on legacy unit fixtures. */
  sampleFlightAt?: (tS: number) => { pos: Vec2; headingDeg: number };
  speedMps: number;
  /** Effective path start delay, seconds (effectivePathDelayS). */
  delayS: number;
  /** One expected-value state per ship in the formation. */
  ships: ShipState[];
  /** Response to a successful jam; spec value or nav-mode default. */
  jamBehavior: JamBehavior;
  /** In-range intervals per connected effector; empty unless engageable. */
  windows: Map<string, Array<[number, number]>>;
  /**
   * Minimum kill-chain route latency from the detecting sensors to each
   * connected effector, seconds. Charged from gateS, not from T0: the cue has
   * to reach the shooter before it can be told to fire.
   */
  routeLatencyS: Map<string, number>;
  /**
   * The assigning C2 node per connected effector: the last node of the route
   * `routeLatencyS` was read from, null on a route with no C2 node. Written onto
   * each salvo's event (`EngagementEvent.c2Id`). Absent on legacy unit fixtures.
   */
  assignC2Ids?: Map<string, string | null>;
  /** Time the required track quality was met; shots start no earlier. */
  gateS: number | null;
  /**
   * Doctrine: per-effector RELEASE-READY times from
   * ThreatAssessment.effectorGates[].readyS (route-aware firm track +
   * declaration + route latency + target dwell). Empty when doctrine is off.
   * An effector with no entry cannot fire at this threat under doctrine.
   */
  effectorReadyS: Map<string, number>;
  shotsFired: number;
  deSalvos: number;
  jamSalvos: number;
  /** Effect time of the last 'continue' jam dwell; null when never jammed. */
  lastJamEffectS: number | null;
  firstShotS: number | null;
  /** Expected kills contributed per effector, for killedByEffectorId. */
  killContrib: Map<string, number>;
}

/** Engine-internal state of one effector during the attrition sweep. */
export interface EffectorState {
  entity: Entity;
  spec: EffectorSpec;
  /** Launcher or emitter height above ground, meters. */
  mountM: number;
  pk: number;
  cooldownS: number;
  /** Seconds from assignment to release; 0 for pre-latency saves. */
  engageTimeS: number;
  /** Null = unlimited. */
  rounds: number | null;
  nextReadyS: number;
  shotsFired: number;
  deSalvos: number;
  jamSalvos: number;
}

/** A salvo in flight: assigned, magazine spent, effect not yet applied. */
export interface PendingEffect {
  tEffectS: number;
  effectorId: string;
  target: ThreatState;
  shipIdx: number;
  /**
   * Salvos this effector committed at this ship before this one, every
   * channel together: the kill draw key.
   */
  salvoIdx: number;
  /** Geometry Pk evaluated at tEffect (position, falloff, size, evasion). */
  pk: number;
  softShot: boolean;
  continueJam: boolean;
  /** Ledger entry to receive killDelta when the effect applies. */
  event: EngagementEvent;
}
