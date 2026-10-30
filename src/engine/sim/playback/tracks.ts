import type { Entity, FlightPath, Scenario, SpecModel, Vec2 } from '../model/types';
import { physicsSwitches } from '../model/types';
import { formationOffsets, posAtTime, type PathSample } from '../geometry/geo';
import { modelFor, pathSpeed } from '../model/scenario';
import { effectivePathDelayS } from './raid';
import { limitedPosAtTime } from './flight';

/** Positions of every ship in the entity's formation (just the lead when none). */
export function memberPositions(entity: Entity, pos: Vec2, headingDeg: number): Vec2[] {
  const f = entity.formation;
  if (!f || f.count <= 1) return [pos];
  return formationOffsets(f.shape, f.count, f.spacingM, headingDeg).map((o) => ({
    x: pos.x + o.x,
    y: pos.y + o.y,
  }));
}

export interface LiveTrack {
  entityId: string;
  pos: Vec2;
  headingDeg: number;
  /** False before start delay and after path completion. */
  flying: boolean;
  done: boolean;
}

/** The one scenario-aware sampler for a target UAS path. */
export function sampleFlightPath(scenario: Scenario, path: FlightPath, tS: number): PathSample {
  const speed = pathSpeed(scenario, path);
  const delayS = effectivePathDelayS(scenario, path);
  if (physicsSwitches(scenario).includes('noFlightLimits')) {
    return posAtTime(path.points, speed, delayS, tS);
  }
  const entity = scenario.entities.find((e) => e.id === path.entityId);
  const uas = entity ? modelFor(scenario, entity)?.uas : undefined;
  if (!uas) return posAtTime(path.points, speed, delayS, tS);
  return limitedPosAtTime(path.points, speed, delayS, tS, uas, scenario.environment);
}

/** Positions of all path-flying UAS at sim time t. Entities without paths stay put. */
export function liveTracks(scenario: Scenario, tS: number): Map<string, LiveTrack> {
  const out = new Map<string, LiveTrack>();
  for (const path of scenario.paths) {
    const delayS = effectivePathDelayS(scenario, path);
    const s = sampleFlightPath(scenario, path, tS);
    out.set(path.entityId, {
      entityId: path.entityId,
      pos: s.pos,
      headingDeg: s.headingDeg,
      flying: tS >= delayS && !s.done,
      done: s.done,
    });
  }
  return out;
}

export function entityPosAt(scenario: Scenario, entity: Entity, tS: number): Vec2 {
  return liveTracks(scenario, tS).get(entity.id)?.pos ?? entity.pos;
}

/** A library model's threat altitude, feet: the threat profile, else the altBandFt midpoint, else 0. */
export function modelAltitudeFt(model: SpecModel | undefined): number {
  const profile = model?.threatProfile?.altitudeFt;
  if (profile != null && Number.isFinite(profile)) return profile;
  const band = model?.uas?.altBandFt;
  if (band) return (band[0] + band[1]) / 2;
  return 0;
}

/**
 * Threat altitude, feet AGL: Entity.altitudeFt, else the model's threat
 * profile altitude, else the altBandFt midpoint, else 0. The one altitude
 * resolver: every engine read of a threat altitude goes through here.
 */
export function threatAltitudeFt(scenario: Scenario, uas: Entity): number {
  const own = uas.altitudeFt;
  if (own != null && Number.isFinite(own)) return own;
  return modelAltitudeFt(modelFor(scenario, uas));
}
