// Shared builders for the templates. Every call mints fresh keys, so a template's `make()` gives
// an independent vignette each time. Units: metres, seconds, percent (spec section 5).
import { defaultSensorModel, DEFAULT_PK, EFFECTOR_DEFAULTS, SENSOR_DEFAULTS } from '../catalog';
import { newKey } from '../ids';
import type {
  Area,
  Effector,
  EffectorKind,
  Entered,
  Hypothesis,
  MeasureSetting,
  Node,
  NodeKind,
  Op,
  Question,
  Sensor,
  SensorKind,
  Threat,
  Vignette,
  Waypoint,
} from '../types';
import { SCHEMA } from '../types';

/** Planning site shared by the templates. Legacy seeds carry no origin; this one is a stand-in. */
export const SITE = { name: 'High desert test site', lat: 35.05, lon: -117.6, elevM: 700 };

export function sensor(
  id: string,
  kind: SensorKind,
  x: number,
  y: number,
  rangeM = SENSOR_DEFAULTS[kind].rangeM,
  over: Partial<Omit<Sensor, 'key' | 'id' | 'kind'>> = {},
): Sensor {
  return {
    key: newKey(),
    id,
    kind,
    x,
    y,
    z: 3,
    rangeM,
    minRangeM: 0,
    fovDeg: SENSOR_DEFAULTS[kind].fovDeg,
    bearingDeg: 0,
    elMinDeg: -5,
    elMaxDeg: 85,
    model: defaultSensorModel(kind, rangeM),
    entered: {},
    ...over,
  };
}

export function effector(
  id: string,
  kind: EffectorKind,
  x: number,
  y: number,
  rangeM = EFFECTOR_DEFAULTS[kind].rangeM,
  over: Partial<Omit<Effector, 'key' | 'id' | 'kind'>> = {},
): Effector {
  return {
    key: newKey(),
    id,
    kind,
    x,
    y,
    z: 2,
    rangeM,
    fovDeg: EFFECTOR_DEFAULTS[kind].fovDeg,
    bearingDeg: 0,
    timeToEffectS: EFFECTOR_DEFAULTS[kind].timeToEffectS,
    pk: DEFAULT_PK,
    entered: {},
    ...over,
  };
}

export function node(id: string, kind: NodeKind, x: number, y: number, rangeM = 0): Node {
  return { key: newKey(), id, kind, x, y, z: 0, rangeM };
}

/**
 * Laydown rule (review 7 FR-01). The radar is the site datum at (0, 0). Every other point asset,
 * waypoint and defended-asset corner sits at least 24 px from it and from each other at the
 * default Build view (fit to the assets, 48 px padding, 1440 x 900): 13.9 m/px for a 4 km radar,
 * 16.5 m/px for the sweep, 31.4 m/px for the 9 km Delta wing radar. Labels sit 8 px right and
 * 4 px below a point, so a second point never sits right of and level with another one.
 */
export type Pt = { x: number; y: number };

/** Square footprint of side `sideM` about `at` (the origin by default), as the legacy `sq()`. */
export function square(sideM: number, at: Pt = { x: 0, y: 0 }): [number, number][] {
  const h = sideM / 2;
  return [
    [at.x - h, at.y - h],
    [at.x + h, at.y - h],
    [at.x + h, at.y + h],
    [at.x - h, at.y + h],
  ];
}

export function area(
  id: string,
  kind: Area['kind'],
  label: string,
  pts: [number, number][],
  zMaxM = 0,
): Area {
  return { key: newKey(), id, kind, label, pts, zMinM: 0, zMaxM };
}

export function defendedAsset(sideM = 250, at: Pt = { x: 0, y: 0 }): Area {
  return area('DA', 'asset', 'Defended asset', square(sideM, at));
}

export function threat(id: string, type: string, path: Waypoint[], speedMs?: number): Threat {
  const t: Threat = { key: newKey(), id, type, path };
  if (speedMs != null) t.speedMs = speedMs;
  return t;
}

export function entered(value: Entered['value'], source: string): Entered {
  return { value, source };
}

export function question(text: string, note = ''): Question {
  return { key: newKey(), id: 'Q-01', text, note };
}

export function setting(id: string, op: Op, threshold: number, unit: string): MeasureSetting {
  return { id, op, threshold, unit };
}

/** H-01 on `s`, with the threshold as the planning value and a prediction range. */
export function hypothesis(
  q: Question,
  s: MeasureSetting,
  prediction: { low: number; high: number },
): Hypothesis {
  return {
    key: newKey(),
    id: 'H-01',
    question: q.key,
    measure: s.id,
    op: s.op,
    value: s.threshold,
    prediction,
    lockedAt: null,
  };
}

export type Parts = Partial<
  Pick<
    Vignette,
    | 'questions'
    | 'hypotheses'
    | 'threats'
    | 'sensors'
    | 'effectors'
    | 'nodes'
    | 'areas'
    | 'chainTime'
    | 'measures'
    | 'report'
  >
> & { name: string };

export function vignette(parts: Parts): Vignette {
  return {
    schema: SCHEMA,
    id: `V-${newKey().slice(0, 8)}`,
    name: parts.name,
    updated: new Date().toISOString(),
    site: { ...SITE },
    questions: parts.questions ?? [],
    hypotheses: parts.hypotheses ?? [],
    threats: parts.threats ?? [],
    sensors: parts.sensors ?? [],
    effectors: parts.effectors ?? [],
    nodes: parts.nodes ?? [],
    areas: parts.areas ?? [defendedAsset()],
    chainTime: parts.chainTime ?? { decisionS: 5, assignS: 3 },
    measures: parts.measures ?? [],
    runs: [],
    report: parts.report ?? {
      summary: '',
      notes: '',
      dataSources: [],
      truth: { source: '', intervalS: 1, stationKeys: [] },
      slides: [],
    },
  };
}
