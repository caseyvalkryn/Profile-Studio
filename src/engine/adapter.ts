/**
 * Vignette -> rangeboard Scenario.
 *
 * Profile Studio frame: metres, x east, y north, z metres AGL, bearings clockwise
 * from north. Rangeboard frame: metres, +x east, +y south (screen down), headings
 * clockwise from north. So y flips sign and bearings pass through unchanged.
 *
 * Everything the vignette does not say comes from `DEFAULTS`, each entry with the
 * reason for its value. The rangeboard model that each MVP model (spec section 6,
 * item 2) lands on is noted beside the field that carries it.
 */
import type { Effector, Sensor, SensorModel, Threat, Vignette } from '../domain/types';
import { archetypeById } from '../domain/catalog';
import { pdFromSnr } from './sim/analysis/radarPd';
import { CONFIRMED_DECLARE_FACTOR } from './sim/analysis/doctrineFactors';
import type {
  C2Spec,
  Connection,
  EffectorSpec,
  Entity,
  FlightPath,
  Scenario,
  SensorSpec,
  SpecModel,
  SwerlingCase,
  UasSpec,
  Vec2,
} from './sim/model/types';
import { createTrialManifest } from './sim/playback/trialTypes';
import type { TrialManifest } from './sim/playback/trialTypes';
import { centroid } from './geo';

export const M_TO_FT = 1 / 0.3048;

/** Planning defaults for everything the vignette does not state. */
export const DEFAULTS = {
  /** Engine sweep step, seconds. Rangeboard's own DT; the parity fixture ran at it. */
  sweepStepS: 0.5,
  /** Rules of engagement. 'tight' needs hostile ID before a shot, which is the ID gate spec 6 asks for. */
  roe: 'tight' as const,
  /**
   * Physics switches. `noFlightLimits`: the threat flies its drawn path to the end, with no
   * endurance clip, so truth positions follow the waypoints. `noFalseTracks`: no false-track
   * process, since the vignette carries no clutter model and a false track would add draws.
   */
  physics: ['noFlightLimits', 'noFalseTracks'] as const,
  /** Firm-track hold, seconds, before doctrine counts a stable track. Rangeboard DEFAULT_FIRE_DOCTRINE. */
  trackFirmS: 5,
  /** BDA dwell after a salvo effect, seconds. Rangeboard DEFAULT_FIRE_DOCTRINE. */
  bdaS: 10,
  /** Pk commit threshold for the launch policy. Rangeboard DEFAULT_FIRE_DOCTRINE. */
  pkCommit: 0.35,
  /** Shoot-look-shoot depth. Rangeboard DEFAULT_FIRE_DOCTRINE. */
  opportunities: 2,
  /** Release at max range: the vignette has no launch-policy input, so the earliest legal shot. */
  launchPolicy: 'max-range' as const,
  /** Unused by 'max-range' but required by the doctrine type. Rangeboard default. */
  launchRangeFraction: 2 / 3,
  /** Effector minimum range, metres. The vignette states only a reach. */
  effectorMinRangeM: 0,
  /** Rounds per effector. Large so magazine depth never limits an MVP engagement. */
  magazineSize: 100,
  /** Salvo cooldown, seconds. Rangeboard's shortest common cycle; the vignette has no input. */
  salvoCooldownS: 5,
  /** C2 decision latency, seconds. Chain time lives in the doctrine dwells, so the node adds none. */
  c2LatencyS: 0,
  /** Probability a non-hostile track is declared hostile. Every vignette threat is hostile. */
  pFalseHostile: 0,
  /** Endurance, minutes. Large so no endurance limit ends a path (also switched off by noFlightLimits). */
  enduranceMin: 600,
  /** Fallback cruise speed, m/s, when neither the threat nor its archetype gives one. */
  cruiseMs: 15,
  /** Defended asset radius, metres, when the asset polygon degenerates to a point. */
  assetRadiusM: 50,
  /** Threat altitude when the path has no waypoint, metres AGL. */
  altitudeM: 100,
  /** Environment: calm, 15 C, sea level, with environment derating switched off (not in the MVP). */
  environment: {
    windSpeedMps: 0,
    windFromDeg: 270,
    temperatureC: 15,
    fieldElevationFt: 0,
    apply: false,
  },
  /** Requirement thresholds, rangeboard defaults; the MVP scores DroneScore rows instead. */
  requirements: {
    maxResidualPerTrack: 0.1,
    minWarningS: null,
    pdDetect: 0.5,
    pdTrackCumulative: 0.9,
  },
  /** Vignette seed stored on the scenario when the caller passes none. */
  seed: 1,
  /**
   * Kill-chain link latency, seconds, on every adapter connection. Rangeboard would otherwise
   * charge 2 s sensor to C2 and 3 s C2 to effector under doctrine (doctrineFactors.ts
   * `defaultLinkLatencyS`); the vignette's chain time is `decisionS` + `assignS` only.
   */
  linkLatencyS: 0,
  /**
   * Declared default, not adjustable from the adapter: rangeboard halves the operator's
   * `decisionS` dwell when a second phenomenology had confirmed the track by declaration
   * start (sim.ts, `CONFIRMED_DECLARE_FACTOR`). A radar plus EO/IR vignette therefore pays
   * decisionS / 2 at the Target step; a single-phenomenology vignette pays the full dwell.
   */
  confirmedDeclareFactor: CONFIRMED_DECLARE_FACTOR,
  /**
   * Threat route intent. 'attack' sets rangeboard's attack-intent flag, so the ladder's
   * "suspected" rung opens at first detection and never delays a shot (sim.ts ladder).
   */
  routeIntent: 'attack',
};

