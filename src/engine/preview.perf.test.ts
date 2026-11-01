// @vitest-environment node
// Budget from docs/spec.md section 6 item 1: preview under 100 ms for 40 threats and 15 sensors.
import { defaultSensorModel, DEFAULT_PK, SENSOR_KINDS } from '../domain/catalog';
import type { Effector, Sensor, Threat, Vignette } from '../domain/types';
import { SCHEMA } from '../domain/types';
import { derived } from './derived';
import { preview } from './preview';

// Small deterministic LCG so the vignette is the same on every run.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function syntheticVignette(nThreats = 40, nSensors = 15, seed = 7): Vignette {
  const rnd = lcg(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const archetypes = [
    'g1-quad-isr',
    'g1-fpv-fiber',
    'g2-lm-xwing',
    'g3-delta-owa',
    'g1-swarm-quad',
  ];
  const threats: Threat[] = [];
  for (let i = 0; i < nThreats; i++) {
    const type = archetypes[i % archetypes.length]!;
    const speed = between(12, 40);
    const runS = between(300, 600);
    const n = 4 + Math.floor(rnd() * 3); // 4 to 6 waypoints
    const brg = between(0, 2 * Math.PI);
    const R = speed * runS;
    const path = [];
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1);
      const r = R * (1 - f);
      const wob = between(-0.15, 0.15);
      path.push({
        key: `t${i}w${k}`,
        x: r * Math.cos(brg + wob),
        y: r * Math.sin(brg + wob),
        z: between(40, 400),
        holdS: k === 1 && rnd() < 0.3 ? between(10, 40) : 0,
      });
    }
    threats.push({ key: `t${i}`, id: `T${i + 1}`, type, path, speedMs: speed, group: '' });
  }
  const sensors: Sensor[] = [];
  for (let i = 0; i < nSensors; i++) {
    const kind = SENSOR_KINDS[i % SENSOR_KINDS.length]!;
    const rangeM = kind === 'radar' ? 6000 : kind === 'rf' ? 4000 : kind === 'eoir' ? 3000 : 1200;
    sensors.push({
      key: `s${i}`,
      id: `S${i + 1}`,
      kind,
      x: between(-1500, 1500),
      y: between(-1500, 1500),
      z: between(0, 30),
      rangeM,
      minRangeM: 0,
      fovDeg: kind === 'eoir' ? 60 : 360,
      bearingDeg: between(0, 360),
      elMinDeg: -5,
      elMaxDeg: 85,
      model: defaultSensorModel(kind, rangeM),
      entered: {},
    });
  }
  const effectors: Effector[] = [
    { kind: 'ew', rangeM: 1500, timeToEffectS: 10 },
    { kind: 'kinetic', rangeM: 3000, timeToEffectS: 8 },
    { kind: 'de', rangeM: 1000, timeToEffectS: 6 },
  ].map((e, i) => ({
    key: `e${i}`,
    id: `E${i + 1}`,
    kind: e.kind as Effector['kind'],
    x: between(-500, 500),
    y: between(-500, 500),
    z: 0,
    rangeM: e.rangeM,
    fovDeg: 360,
    bearingDeg: 0,
    timeToEffectS: e.timeToEffectS,
    pk: DEFAULT_PK,
    entered: {},
  }));
  return {
    schema: SCHEMA,
    id: 'PERF-1',
    name: 'perf',
    updated: '2026-10-30T00:00:00.000Z',
    collection: '',
    class: 'Custom',
    version: 1,
    site: { name: 'perf', lat: 0, lon: 0, elevM: 0 },
    questions: [],
    threats,
    sensors,
    effectors,
    nodes: [],
    areas: [
      {
        key: 'da',
        id: 'DA',
        kind: 'asset',
        label: 'Defended asset',
        pts: [
          [-300, -300],
          [300, -300],
          [300, 300],
          [-300, 300],
        ],
        zMinM: 0,
        zMaxM: 0,
      },
    ],
    planes: [],
    events: [],
    snapshots: [],
    cards: [],
    debrief: null,
    chainTime: { decisionS: 5, assignS: 3 },
    measures: [],
    report: {
      notes: '',
      dataSources: [],
      truth: { source: '', intervalS: 20, stationKeys: [] },
    },
  };
}

describe('preview performance', () => {
  it('runs 40 threats x 15 sensors under 100 ms (median of 5 after a warm-up)', () => {
    const v = syntheticVignette(40, 15);
    const warm = preview(v);
    expect(Object.keys(warm.threats)).toHaveLength(40);
    expect(Object.keys(warm.windows)).toHaveLength(18);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      preview(v);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[2]!;
    const nWindows = Object.values(warm.windows).reduce(
      (n, by) => n + Object.values(by).reduce((m, ws) => m + ws.length, 0),
      0,
    );
    console.log(
      `preview 40x15: median ${median.toFixed(1)} ms (runs ${times.map((t) => t.toFixed(1)).join(', ')}), ` +
        `${nWindows} windows, ${warm.splits.length} splits, tmax ${warm.tmaxS.toFixed(0)} s`,
    );
    expect(median).toBeLessThan(100);
  });

  it('derived() for 40 x 15 runs under 100 ms including preview() (median of 5)', () => {
    const v = syntheticVignette(40, 15);
    derived(v, preview(v));
    const times: number[] = [];
    const parts: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const p = preview(v);
      const t1 = performance.now();
      const d = derived(v, p);
      times.push(performance.now() - t0);
      parts.push(performance.now() - t1);
      expect(Object.keys(d.timed)).toHaveLength(40);
    }
    times.sort((a, b) => a - b);
    parts.sort((a, b) => a - b);
    console.log(
      `derived 40x15: median ${times[2]!.toFixed(1)} ms with preview, ${parts[2]!.toFixed(1)} ms derived alone ` +
        `(runs ${times.map((t) => t.toFixed(1)).join(', ')})`,
    );
    expect(times[2]).toBeLessThan(100);
  });
});
