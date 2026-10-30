import type {
  Entity,
  RequirementThresholds,
  Scenario,
  SensorSpec,
  SensorType,
  SpecModel,
  UasSpec,
  Vec2,
} from '../model/types';
import {
  DEFAULT_REQUIREMENT_THRESHOLDS,
  entityActive,
  mountHeightOf,
  physicsSwitches,
} from '../model/types';
import { dist, pointInWedge } from '../geometry/geo';
import { slantRangeM } from '../geometry/slant';
import { modelFor } from '../model/scenario';
import type { DrawPolicy } from './policy';
import { deterministicPolicy } from './policy';
import type { GeometryGate, SensorHoldGate } from '../analysis/sensorEnv';
import {
  FT_TO_M,
  effectiveClassifyRangeM,
  effectiveDetectRangeM,
  eoIrNeedsCue,
  radarPdCurve,
  sensorGeometryGateAt,
  sensorHoldGate,
} from '../analysis/sensorEnv';
import { liveTracks, memberPositions, modelAltitudeFt, threatAltitudeFt } from './tracks';

/** One sensor's hold on one threat at an instant. */
export interface DetectionHit {
  sensorId: string;
  sensorType: SensorType;
  classified: boolean;
  /** False when the formation spacing is below the sensor's track resolution. */
  resolved: boolean;
  /** Slant range from the phase center to the nearest detected member, meters. */
  slantM: number;
  /** Single-scan Pd of the nearest detected member; null when the sensor has no Pd model. */
  pd: number | null;
}

/** One actual scan attempt. Only geometry-admitted members have decisions; empty
 * lists retain out-of-view and gated scans, including sensors that never detect.
 * memberIdx is the formation position index; drawIndex is the existing nearest-first
 * admitted rank. They are deliberately distinct, preserving the historical draw keys.
 */
export interface SensorScanObservation {
  uasId: string;
  sensorId: string;
  sensorType: SensorType;
  tS: number;
  gate: SensorHoldGate;
  cued: boolean;
  resolved: boolean;
  members: Array<{
    memberIdx: number;
    drawIndex: number;
    slantM: number;
    pd: number | null;
    detected: boolean;
    classified: boolean;
  }>;
}

/** Opt-in current-trial capture; default and ensemble paths allocate no history. */
export type SensorObservationSink = (observation: SensorScanObservation) => void;

/** The test's thresholds with the defaults filled: the one resolution the draw policy reads. */
export function resolvedThresholds(scenario: Scenario): RequirementThresholds {
  return { ...DEFAULT_REQUIREMENT_THRESHOLDS, ...scenario.requirements };
}

/** M-of-N cumulative probability a radar contact must reach to count as TRACK: the test's threshold. */
export function pdTrackCumulativeOf(scenario: Scenario): number {
  const pd = { ...DEFAULT_REQUIREMENT_THRESHOLDS, ...scenario.requirements }.pdTrackCumulative;
  // A saved 0 would initiate a track at the first detected scan.
  return pd > 0 && pd <= 1 ? pd : DEFAULT_REQUIREMENT_THRESHOLDS.pdTrackCumulative;
}

/**
 * One sensor's terms against one target: every read of the hit test that
 * does not move with the step, resolved once per sweep. The admitted-slant
 * list of the last step is kept so the Pd probe at the same position set
 * reuses it (the members array identity is the step key).
 */
interface SensorTerms {
  sensor: Entity;
  spec: SensorSpec;
  gate: SensorHoldGate;
  cueSensor: boolean;
  /** Pd-modeled radar: the single-scan Pd curve; null for every other sensor. */
  pdAt: ((slantM: number) => number) | null;
  /** Threshold sensors: the effective detect range; unused for a Pd-modeled radar. */
  detectR: number;
  classifyR: number | null;
  geometryGate: (groundM: number) => GeometryGate;
  sensorHeightM: number;
  seenMembers: Vec2[] | null;
  seen: number[];
  seenIndices: number[] | null;
}

/**
 * Slant ranges, ascending, of the members the vertical geometry gate
 * (sensorGeometryGate: ceiling, radio horizon, elevation limits) and the
 * azimuth wedge on the ground plane admit. The one member loop: the hit
 * test and the Pd probe both read it.
 */
