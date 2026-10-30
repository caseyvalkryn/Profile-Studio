import type {
  EffectorSpec,
  Entity,
  FlightPath,
  Scenario,
  SensorSpec,
  SensorType,
  UasSpec,
  Vec2,
} from '../model/types';
import {
  defaultSensorRole,
  effectiveDoctrine,
  entityActive,
  mountHeightOf,
  physicsSwitches,
  runSettings,
} from '../model/types';
import { profileFor } from '../model/integration';
import { dist, formationOffsets, pointInWedge } from '../geometry/geo';
import { slantRangeM } from '../geometry/slant';
import { modelFor, pathDurationS, pathSpeed, scenarioDurationS } from '../model/scenario';
import { effectivePathDelayS } from './raid';
import type { DrawPolicy } from './policy';
import { deterministicPolicy } from './policy';
import {
  FT_TO_M,
  effectiveDetectRangeM,
  effectorGeometryGate,
  instrumentedM,
  jammable,
  radarPdCurve,
  sensorHoldGate,
} from '../analysis/sensorEnv';
import { effectiveJamRangeM, jamBandsOverlap } from '../analysis/ewPhysics';
import { CONFIRMED_DECLARE_FACTOR, targetSFor } from '../analysis/doctrineFactors';
import { createSweepClock } from './clock';
import { memberPositions, sampleFlightPath, threatAltitudeFt } from './tracks';
import { hasFlightLimits, turnRadiusM } from './flight';
import type { SensorObservationSink } from './detection';
import type { FusedTrack, TrackEstimate, TrackEstimateSink } from './trackTypes';
import { resolvedThresholds } from './detection';
import { c2LinksFor, createFusionStage, FC_QUALITY_MIN } from './fusion';
import { classifyByMatrix, matrixFor } from './classification';
import type { SensorObservation } from './sweep';
import { extendIntervals, finishSweep, prepareSweepRun, stepSweep } from './sweep';
import { connectedEffectorIds, killChainConnected, killChainRoutes } from './killChain';

export type { SensorObservation } from './sweep';

type ThreatStatus =
  | 'no-path'
  | 'never-detected'
  /** ROE 'tight' (or doctrine) and the track never reached hostile classification. */
  | 'not-confirmed'
  | 'detect-only'
  | 'no-kill-chain'
  /** ROE 'hold': analysis-only posture, no engagement windows. */
  | 'weapons-hold'
  /** Doctrine: no radar/EO-IR sensor ever held the track for trackFirmS. */
  | 'no-stable-track'
  /** Routes exist but every routed fc-uplink effector lacks its fire-control sensor. */
  | 'no-fc-uplink'
  | 'window-too-short'
  | 'engageable';

/** Derived classification ladder (PicoGrid track statuses). Never stored. */
export type ThreatClassification = 'pending' | 'unknown' | 'suspected' | 'hostile';

/** Sim time each classification level was first reached; null = never. */
interface ClassificationTimes {
  unknownAtS: number | null;
  suspectedAtS: number | null;
  hostileAtS: number | null;
}

/**
 * What the page keeps of `fusedTracks` after retention (retainTrial.ts): the
 * first and last step with a fused track, each C2 node that formed it, and
 * each member sensor, each with the first step it held or fed the track.
 */
export interface FusedTrackSummary {
  /** First sweep step with a fused track, seconds. */
  initAtS: number;
  /** Last sweep step with a fused track, seconds. */
  lastAtS: number;
  /**
   * C2 nodes in the order they first held the fused picture; the best node can
   * change per step. A sensor-level fusion (`NO_C2`, fusion.ts) is not a node.
   */
  nodes: Array<{ c2Id: string; fromS: number }>;
  /** Member sensors in the order they first fed the fused track. */
  members: Array<{ sensorId: string; fromS: number }>;
}

/** Track continuity from first detection through closest approach/path end. */
interface TrackQualitySummary {
  heldSamples: number;
  totalSamples: number;
  continuity: number;
  longestGapS: number;
  lastTrackS: number | null;
}

/** Estimated speed above which an unknown track becomes suspected, kph (source: 50). */
const SUSPECT_SPEED_KPH = 50;

/**
 * Protected-boundary radius, meters, for an asset with no `defendedRadiusM`.
 * Warning time is measured to a boundary crossing, not to closest approach
 * (docs/te-compilation/MASTER-CALCULATIONS.md section 5). 500 m is a
 * point-defence planning factor, not a measured figure.
 */