/**
 * Losses in the vignette -> rangeboard mapping that the run cannot recover. Each entry names
 * the vignette field, what the trial does instead, and the DroneScore rows it touches.
 */
export const LOSSES = {
  /**
   * Waypoint altitude profile. Rangeboard `FlightPath.points` is `Vec2[]` and the UAS flies
   * at one altitude (`altBandFt`), so the trial flies flat at the first waypoint's z. A climb
   * or dive drawn in the vignette is lost: `detect_alt_m` (1.1.3, 1.5) is the first
   * waypoint's z, and the preview, which samples z along the path, can disagree with the run.
   */
  altitudeProfile: 'first waypoint z for the whole path',
  /** Waypoint holds (`holdS`): rangeboard flies through every waypoint. */
  waypointHolds: 'ignored',
  /** Logistic Pd width for RF, EO/IR and acoustic: a hard threshold at r50. */
  logisticWidth: 'hard threshold at r50M',
  /**
   * Sensor `minRangeM`: rangeboard `SensorSpec` has no minimum range, so the trial detects
   * inside it. run.ts post-filters the observation intervals by truth range before the stage
   * ladder (detect, track, continuity); the engine's ID draw and release gate still saw them.
   */
  sensorMinRange: 'post-filtered in run.ts; the engine ladder saw the holds',
} as const;

/** Swerling 2 and 4 are not in rangeboard (`SwerlingCase = 0 | 1 | 3`); each maps to its slow-fluctuation sibling. */
export function toSwerling(s: 0 | 1 | 2 | 3 | 4): SwerlingCase {
  if (s === 0) return 0;
  return s <= 2 ? 1 : 3;
}

function vec(x: number, y: number): Vec2 {
  return { x, y: -y };
}

function airframeOf(a: string | undefined): UasSpec['airframe'] {
  switch (a) {
    case 'fixed-wing':
    case 'delta-wing':
      return 'fixed-wing';
    case 'vtol-hybrid':
      return 'vtol';
    default:
      return 'quad';
  }
}

/** Threat altitude is constant per UAS in rangeboard (LOSSES.altitudeProfile): the first waypoint's z. */
export function threatAltitudeM(t: Threat): number {
  return t.path[0]?.z ?? DEFAULTS.altitudeM;
}