function admittedSlantsM(term: SensorTerms, altM: number, members: Vec2[]): number[] {
  if (term.seenMembers === members) return term.seen;
  const { sensor, spec } = term;
  const dAltM = altM - term.sensorHeightM;
  const seen: number[] = [];
  const indexed = term.seenIndices ? ([] as Array<{ slantM: number; memberIdx: number }>) : null;
  for (let memberIdx = 0; memberIdx < members.length; memberIdx += 1) {
    const m = members[memberIdx];
    const groundM = dist(sensor.pos, m!);
    if (term.geometryGate(groundM) !== 'ok') continue;
    // A full circle admits every bearing, as pointInWedge answers without the test.
    if (
      !(spec.sectorDeg >= 360) &&
      !pointInWedge(sensor.pos, sensor.headingDeg, spec.sectorDeg, m!)
    ) {
      continue;
    }
    const slantM = slantRangeM(groundM, dAltM);
    seen.push(slantM);
    indexed?.push({ slantM, memberIdx });
  }
  if (seen.length > 1) seen.sort((a, b) => a - b);
  if (indexed) {
    indexed.sort((a, b) => a.slantM - b.slantM);
    term.seenIndices = indexed.map((member) => member.memberIdx);
  }
  term.seenMembers = members;
  term.seen = seen;
  return seen;
}

/**
 * One sensor's hit on one threat at an instant, or null. sensorHoldGate
 * decides technology eligibility (RF silence, bands, zero range, the EO/IR cue
 * rule). admittedSlantsM decides which members are in view. A Pd-modeled
 * radar reads the Pd model through the draw policy, one draw per member, at
 * its scan steps only; every other sensor compares slant range with the
 * effective range for this target.
 */
function sensorHit(
  term: SensorTerms,
  formation: Entity['formation'],
  altM: number,
  members: Vec2[],
  cued: boolean,
  policy: DrawPolicy,
  uasId: string,
  tS: number,
  scanStep: boolean,
  observation?: SensorScanObservation,
): DetectionHit | null {
  const gate = term.gate;
  const f = formation;
  const resolved = !(
    f &&
    f.count > 1 &&
    term.spec.resolutionM != null &&
    f.spacingM < term.spec.resolutionM
  );
  if (observation) observation.resolved = resolved;
  if (gate === 'needs-cue' ? !cued : gate !== 'ok') return null;
  // Between scans a scan radar has no hit of its own; the carried hold is the only cue.
  if (!scanStep) return null;
  const { sensor, spec, pdAt } = term;
  const seen = admittedSlantsM(term, altM, members);
  // Nothing admitted is nothing detected, and no draw is taken on an empty list.
  if (seen.length === 0) return null;
  let detected: number[];
  if (pdAt) {
    detected = seen.filter((slant, i) => {
      const pd = pdAt(slant);
      const detected = policy.detect(pd, sensor.id, uasId, tS, i);
      observation?.members.push({
        memberIdx: term.seenIndices![i]!,
        drawIndex: i,
        slantM: slant,
        pd,
        detected,
        classified: detected && term.classifyR != null && slant <= term.classifyR,
      });
      return detected;
    });
  } else {
    const detectR = term.detectR;
    if (!(detectR > 0)) return null;
    detected = seen.filter((slant, i) => {
      const detected = slant <= detectR;
      observation?.members.push({
        memberIdx: term.seenIndices![i]!,
        drawIndex: i,
        slantM: slant,
        pd: null,
        detected,
        classified: detected && term.classifyR != null && slant <= term.classifyR,
      });
      return detected;
    });
  }
  if (detected.length === 0) return null;
  const classifyR = term.classifyR;
  const classified = classifyR != null && detected.some((slant) => slant <= classifyR);
  const slantM = detected[0]!;
  return {
    sensorId: sensor.id,
    sensorType: spec.sensorType,
    classified,
    resolved,
    slantM,
    pd: pdAt ? pdAt(slantM!) : null,
  };
}

/**
 * Scan-model steering from the sweep run (sweep.ts): which scan radars take
 * a scan at this step, and which hold a track from their last scan. Absent
 * (a bare call, detectionsAt, the board view): every step is a scan step and
 * no hold is carried.
 */
export interface ScanSteering {
  /** True when this radar takes a scan at this step; true for a sensor with no scan state. */
  scanStep(sensorId: string): boolean;
  /** True when this radar holds from its last detected scan; it cues EO/IR between scans. */
  holding(sensorId: string): boolean;
}