export const DEFAULT_DEFENDED_RADIUS_M = 500;

/** Protected-boundary radius of one asset entity, meters. */
export function defendedRadiusOf(asset: Entity): number {
  const r = asset.defendedRadiusM;
  return r != null && r > 0 ? r : DEFAULT_DEFENDED_RADIUS_M;
}

/** Proximity multiple of a connected effector's max range that makes a track suspected. */
const SUSPECT_RANGE_FACTOR = 1.5;

/** Route-intent wording that marks a threat profile as an attack profile. */
const ATTACK_INTENT_KEYWORDS = ['attack', 'strike', 'raid', 'one-way', 'pgm'];

/** True when the model's route intent reads as an attack profile. */
function isAttackIntent(routeIntent: string | undefined): boolean {
  if (!routeIntent) return false;
  const s = routeIntent.toLowerCase();
  return ATTACK_INTENT_KEYWORDS.some((k) => s.includes(k));
}

export interface ThreatAssessment {
  uasId: string;
  status: ThreatStatus;
  firstDetectS: number | null;
  firstDetectSensorId: string | null;
  /** First moment two different technologies held the track at once. */
  firstConfirmS: number | null;
  /** Technologies that detected the threat at any time. */
  techs: SensorType[];
  /** True when a formation was detected but no detecting sensor could split it. */
  swarmMerged: boolean;
  /**
   * Closest point of approach (CPA) to the nearest defended asset: which asset,
   * when the sweep sampled it, and how close. Filled whenever any asset is
   * placed, even for a threat that turns away. CPA is geometry only; use
   * arrivalS for arrival.
   */
  cpaAssetId: string | null;
  cpaS: number | null;
  cpaDistanceM: number | null;
  /** Alias of cpaAssetId. */
  assetId: string | null;
  /** Alias of cpaDistanceM. */
  closestApproachM: number | null;
  /**
   * First sample time the threat is inside a defended asset's boundary radius
   * (defendedRadiusOf). Null when it never enters one or no asset is placed.
   * attrition.ts credits a defeat only when the effect lands at or before it.
   */
  arrivalS: number | null;
  /** arrival minus first detection; the early-warning buffer. Null when either is null. */
  warningS: number | null;
  /**
   * Longest usable interval [start, end] against any connected effector
   * (usable = gated length covers that effector's own engage time). When no
   * interval is usable (window-too-short), carries the longest gated
   * interval as informative geometry.
   */
  windowS: [number, number] | null;
  windowEffectorId: string | null;
  /** Time each classification level was reached on the derived ladder. */
  classificationAtS: ClassificationTimes;
  /** ROE-gated earliest engagement time: free = first detection, tight = hostile, hold = null.
   *  Doctrine enabled: max(hostile, stable track) + declaration dwell. */
  engageGateS: number | null;
  /**
   * Earliest trackInitAtS over the fire-control-quality sensors (radar or
   * EO/IR), computed whether or not doctrine is enabled. RF and acoustic
   * holds never qualify. Optional so older hand-built fixtures stay valid;
   * assessThreat always fills it.
   */
  stableTrackAtS?: number | null;
  /** The doctrinal weapons-release time (the gate); null when doctrine is off. */
  declaredHostileAtS?: number | null;
  /**
   * Doctrine: per-effector release gates. `gateS` is engagement authority
   * (firm track from a sensor routed to the effector, hostile ID, declaration
   * dwell). `readyS` is gateS plus route latency plus the target dwell
   * (targetSFor); no shot leaves before it. An effector absent here can never
   * fire at this threat. Present only when doctrine is enabled.
   */
  effectorGates?: Array<{ effectorId: string; gateS: number; readyS: number }>;
  /** Sensors that detected the threat at any time during the sweep. */
  detectingSensorIds: string[];
  /** Per-sensor detection/classification intervals retained for operator telemetry. */
  sensorObservations?: SensorObservation[];
  /**
   * The fused track at each sweep step where one exists (fusion.ts): the C2
   * picture after link latency, or the sensor-level fusion with no C2 node.
   * Per replicate; the page retention drops it and keeps `fusedTrack`.
   */
  fusedTracks?: FusedTrack[];
  /** Set only on a retained trial (retainTrial.ts); absent when nothing fused. */
  fusedTrack?: FusedTrackSummary;
  /** Union-of-sensors hold quality from first detection to the decision horizon. */
  trackQuality?: TrackQualitySummary | null;
  /**
   * Raw in-range intervals per effector, connected or not (DT-sampled,
   * before the track-quality gate). In-range = ANY formation member inside
   * the envelope (min range, max range, sector).
   */
  effectorWindows: Array<{ effectorId: string; intervals: Array<[number, number]> }>;
}