export function threatSpeedMs(t: Threat): number {
  return t.speedMs ?? archetypeById(t.type)?.cruiseMs ?? DEFAULTS.cruiseMs;
}

function uasSpec(t: Threat): UasSpec {
  const a = archetypeById(t.type);
  const altFt = Math.round(threatAltitudeM(t) * M_TO_FT);
  const airframe = airframeOf(a?.airframe);
  return {
    group: (a?.group ?? 1) as UasSpec['group'],
    airframe,
    // Swerling by airframe (rangeboard SWERLING_BY_AIRFRAME): 1 for rotorcraft, 3 for fixed-wing.
    swerling: airframe === 'fixed-wing' ? 3 : 1,
    cruiseSpeedMps: threatSpeedMs(t),
    maxSpeedMps: Math.max(threatSpeedMs(t), a?.vmaxMs ?? threatSpeedMs(t)),
    enduranceMin: DEFAULTS.enduranceMin,
    altBandFt: [altFt, altFt],
    // RF detection only for emitting threats: rf-manual emits a control link,
    // fiber emits nothing and is immune to jamming (rangeboard rfDetectable / jammable).
    navMode: a?.rf === false ? 'fiber' : 'rf-manual',
    emissionsNote: a?.rf === false ? 'RF-silent (fiber or inertial)' : 'control link emitting',
    jamBehavior: 'drift',
    weaponProfile: 'none',
  };
}

function classificationFor(m: SensorModel, rangeM: number, type: SensorSpec['sensorType']) {
  // ID dwell and correct-ID probability: one classification band over the whole range.
  return {
    sensorType: type,
    bands: [
      {
        maxRangeM: rangeM,
        pCorrect: m.pCorrectId,
        pFalseHostile: DEFAULTS.pFalseHostile,
        timeToDeclareS: m.idDwellS,
      },
    ],
  };
}

function sensorSpec(s: Sensor, hasSearchSensor: boolean): SensorSpec {
  const m = s.model;
  const common = {
    sectorDeg: s.fovDeg,
    elevationDeg: [s.elMinDeg, s.elMaxDeg] as [number, number],
    mountHeightM: s.z,
    // Gaussian track error: measurement sigma feeds the Kalman tracker (rangeboard tracks.ts).
    // Cross-range sigma equals trackErrorM at the sensor's range.
    rangeAccuracyM: m.trackErrorM,
    azimuthAccuracyDeg: (Math.atan2(m.trackErrorM, s.rangeM) * 180) / Math.PI,
    // Coast: consecutive missed scans before a track drops.
    trackDropMisses: Math.max(1, Math.round(m.coastS / m.scanS)),
  };
  if (s.kind === 'radar' && m.pd.kind === 'swerling') {
    const pd = m.pd;
    const swerling = toSwerling(pd.swerling);
    return {
      ...common,
      sensorType: 'radar',
      // fire-control role: its classification matrix drives the hostile rung.
      role: 'fire-control',
      // Radar Pd by Swerling over SNR: rangeboard calibrates r0 = detectRangeM at placardPd
      // against refRcsM2, then scales by R^-4 and the target's RCS (sensorEnv/radar.ts).
      rangeBasis: 'sourced',
      detectRangeM: pd.refRangeM,
      refRcsM2: pd.refRcsM2,
      placardPd: pdFromSnr(10 ** (pd.refSnrDb / 10), pd.pfa, swerling),
      pfa: pd.pfa,
      // The drawn range is the instrumented cap: nothing is reported beyond it.
      instrumentedRangeM: s.rangeM,
      classifyRangeM: s.rangeM,
      // M-of-N track initiation over scans at the scan period.
      updateRateS: m.scanS,
      trackInitM: m.trackM,
      trackInitN: m.trackN,
      classification: classificationFor(m, s.rangeM, 'radar'),
    };
  }
  // Logistic Pd is not in rangeboard: non-radar sensors are a hard threshold at the
  // effective range. r50 maps onto detectRangeM; the logistic width is lost (no soft edge).
  const r = m.pd.kind === 'logistic' ? m.pd.r50M : s.rangeM;
  const type: SensorSpec['sensorType'] =
    s.kind === 'eoir' ? 'eo-ir' : s.kind === 'rf' ? 'rf' : 'acoustic';
  // EO/IR in a classification role holds only a cued target (rangeboard CUED_EO_ROLES), so
  // with no search sensor beside it the camera surveys on its own and loses the ID matrix.
  const role: SensorSpec['role'] =
    type === 'eo-ir' ? (hasSearchSensor ? 'classification' : 'surveillance') : undefined;
  return {
    ...common,
    sensorType: type,
    ...(role ? { role } : {}),
    rangeBasis: 'planning',
    detectRangeM: r,
    classifyRangeM: r,
    // Track initiation for non-scan sensors is a continuous hold: M scans at the scan period.
    trackInitS: m.trackM * m.scanS,
    ...(role === 'classification' ? { classification: classificationFor(m, r, type) } : {}),
  };
}

