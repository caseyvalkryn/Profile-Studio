// Hand-built vignettes for the engine tests. Not a test file: adapter, run and sweep tests share it.
import type { Effector, Sensor, SensorKind, Threat, Vignette, Waypoint } from '../domain/types';
import { SCHEMA } from '../domain/types';
import { defaultSensorModel } from '../domain/catalog';

function wp(key: string, x: number, y: number, z: number): Waypoint {
  return { key, x, y, z, holdS: 0 };
}

export function testSensor(
  id: string,
  kind: SensorKind,
  rangeM: number,
  over: Partial<Sensor> = {},
) {
  return {
    key: `k-${id}`,
    id,
    kind,
    x: 0,
    y: 0,
    z: 3,
    rangeM,
    minRangeM: 0,
    fovDeg: 360,
    bearingDeg: 0,
    elMinDeg: -5,
    elMaxDeg: 85,
    model: defaultSensorModel(kind, rangeM),
    entered: {},
    ...over,
  } satisfies Sensor;
}

export function testEffector(id: string, over: Partial<Effector> = {}): Effector {
  return {
    key: `k-${id}`,
    id,
    kind: 'kinetic',
    x: 0,
    y: 0,
    z: 2,
    rangeM: 2500,
    fovDeg: 360,
    bearingDeg: 0,
    timeToEffectS: 6,
    pk: 0.8,
    entered: {},
    ...over,
  };
}

/** A straight run-in from the north at `fromM` to the origin, 100 m AGL. */
export function testThreat(id: string, type: string, fromM = 6000, altM = 100): Threat {
  return {
    key: `k-${id}`,
    id,
    type,
    path: [wp(`${id}-a`, 0, fromM, altM), wp(`${id}-b`, 0, -200, altM)],
  };
}

/** One radar, one EO/IR camera, one C2 node, one kinetic effector, a defended asset, two threats. */
export function testVignette(over: Partial<Vignette> = {}): Vignette {
  return {
    schema: SCHEMA,
    id: 'V-test',
    name: 'test vignette',
    updated: '2026-10-30T00:00:00Z',
    site: { name: 'site', lat: 35, lon: -117, elevM: 700 },
    questions: [],
    hypotheses: [],
    threats: [testThreat('T-01', 'g1-quad-isr'), testThreat('T-02', 'g1-fpv-fiber', 5000, 60)],
    sensors: [
      testSensor('S-01', 'radar', 5000),
      testSensor('S-02', 'eoir', 2500, { x: 50, y: 0, fovDeg: 360 }),
    ],
    effectors: [testEffector('E-01')],
    nodes: [{ key: 'k-N-01', id: 'N-01', kind: 'c2', x: -30, y: -30, z: 0, rangeM: 0 }],
    areas: [
      {
        key: 'k-A-01',
        id: 'A-01',
        kind: 'asset',
        label: 'asset',
        pts: [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100],
        ],
        zMinM: 0,
        zMaxM: 500,
      },
    ],
    chainTime: { decisionS: 5, assignS: 3 },
    measures: [
      { id: '1.1.1', op: '>=', threshold: 90, unit: '%' },
      { id: '1.1.2', op: '>=', threshold: 3000, unit: 'm' },
      { id: '3.1.2', op: '>=', threshold: 70, unit: '%' },
    ],
    runs: [],
    report: {
      summary: '',
      notes: '',
      dataSources: [],
      truth: { source: '', intervalS: 1, stationKeys: [] },
      slides: [],
    },
    ...over,
  };
}