/**
 * One effector's terms against one threat: the reads of the in-range test
 * that do not move with the step. `windowGated` is a non-jammer whose
 * ceiling the threat flies above; it keeps its spec for the proximity
 * ladder and never opens a window.
 */
interface EffectorTerms {
  eff: Entity;
  spec: EffectorSpec;
  windowGated: boolean;
  reachM: number;
  dAltM: number;
  sectorDeg: number;
}

/**
 * Full timeline analysis of one threat by sampling the scenario at DT steps.
 * A missing policy is the deterministic expected-value run.
 */
export function assessThreat(
  scenario: Scenario,
  uasId: string,
  policy?: DrawPolicy,
  capture?: SensorObservationSink,
  trackSink?: TrackEstimateSink,
): ThreatAssessment {
  const base: ThreatAssessment = {
    uasId,
    status: 'no-path',
    firstDetectS: null,
    firstDetectSensorId: null,
    firstConfirmS: null,
    techs: [],
    swarmMerged: false,
    cpaAssetId: null,
    cpaS: null,
    cpaDistanceM: null,
    assetId: null,
    closestApproachM: null,
    arrivalS: null,
    warningS: null,
    windowS: null,
    windowEffectorId: null,
    classificationAtS: { unknownAtS: null, suspectedAtS: null, hostileAtS: null },
    engageGateS: null,
    stableTrackAtS: null,
    declaredHostileAtS: null,
    detectingSensorIds: [],
    sensorObservations: [],
    trackQuality: null,
    effectorWindows: [],
  };
  const path = scenario.paths.find((p) => p.entityId === uasId);
  if (!path || path.points.length < 2) return base;

  const uas = scenario.entities.find((e) => e.id === uasId);
  if (!uas) return base;
  const uasSpec = modelFor(scenario, uas)?.uas;
  const altitudeFt = threatAltitudeFt(scenario, uas);
  const altM = altitudeFt * FT_TO_M;
  const speed = pathSpeed(scenario, path);
  const duration = scenarioDurationS(scenario);
  const assets = scenario.entities.filter((e) => e.kind === 'asset');
  // A jammer that cannot reach this threat's links is not an effector against it.
  const effectors = scenario.entities.filter((e) => {
    if (e.kind !== 'effector' || !entityActive(e)) return false;
    const spec = modelFor(scenario, e)?.effector;
    if (spec?.effectorType === 'jammer' && uasSpec) {
      if (!jammable(uasSpec) || !jamBandsOverlap(spec, uasSpec)) return false;
    }
    return true;
  });

  const draw = policy ?? deterministicPolicy(resolvedThresholds(scenario));
  const delayS = effectivePathDelayS(scenario, path);
  // The sweep clock: the manifest step from the path start (clock.ts). No
  // fine step is requested here; the sweep samples at the base step.
  const clock = createSweepClock(runSettings(scenario).sweepStepS, delayS);
  const stepS = clock.baseS;
  // Fusion (fusion.ts) reads the tracker's estimates through the sink and
  // fuses them at the C2 nodes the sensors link to, after link latency.
  const activeSensors = scenario.entities.filter((e) => e.kind === 'sensor' && entityActive(e));
  const fusion = createFusionStage(
    c2LinksFor(scenario, new Set(activeSensors.map((e) => e.id))),
    physicsSwitches(scenario).includes('truthTracks'),
    stepS,
  );
  const fusionSink: TrackEstimateSink = trackSink
    ? (estimate) => {
        fusion.observe(estimate);
        trackSink(estimate);
      }
    : (estimate) => fusion.observe(estimate);
  const fusedTracks: FusedTrack[] = [];
  // Fire-control or classification sensors with a confusion matrix: the
  // matrix decides the hostile rung's classified input in place of the
  // sweep's classified flag (classification.ts). One declaration attempt per
  // sensor, at the first step it holds the track (not coasting) inside a band.
  const matrixSensors: Array<{
    sensor: Entity;
    matrix: NonNullable<SensorSpec['classification']>;
    dAltM: number;
  }> = [];
  for (const sensor of activeSensors) {
    const spec = modelFor(scenario, sensor)?.sensor;
    if (!spec) continue;
    const role = defaultSensorRole(spec);
    if (role !== 'fire-control' && role !== 'classification') continue;
    const matrix = matrixFor(spec);
    if (matrix) matrixSensors.push({ sensor, matrix, dAltM: altM - mountHeightOf(spec) });
  }
  const declarations = new Map<string, { declaredHostile: boolean; declareAtS: number }>();
  // The temporal rules (scan schedule, holds, cue order, coast, M-of-N) live in sweep.ts.
  const run = prepareSweepRun(scenario, uas, delayS, draw, capture, fusionSink);
  const detectingSensors = run.detectingSensorIds;
  // In range when any formation member is inside the envelope on slant
  // range, under the effector ceiling. A jammer's reach is its effective
  // range against this target, as attrition and the drawn cone use; its
  // cone test takes no ceiling.
  const effectorTerms: EffectorTerms[] = [];
  for (const eff of effectors) {
    const spec = modelFor(scenario, eff)?.effector;
    if (!spec) continue;
    const isJammer = spec.effectorType === 'jammer';
    effectorTerms.push({
      eff,
      spec,
      windowGated: !isJammer && effectorGeometryGate(spec, altM) !== 'ok',
      reachM: isJammer ? effectiveJamRangeM(spec, uasSpec) : spec.maxRangeM,
      dAltM: altM - mountHeightOf(spec),
      sectorDeg: spec.sectorDeg ?? 360,
    });
  }
  const assetTerms = assets.map((asset) => ({ asset, radiusM: defendedRadiusOf(asset) }));
  const trackSamples: Array<{ tS: number; held: boolean }> = [];
  const effectorInRange = new Map<string, Array<[number, number]>>();
  let classification: ThreatClassification = 'pending';
  const clsAt = base.classificationAtS;
  const speedKph = speed * 3.6;
  const attackIntent = isAttackIntent(modelFor(scenario, uas)?.threatProfile?.routeIntent);
  const hasFormation = !!uas.formation && uas.formation.count > 1;
  let closest: { assetId: string | null; tS: number | null; distM: number } = {
    assetId: null,
    tS: null,
    distM: Number.POSITIVE_INFINITY,
  };
  let arrivalS: number | null = null;

  let connectedCache: Set<string> | null = null;
  let connectedCacheSize = -1;

  for (let t = delayS; t <= duration; t = clock.next(t)) {
    const sample = sampleFlightPath(scenario, path, t);
    const pos = sample.pos;
    const members = memberPositions(uas, pos, sample.headingDeg);

    fusion.begin();
    const step = stepSweep(run, members, t);
    const fused = fusion.fuse(t);
    if (fused) fusedTracks.push(fused);
    trackSamples.push({ tS: t, held: step.held });
    if (base.firstConfirmS == null && step.measuredTechs >= 2) base.firstConfirmS = t;

    // Matrix classification: attempt once per sensor at the first non-coasting
    // hold inside a band; the declaration lands timeToDeclareS later.
    let fcClassified = step.fcClassified;
    if (matrixSensors.length > 0) {
      fcClassified = false;
      for (const { sensor, matrix, dAltM } of matrixSensors) {
        let decl = declarations.get(sensor.id);
        if (!decl) {
          const estimate: TrackEstimate | undefined = fusion.current.get(sensor.id);
          if (!estimate || estimate.coasting) continue;
          const rangeM = slantRangeM(dist(sensor.pos, pos), dAltM);
          const decision = classifyByMatrix(matrix, rangeM, draw, {
            sensorId: sensor.id,
            uasId,
            tS: t,
          });
          if (!decision) continue;
          decl = {
            declaredHostile: decision.declaredHostile,
            declareAtS: t + decision.timeToDeclareS,
          };
          declarations.set(sensor.id, decl);
        }
        if (decl.declaredHostile && t + stepS / 2 >= decl.declareAtS) fcClassified = true;
      }
    }

    // A track can climb several rungs in one step.
    if (step.measuredTechs > 0 && classification !== 'hostile') {
      if (classification === 'pending') {
        classification = 'unknown';
        clsAt.unknownAtS = t;
      }
      // Proximity is plain distance to effectors routed from the detecting
      // sensors (matching the source); the route set is rebuilt only when a
      // sensor joins.
      let nearestRatio = Number.POSITIVE_INFINITY;
      if (connectedCache == null || connectedCacheSize !== detectingSensors.size) {
        connectedCache = connectedEffectorIds(scenario, detectingSensors);
        connectedCacheSize = detectingSensors.size;
      }
      const connected = connectedCache;
      for (const { eff, spec } of effectorTerms) {
        if (!connected.has(eff.id)) continue;
        if (spec.maxRangeM <= 0) continue;
        const ratio = dist(pos, eff.pos) / spec.maxRangeM;
        if (ratio < nearestRatio) nearestRatio = ratio;
      }
      if (
        classification === 'unknown' &&
        (speedKph > SUSPECT_SPEED_KPH || attackIntent || nearestRatio <= SUSPECT_RANGE_FACTOR)
      ) {
        classification = 'suspected';
        clsAt.suspectedAtS = t;
      }
      if (classification === 'suspected' && (nearestRatio <= 1 || fcClassified)) {
        classification = 'hostile';
        clsAt.hostileAtS = t;
      }
    }

    // Lead-ship geometry: CPA and the first boundary crossing (arrival).
    for (const { asset, radiusM } of assetTerms) {
      const d = dist(pos, asset.pos);
      if (d < closest.distM) closest = { assetId: asset.id, tS: t, distM: d };
      if (arrivalS == null && d <= radiusM) arrivalS = t;
    }

    // Effector windows: the terms are per threat, the member test per step.
    for (const { eff, spec, windowGated, reachM, dAltM, sectorDeg } of effectorTerms) {
      if (windowGated) continue;
      let inRange = false;
      for (const m of members) {
        const slant = slantRangeM(dist(eff.pos, m), dAltM);
        if (
          slant >= spec.minRangeM &&
          slant <= reachM &&
          pointInWedge(eff.pos, eff.headingDeg, sectorDeg, m)
        ) {
          inRange = true;
          break;
        }
      }
      if (!inRange) continue;
      // Insertion at the first in-range step keeps the effectorWindows order.
      let intervals = effectorInRange.get(eff.id);
      if (!intervals) {
        intervals = [];
        effectorInRange.set(eff.id, intervals);
      }
      extendIntervals(intervals, t, stepS);
    }

    if (sample.done) break;
  }

  const sweep = finishSweep(run);
  base.firstDetectS = sweep.firstDetectS;
  base.firstDetectSensorId = sweep.firstDetectSensorId;
  base.techs = sweep.techs;
  base.detectingSensorIds = sweep.detectingSensorIds;
  base.sensorObservations = sweep.sensorObservations;
  base.fusedTracks = fusedTracks;
  base.effectorWindows = [...effectorInRange.entries()].map(([effectorId, intervals]) => ({
    effectorId,
    intervals,
  }));
  base.swarmMerged = hasFormation && base.firstDetectS != null && !sweep.anyResolved;
  if (closest.assetId != null) {
    base.cpaAssetId = closest.assetId;
    base.cpaS = closest.tS;
    base.cpaDistanceM = closest.distM;
    base.assetId = closest.assetId;
    base.closestApproachM = closest.distM;
  }
  base.arrivalS = arrivalS;
  if (base.firstDetectS != null && base.arrivalS != null) {
    base.warningS = base.arrivalS - base.firstDetectS;
  }
  if (base.firstDetectS != null) {
    // Continuity is judged out to closest approach: a fly-by still has a horizon.
    const horizonS = base.cpaS ?? trackSamples[trackSamples.length - 1]?.tS ?? base.firstDetectS;
    const samples = trackSamples.filter(
      (sample) => sample.tS >= base.firstDetectS! - stepS / 2 && sample.tS <= horizonS + stepS / 2,
    );
    let heldSamples = 0;
    let gapSamples = 0;
    let longestGapSamples = 0;
    let lastTrackS: number | null = null;
    for (const sample of samples) {
      if (sample.held) {
        heldSamples += 1;
        gapSamples = 0;
        lastTrackS = sample.tS;
      } else {
        gapSamples += 1;
        longestGapSamples = Math.max(longestGapSamples, gapSamples);
      }
    }
    base.trackQuality = {
      heldSamples,
      totalSamples: samples.length,
      continuity: samples.length > 0 ? heldSamples / samples.length : 0,
      longestGapS: longestGapSamples * stepS,
      lastTrackS,
    };
  }

  // Stable track file per fire-control-quality sensor: the sweep wrote
  // trackInitAtS (finishSweep), and the fused track must reach
  // FC_QUALITY_MIN at or after it (fusion.ts); the earliest one is the
  // stable track time. On the truth path the fused quality is 1 at every
  // held step, so the firm time stands.
  const doctrine = effectiveDoctrine(scenario);
  const firmBySensor = new Map<string, number>();
  for (const obs of sweep.sensorObservations) {
    if (obs.sensorType !== 'radar' && obs.sensorType !== 'eo-ir') continue;
    const firmAt = obs.trackInitAtS;
    if (firmAt == null) continue;
    const qualityAtS = fcQualityAtS(fusedTracks, firmAt, stepS);
    if (qualityAtS == null) continue;
    const stableAt = Math.max(firmAt, qualityAtS);
    firmBySensor.set(obs.sensorId, stableAt);
    if (base.stableTrackAtS == null || stableAt < base.stableTrackAtS)
      base.stableTrackAtS = stableAt;
  }

  const routes = killChainRoutes(scenario, detectingSensors);

  // ROE gates the window start: free = first detection, tight = hostile,
  // hold = none. Doctrine gates per effector: a firm track from a sensor
  // routed to it, hostile ID, then the declaration dwell (halved when two
  // phenomenologies had confirmed by declaration start).
  const roe = scenario.roe ?? 'tight';
  const effectorGateS = new Map<string, number>();
  const effectorReadyS = new Map<string, number>();
  let gateS: number | null = null;
  if (roe === 'hold') {
    gateS = null;
  } else if (doctrine.enabled) {
    const hostileAtS = base.classificationAtS.hostileAtS;
    if (hostileAtS != null && firmBySensor.size > 0) {
      for (const [effectorId, route] of routes) {
        // A standalone effector (empty source set) accepts any firm track as its cue.
        const sources =
          route.sourceSensorIds.length > 0 ? route.sourceSensorIds : [...firmBySensor.keys()];
        let firmS: number | null = null;
        for (const sid of sources) {
          const f = firmBySensor.get(sid);
          if (f != null && (firmS == null || f < firmS)) firmS = f;
        }
        if (firmS == null) continue;
        const declStartS = Math.max(hostileAtS, firmS);
        const confirmed = base.firstConfirmS != null && base.firstConfirmS <= declStartS;
        const dwellS = doctrine.declareHostileS * (confirmed ? CONFIRMED_DECLARE_FACTOR : 1);
        const effGate = declStartS + dwellS;
        effectorGateS.set(effectorId, effGate);
        const effEnt = effectors.find((e) => e.id === effectorId);
        const effSpec = effEnt ? modelFor(scenario, effEnt)?.effector : undefined;
        const targetS = effSpec ? targetSFor(effSpec, doctrine) : doctrine.targetS;
        effectorReadyS.set(effectorId, effGate + route.latencyS + targetS);
      }
      for (const g of effectorGateS.values()) if (gateS == null || g < gateS) gateS = g;
    }
    base.declaredHostileAtS = gateS;
    base.effectorGates = [...effectorGateS.entries()].map(([effectorId, g]) => ({
      effectorId,
      gateS: g,
      readyS: effectorReadyS.get(effectorId) ?? g,
    }));
  } else {
    gateS = roe === 'free' ? base.firstDetectS : base.classificationAtS.hostileAtS;
  }
  base.engageGateS = gateS;
  // A gated interval is usable when its length covers the effector's engage
  // time plus the route latency; under doctrine the interval already opens at
  // the release-ready time, so only the engage time must fit. The longest
  // usable interval wins windowS; with none usable, windowS carries the longest
  // gated interval.
  let anyUsable = false;
  let fcBlockedUsable = false;
  if (gateS != null) {
    // Only routed effectors can fire; unrouted geometry stays in effectorWindows.
    let bestUsableLen = -1;
    let bestGatedLen = 0;
    let gatedWindow: [number, number] | null = null;
    let gatedEffectorId: string | null = null;
    for (const eff of effectors) {
      const route = routes.get(eff.id);
      if (!route) continue;
      const spec = modelFor(scenario, eff)?.effector;
      if (!spec) continue;
      const effGateS = doctrine.enabled ? effectorReadyS.get(eff.id) : gateS;
      if (effGateS == null) continue;
      const needS = (spec.engageTimeS ?? 0) + (doctrine.enabled ? 0 : route.latencyS);
      // A fully typed route to an fc-uplink effector needs a fire-control sensor on it.
      const fcBlocked =
        route.typed &&
        profileFor(eff.specId)?.guidance === 'fc-uplink' &&
        route.fcSourceIds.length === 0;
      for (const [s0, s1] of effectorInRange.get(eff.id) ?? []) {
        const start = Math.max(s0, effGateS);
        const len = s1 - start;
        if (len < 0) continue;
        if (len >= needS) {
          if (fcBlocked) fcBlockedUsable = true;
          else if (len > bestUsableLen) {
            bestUsableLen = len;
            base.windowS = [start, s1];
            base.windowEffectorId = eff.id;
          }
        }
        if (len > bestGatedLen) {
          bestGatedLen = len;
          gatedWindow = [start, s1];
          gatedEffectorId = eff.id;
        }
      }
    }
    anyUsable = bestUsableLen >= 0;
    if (!anyUsable) {
      base.windowS = gatedWindow;
      base.windowEffectorId = gatedEffectorId;
    }
  }

  if (base.firstDetectS == null) {
    base.status = 'never-detected';
  } else if (effectors.length === 0) {
    base.status = 'detect-only';
  } else if (!killChainConnected(scenario, detectingSensors)) {
    base.status = 'no-kill-chain';
  } else if (roe === 'hold') {
    base.status = 'weapons-hold';
  } else if (
    doctrine.enabled &&
    (base.stableTrackAtS == null || effectorGateS.size === 0) &&
    !(base.stableTrackAtS != null && base.classificationAtS.hostileAtS == null)
  ) {
    // A firm track with no hostile ID falls through to not-confirmed instead.
    base.status = 'no-stable-track';
  } else if ((roe === 'tight' || doctrine.enabled) && base.classificationAtS.hostileAtS == null) {
    base.status = 'not-confirmed';
  } else {
    base.status = anyUsable ? 'engageable' : fcBlockedUsable ? 'no-fc-uplink' : 'window-too-short';
  }
  return base;
}