/**
 * The sensor sweep against one threat, prepared once (prepareSweep) and
 * read per step. `hits` is the two-pass order of sweepSensorHits; `probe`
 * is the Pd probe of one radar at the same position set.
 */
export interface SensorSweep {
  /** Hits at one position set, search sensors first, then cued EO/IR. */
  hits(
    members: Vec2[],
    uasId?: string,
    tS?: number,
    scan?: ScanSteering,
  ): Array<{ spec: SensorSpec; hit: DetectionHit }>;
  /**
   * Single-scan Pd a radar reads on the nearest member the geometry gate and
   * the wedge admit, whether or not it clears the detect threshold: 0 when no
   * member is admitted or every admitted member is beyond the instrumented
   * range. Null when the sensor has no Pd model or is gated for this target.
   * Feeds the sweep's pdSeries; the admitted list of a `hits` call at the
   * same `members` is reused.
   */
  probe(sensorId: string, members: Vec2[]): number | null;
}

/**
 * Resolve every per-sensor term against one threat (spec, hold gate, Pd
 * curve, effective ranges, geometry gate) so the step loop reads constants.
 * A sensor with no sensor spec is skipped in both passes, so dropping it
 * here is the same set. A missing policy is the deterministic run.
 */
export function prepareSweep(
  scenario: Scenario,
  sensors: Entity[],
  formation: Entity['formation'],
  uasSpec: UasSpec | undefined,
  altitudeFt: number,
  policy?: DrawPolicy,
  capture?: SensorObservationSink,
): SensorSweep {
  const draw = policy ?? deterministicPolicy(resolvedThresholds(scenario));
  const env = scenario.environment;
  const physics = physicsSwitches(scenario);
  const altM = altitudeFt * FT_TO_M;
  const search: SensorTerms[] = [];
  const cuedPass: SensorTerms[] = [];
  const byId = new Map<string, SensorTerms>();
  for (const sensor of sensors) {
    const spec = modelFor(scenario, sensor)?.sensor;
    if (!spec) continue;
    const sensorHeightM = mountHeightOf(spec);
    const pdAt = radarPdCurve(spec, env, uasSpec, physics.includes('singlePulseRadar'));
    const term: SensorTerms = {
      sensor,
      spec,
      gate: sensorHoldGate(spec, uasSpec),
      cueSensor: eoIrNeedsCue(spec),
      pdAt,
      detectR: pdAt ? 0 : effectiveDetectRangeM(spec, env, uasSpec, undefined, physics),
      classifyR: effectiveClassifyRangeM(spec, env, uasSpec, physics),
      geometryGate: sensorGeometryGateAt(spec, sensorHeightM, altM),
      sensorHeightM,
      seenMembers: null,
      seen: [],
      seenIndices: capture ? [] : null,
    };
    (term.cueSensor ? cuedPass : search).push(term);
    byId.set(sensor.id, term);
  }
  const passes = [search, cuedPass];
  return {
    hits(members, uasId = '', tS = 0, scan) {
      const out: Array<{ spec: SensorSpec; hit: DetectionHit }> = [];
      let cued = false;
      for (const pass of passes) {
        for (const term of pass) {
          const scanStep = scan ? scan.scanStep(term.sensor.id) : true;
          const observation: SensorScanObservation | undefined =
            capture && scanStep
              ? {
                  uasId,
                  sensorId: term.sensor.id,
                  sensorType: term.spec.sensorType,
                  tS,
                  gate: term.gate,
                  cued,
                  resolved: true,
                  members: [],
                }
              : undefined;
          const hit = sensorHit(
            term,
            formation,
            altM,
            members,
            cued,
            draw,
            uasId,
            tS,
            scanStep,
            observation,
          );
          if (observation) capture!(observation);
          if (hit) {
            out.push({ spec: term.spec, hit });
            cued = true;
          } else if (scan && !scanStep && scan.holding(term.sensor.id)) {
            cued = true;
          }
        }
      }
      return out;
    },
    probe(sensorId, members) {
      const term = byId.get(sensorId);
      if (!term || !term.pdAt) return null;
      if (term.gate !== 'ok') return null;
      const seen = admittedSlantsM(term, altM, members);
      if (seen.length === 0) return 0;
      return term.pdAt(seen[0]!);
    },
  };
}

