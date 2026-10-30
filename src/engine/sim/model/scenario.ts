import type { Entity, FlightPath, Scenario, SpecModel } from './types';
import { physicsSwitches } from './types';
import { pathLength } from '../geometry/geo';
import { effectivePathDelayS } from '../playback/raid';
import { limitedFlightDurationS } from '../playback/flight';

/**
 * Id index per library array. The store never mutates a library in place, so
 * the array identity is a safe key and the entry dies with the array.
 */
const LIBRARY_INDEX = new WeakMap<SpecModel[], Map<string, SpecModel>>();

function libraryIndex(library: SpecModel[]): Map<string, SpecModel> {
  let index = LIBRARY_INDEX.get(library);
  if (!index) {
    index = new Map();
    // First id wins, which is what `find` returned for a duplicated id.
    for (const m of library) if (!index.has(m.id)) index.set(m.id, m);
    LIBRARY_INDEX.set(library, index);
  }
  return index;
}

/**
 * Presentation variants of a scenario: a copy that differs from its base only
 * in fields no engine function reads (today `observedPresetId`). Every
 * engine-keyed cache keys on the base, so stamping the copy costs no engine
 * run. The value is the chain root, so a lookup is one hop.
 */
const PRESENTATION_BASE = new WeakMap<Scenario, Scenario>();

/**
 * Record that `variant` differs from `base` only in presentation fields.
 * Call it once, where the copy is made; `engineKeyOf(variant)` then answers
 * `engineKeyOf(base)`.
 */
export function markPresentationVariant(variant: Scenario, base: Scenario): void {
  if (variant !== base) PRESENTATION_BASE.set(variant, engineKeyOf(base));
}

/**
 * The object an engine-keyed cache (picture, timeline, duration, basis
 * signature, rings, WEZ) keys on: the scenario itself, or the root of its
 * presentation-variant chain.
 */
export function engineKeyOf(scenario: Scenario): Scenario {
  return PRESENTATION_BASE.get(scenario) ?? scenario;
}

/** Model referenced by an entity, if any. */
export function modelFor(scenario: Scenario, entity: Entity): SpecModel | undefined {
  if (entity.specId == null) return undefined;
  return libraryIndex(scenario.library).get(entity.specId) ?? undefined;
}

/** Effective speed for a flight path: override, spec cruise, or 15 m/s fallback. */
export function pathSpeed(scenario: Scenario, path: FlightPath): number {
  if (path.speedMps && path.speedMps > 0) return path.speedMps;
  const entity = scenario.entities.find((e) => e.id === path.entityId);
  const model = entity ? modelFor(scenario, entity) : undefined;
  return model?.uas?.cruiseSpeedMps ?? 15;
}

/** Flight time excluding the effective start delay, with flight limits when available. */
export function pathDurationS(scenario: Scenario, path: FlightPath): number {
  const speed = pathSpeed(scenario, path);
  if (physicsSwitches(scenario).includes('noFlightLimits')) return pathLength(path.points) / speed;
  const entity = scenario.entities.find((e) => e.id === path.entityId);
  const uas = entity ? modelFor(scenario, entity)?.uas : undefined;
  return uas ? limitedFlightDurationS(path.points, speed, uas) : pathLength(path.points) / speed;
}

/** Scenario duration: longest path flight time plus path and wave delays, minimum 60 s. */
export function scenarioDurationS(scenario: Scenario): number {
  let max = 60;
  for (const p of scenario.paths) {
    const t = effectivePathDelayS(scenario, p) + pathDurationS(scenario, p);
    if (t > max) max = t;
  }
  return Math.ceil(max);
}