/**
 * Time the fused track reaches FC_QUALITY_MIN at or after `fromS`: `fromS`
 * itself when the first fused entry at or after it (within half a step) already
 * has the quality, else that later entry's time; null when the fused track
 * never does. A quality condition, not an existence condition at `fromS`: a
 * missed scan leaves no fused entry on that step, so the next entry stands in.
 */
function fcQualityAtS(
  fusedTracks: readonly FusedTrack[],
  fromS: number,
  stepS: number,
): number | null {
  let first = true;
  for (const f of fusedTracks) {
    if (f.fusedAtS < fromS - stepS / 2) continue;
    if (f.quality >= FC_QUALITY_MIN) return first ? fromS : f.fusedAtS;
    first = false;
  }
  return null;
}

/**
 * One threat's assessment with the dependency set it was computed from:
 * every object and value `assessThreat` read, in a fixed order, so a later
 * run can tell whether an edit touched any of them (`assessThreatReusing`).
 */
export interface ThreatAssessmentMemo {
  inputs: readonly unknown[];
  assessment: ThreatAssessment;
}

/** Ground distance from p to the segment ab, meters. */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The farthest ground distance, meters, at which `spec` can still hit this
 * target: the effective detect range of a threshold sensor, the instrumented
 * range of a Pd-modeled radar (its Pd is 0 beyond it), null when it has no
 * bound. The sweep hits on slant range, which is never below ground range,
 * so a member farther than this on the ground is never detected.
 */