/**
 * Two-pass sensor sweep over one threat position set: search sensors first,
 * then cued EO/IR, which holds only when an earlier hit in the same sweep
 * provides the cue (COURAGEOUS: narrow-FOV cameras verify, they do not
 * search). The one owner of the pass order and the cued flag. `formation`
 * feeds the track-resolution test; pass undefined for a single point. A bare
 * call (no policy, no steering) is a deterministic board view in which every
 * step is a scan step; with steering, a radar's carried hold cues the EO/IR
 * pass between its scans. One-shot form of prepareSweep().hits().
 */
export function sweepSensorHits(
  scenario: Scenario,
  sensors: Entity[],
  formation: Entity['formation'],
  uasSpec: UasSpec | undefined,
  altitudeFt: number,
  members: Vec2[],
  policy?: DrawPolicy,
  uasId = '',
  tS = 0,
  scan?: ScanSteering,
): Array<{ spec: SensorSpec; hit: DetectionHit }> {
  return prepareSweep(scenario, sensors, formation, uasSpec, altitudeFt, policy).hits(
    members,
    uasId,
    tS,
    scan,
  );
}

/**
 * True when any of `sensors` holds a single ship of `model` standing at
 * `point`, under the full per-sensor rule set (sector, environment, target
 * scaling, RF silence and bands, the cue rule). The raid builder's spawn
 * standoff clamp uses this so it agrees with spawnInRingViolations. The
 * ship is not placed yet, so its altitude is the one placement will seed
 * from the library model.
 */
export function sensorHoldsPoint(
  scenario: Scenario,
  sensors: Entity[],
  model: SpecModel | undefined,
  point: Vec2,
): boolean {
  const altitudeFt = modelAltitudeFt(model);
  return sweepSensorHits(scenario, sensors, undefined, model?.uas, altitudeFt, [point]).length > 0;
}

/**
 * Sensors currently holding each UAS: uasId -> hits.
 * EO/IR cameras only hold targets another technology already holds (the
 * sweepSensorHits cue rule).
 */
export function detectionsAt(scenario: Scenario, tS: number): Map<string, DetectionHit[]> {
  const tracks = liveTracks(scenario, tS);
  const sensors = scenario.entities.filter((e) => e.kind === 'sensor' && entityActive(e));
  const draw = deterministicPolicy(resolvedThresholds(scenario));
  const out = new Map<string, DetectionHit[]>();
  for (const uas of scenario.entities) {
    if (uas.kind !== 'uas' || !entityActive(uas)) continue;
    const track = tracks.get(uas.id);
    const pos = track?.pos ?? uas.pos;
    const heading = track?.headingDeg ?? uas.headingDeg;
    const members = memberPositions(uas, pos, heading);
    const uasSpec = modelFor(scenario, uas)?.uas;
    const altitudeFt = threatAltitudeFt(scenario, uas);
    const hits = prepareSweep(scenario, sensors, uas.formation, uasSpec, altitudeFt, draw)
      .hits(members)
      .map((s) => s.hit);
    if (hits.length > 0) out.set(uas.id, hits);
  }
  return out;
}

/** One threat whose path starts inside one sensor's effective detect ring. */
interface SpawnViolation {
  uasId: string;
  sensorId: string;
}

/**
 * Threats whose flight path starts inside a sensor's effective detect ring:
 * the track is held at T0, so the run never exercises the search problem.
 * Derived live and never stored, since sensors, delays and hand-drawn paths
 * change after the raid builder's standoff clamp. Sweeps path.points[0] (lead
 * position, formation offsets ignored) under the sensorHit rules.
 */
export function spawnInRingViolations(scenario: Scenario): SpawnViolation[] {
  const sensors = scenario.entities.filter((e) => e.kind === 'sensor' && entityActive(e));
  const out: SpawnViolation[] = [];
  for (const uas of scenario.entities) {
    if (uas.kind !== 'uas' || !entityActive(uas)) continue;
    const start = scenario.paths.find((p) => p.entityId === uas.id)?.points[0];
    if (!start) continue;
    const uasSpec = modelFor(scenario, uas)?.uas;
    const altitudeFt = threatAltitudeFt(scenario, uas);
    for (const { hit } of sweepSensorHits(scenario, sensors, uas.formation, uasSpec, altitudeFt, [
      start,
    ])) {
      out.push({ uasId: uas.id, sensorId: hit.sensorId });
    }
  }
  return out;
}