function effectorSpec(e: Effector, assignS: number): EffectorSpec {
  const effectorType: EffectorSpec['effectorType'] =
    e.kind === 'ew' ? 'jammer' : e.kind === 'de' ? 'de' : 'interceptor';
  return {
    effectorType,
    minRangeM: DEFAULTS.effectorMinRangeM,
    maxRangeM: e.rangeM,
    sectorDeg: e.fovDeg,
    mountHeightM: e.z,
    // Engagement: time to effect and Pk per shot.
    engageTimeS: e.timeToEffectS,
    pk: e.pk,
    magazineSize: DEFAULTS.magazineSize,
    salvoCooldownS: DEFAULTS.salvoCooldownS,
    // Target chain time: weapon assignment dwell (F2T2EA Target).
    targetS: assignS,
  };
}

function entity(
  id: string,
  name: string,
  kind: Entity['kind'],
  specId: string | null,
  x: number,
  y: number,
  headingDeg: number,
  extra: Partial<Entity> = {},
): Entity {
  return { id, name, kind, specId, pos: vec(x, y), headingDeg, color: null, notes: '', ...extra };
}

function polygonRadius(pts: readonly (readonly [number, number])[], c: { x: number; y: number }) {
  let r = 0;
  for (const [x, y] of pts) r = Math.max(r, Math.hypot(x - c.x, y - c.y));
  return r > 0 ? r : DEFAULTS.assetRadiusM;
}