function sensorReachM(
  spec: SensorSpec,
  scenario: Scenario,
  uasSpec: UasSpec | undefined,
): number | null {
  const physics = physicsSwitches(scenario);
  if (radarPdCurve(spec, scenario.environment, uasSpec, physics.includes('singlePulseRadar')))
    return instrumentedM(spec);
  return effectiveDetectRangeM(spec, scenario.environment, uasSpec, undefined, physics);
}

/**
 * How far, meters, the flown track can leave the waypoint segments under
 * the flight model `sampleFlightPath` applies (flight.ts): a turn fillet
 * stays within one turn radius of its corner, and wind drifts the ground
 * track by at most wind speed times the flight time. Zero when the legacy
 * switch or an unlimited spec keeps the track on the segments.
 */
function flightDeviationM(
  scenario: Scenario,
  path: FlightPath,
  uasSpec: UasSpec | undefined,
): number {
  if (!uasSpec || !hasFlightLimits(uasSpec) || physicsSwitches(scenario).includes('noFlightLimits'))
    return 0;
  const speed = pathSpeed(scenario, path);
  const turnM =
    uasSpec.maxTurnRateDegS != null && uasSpec.maxTurnRateDegS > 0
      ? turnRadiusM(speed, uasSpec.maxTurnRateDegS)
      : 0;
  const env = scenario.environment;
  const windM =
    env.apply && env.windSpeedMps > 0 ? env.windSpeedMps * pathDurationS(scenario, path) : 0;
  return turnM + windM;
}

/**
 * The entity objects one threat's assessment reads, in scenario order: the
 * threat itself, every asset, effector and C2 node, and every sensor that can
 * hit it. A sensor whose technology gate refuses the target, or whose reach
 * ends short of the whole flight path with formation spread and flight-model
 * deviation added, never hits, so it is left out. Markers are never read.
 */
function threatEntityInputs(scenario: Scenario, uas: Entity): Entity[] {
  const path = scenario.paths.find((p) => p.entityId === uas.id);
  // A threat with no flight path is 'no-path' before any other read.
  if (!path || path.points.length < 2) return [uas];
  const uasSpec = modelFor(scenario, uas)?.uas;
  const f = uas.formation;
  const spreadM =
    (f && f.count > 1
      ? Math.max(
          ...formationOffsets(f.shape, f.count, f.spacingM, 0).map((o) => Math.hypot(o.x, o.y)),
        )
      : 0) + flightDeviationM(scenario, path, uasSpec);
  const out: Entity[] = [uas];
  for (const e of scenario.entities) {
    if (e === uas || e.kind === 'uas' || e.kind === 'marker') continue;
    if (e.kind === 'sensor') {
      const spec = modelFor(scenario, e)?.sensor;
      if (spec) {
        const gate = sensorHoldGate(spec, uasSpec);
        if (gate !== 'ok' && gate !== 'needs-cue') continue;
        const reachM = sensorReachM(spec, scenario, uasSpec);
        if (reachM != null) {
          let nearestM = Number.POSITIVE_INFINITY;
          for (let i = 1; i < path.points.length; i++) {
            nearestM = Math.min(
              nearestM,
              distToSegment(e.pos, path.points[i - 1]!, path.points[i]!),
            );
          }
          if (nearestM - spreadM > reachM) continue;
        }
      }
    }
    out.push(e);
  }
  return out;
}