/** Map a vignette onto a rangeboard scenario `runTrial` accepts, with its manifest. */
export function toScenario(
  v: Vignette,
  seed: number,
  runId = 'rep-0',
): { scenario: Scenario; manifest: TrialManifest } {
  const library: SpecModel[] = [];
  const entities: Entity[] = [];
  const connections: Connection[] = [];
  const paths: FlightPath[] = [];
  const specId = (id: string) => `spec:${id}`;
  const lib = (
    id: string,
    kind: SpecModel['kind'],
    body: Pick<SpecModel, 'sensor' | 'uas' | 'effector' | 'c2' | 'threatProfile'>,
  ) => {
    library.push({
      id: specId(id),
      name: id,
      kind,
      description: '',
      color: '#888888',
      builtin: false,
      ...body,
    });
    return specId(id);
  };

  const hasSearchSensor = v.sensors.some((s) => s.kind !== 'eoir');
  for (const s of v.sensors) {
    const sid = lib(s.id, 'sensor', { sensor: sensorSpec(s, hasSearchSensor) });
    entities.push(entity(s.id, s.id, 'sensor', sid, s.x, s.y, s.bearingDeg));
  }
  for (const e of v.effectors) {
    const eid = lib(e.id, 'effector', { effector: effectorSpec(e, v.chainTime.assignS) });
    entities.push(entity(e.id, e.id, 'effector', eid, e.x, e.y, e.bearingDeg));
  }
  const c2: C2Spec = { decisionLatencyS: DEFAULTS.c2LatencyS, decisionLatencySigmaDb: null };
  const c2Nodes = v.nodes.filter((n) => n.kind === 'c2');
  for (const n of c2Nodes) {
    const cid = lib(n.id, 'c2', { c2 });
    entities.push(entity(n.id, n.id, 'c2', cid, n.x, n.y, 0));
  }
  // Kill-chain routes: rangeboard needs an explicit sensor -> C2 -> effector (or sensor ->
  // effector) link; its built-in integration profiles key on rangeboard spec ids.
  let link = 0;
  const connect = (fromId: string, toId: string) =>
    connections.push({
      id: `link-${++link}`,
      fromId,
      toId,
      label: '',
      latencyS: DEFAULTS.linkLatencyS,
    });
  if (c2Nodes.length > 0) {
    for (const n of c2Nodes) {
      for (const s of v.sensors) connect(s.id, n.id);
      for (const e of v.effectors) connect(n.id, e.id);
    }
  } else {
    for (const s of v.sensors) for (const e of v.effectors) connect(s.id, e.id);
  }
  for (const a of v.areas) {
    if (a.kind !== 'asset' || a.pts.length === 0) continue;
    const c = centroid(a.pts);
    entities.push(
      entity(a.id, a.label || a.id, 'asset', null, c.x, c.y, 0, {
        defendedRadiusM: polygonRadius(a.pts, c),
      }),
    );
  }
  for (const t of v.threats) {
    const uid = lib(t.id, 'uas', {
      uas: uasSpec(t),
      // Attack intent: the ladder's "suspected" rung opens at first detection (DEFAULTS.routeIntent).
      threatProfile: {
        designator: t.type,
        routeIntent: DEFAULTS.routeIntent,
        altitudeFt: Math.round(threatAltitudeM(t) * M_TO_FT),
        speedMps: threatSpeedMs(t),
        count: 1,
      },
    });
    const first = t.path[0];
    entities.push(
      entity(t.id, t.id, 'uas', uid, first?.x ?? 0, first?.y ?? 0, 0, {
        altitudeFt: Math.round(threatAltitudeM(t) * M_TO_FT),
      }),
    );
    // Waypoint holds (holdS) are not in rangeboard FlightPath: the threat flies through.
    paths.push({
      id: `path:${t.id}`,
      entityId: t.id,
      points: t.path.map((w) => vec(w.x, w.y)),
      speedMps: threatSpeedMs(t),
      startDelayS: 0,
    });
  }

  const scenario: Scenario = {
    schemaVersion: 1,
    name: v.name,
    library,
    systemPresets: [],
    runMode: 'monte-carlo',
    seed,
    replicates: 1,
    sweepStepS: DEFAULTS.sweepStepS,
    environment: { ...DEFAULTS.environment },
    roe: DEFAULTS.roe,
    doctrine: {
      enabled: true,
      trackFirmS: DEFAULTS.trackFirmS,
      // Target chain time: operator decision dwell from hostile ID to release authority.
      declareHostileS: v.chainTime.decisionS,
      targetS: v.chainTime.assignS,
      bdaS: DEFAULTS.bdaS,
      pkCommit: DEFAULTS.pkCommit,
      opportunities: DEFAULTS.opportunities,
      launchPolicy: DEFAULTS.launchPolicy,
      launchRangeFraction: DEFAULTS.launchRangeFraction,
    },
    physics: [...DEFAULTS.physics],
    requirements: { ...DEFAULTS.requirements },
    entities,
    connections,
    boundaries: [],
    paths,
    testCards: [],
    frames: [],
    underlay: {
      dataUrl: null,
      pos: { x: 0, y: 0 },
      widthM: 1,
      naturalW: 0,
      naturalH: 0,
      opacity: 1,
    },
    geoRef: { lat: v.site.lat, lon: v.site.lon },
  };
  const manifest = createTrialManifest(scenario, runId, `profile-studio:${v.id}`, {
    producer: 'cli',
  });
  return { scenario, manifest };
}