/**
 * Everything `assessThreat` reads for one threat: the scenario fields the
 * sweep, the kill chain and the gates read, the run duration, then the entities
 * (`threatEntityInputs`). Every scenario change replaces the objects it
 * touches, so identity equality on this list is exact. A new scenario read
 * inside `assessThreat`, or inside anything it calls, joins this list in the
 * same change.
 */
function threatAssessmentInputs(scenario: Scenario, uasId: string): unknown[] {
  const inputs: unknown[] = [
    scenario.paths,
    scenario.connections,
    scenario.library,
    scenario.environment,
    scenario.requirements,
    scenario.roe,
    scenario.doctrine,
    scenario.raid,
    scenario.physics,
    scenarioDurationS(scenario),
  ];
  const uas = scenario.entities.find((e) => e.id === uasId);
  if (uas) inputs.push(...threatEntityInputs(scenario, uas));
  return inputs;
}

function sameInputs(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * `assessThreat` with reuse: `prior` is returned as is when every input the
 * assessment reads is the same object it was last time, else a fresh memo.
 * Sound for a pure policy only (the deterministic run); a Monte Carlo
 * replicate draws differently each time and must assess fresh.
 */
export function assessThreatReusing(
  scenario: Scenario,
  uasId: string,
  prior: ThreatAssessmentMemo | undefined,
  policy?: DrawPolicy,
): ThreatAssessmentMemo {
  const inputs = threatAssessmentInputs(scenario, uasId);
  if (prior && sameInputs(prior.inputs, inputs)) return prior;
  return { inputs, assessment: assessThreat(scenario, uasId, policy) };
}

/** assessThreat over every active threat, one policy threaded through. */
export function assessAllThreats(
  scenario: Scenario,
  policy?: DrawPolicy,
  capture?: SensorObservationSink,
  trackSink?: TrackEstimateSink,
): ThreatAssessment[] {
  const draw = policy ?? deterministicPolicy(resolvedThresholds(scenario));
  return scenario.entities
    .filter((e) => e.kind === 'uas' && entityActive(e))
    .map((e) => assessThreat(scenario, e.id, draw, capture, trackSink));
}
