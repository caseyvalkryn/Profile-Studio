// @vitest-environment node
// Spec section 11: a map drag holds 60 fps with 40 threats and 15 sensors. The GeoJSON build for
// that vignette must take under 4 ms, and one drag move's update path under 2 ms.
import { produce } from 'immer';
import { SENSOR_KINDS, defaultSensorModel } from '../../../domain/catalog';
import type { Sensor, Threat, Vignette } from '../../../domain/types';
import { preview } from '../../../engine/preview';
import { testVignette } from '../../../engine/testVignette';
import { makeFrame } from './frame';
import {
  FeatureCache,
  buildAll,
  handleFeatures,
  highlightFeature,
  layerUpdates,
  threatPositions,
  threatsFeature,
} from './geojson';
import { dragStep, startDrag } from './handles';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function synthetic(nThreats = 40, nSensors = 15): Vignette {
  const rnd = lcg(11);
  const threats: Threat[] = [];
  for (let i = 0; i < nThreats; i++) {
    const brg = rnd() * 2 * Math.PI;
    const R = 4000 + rnd() * 6000;
    const path = [];
    for (let k = 0; k < 5; k++) {
      const r = R * (1 - k / 4);
      path.push({
        key: `t${i}w${k}`,
        x: r * Math.cos(brg),
        y: r * Math.sin(brg),
        z: 100,
        holdS: 0,
      });
    }
    threats.push({
      key: `t${i}`,
      id: `T${i + 1}`,
      type: 'g1-quad-isr',
      path,
      speedMs: 20,
      group: '',
    });
  }
  const sensors: Sensor[] = [];
  for (let i = 0; i < nSensors; i++) {
    const kind = SENSOR_KINDS[i % SENSOR_KINDS.length]!;
    sensors.push({
      key: `s${i}`,
      id: `S${i + 1}`,
      kind,
      x: rnd() * 3000 - 1500,
      y: rnd() * 3000 - 1500,
      z: 3,
      rangeM: 3000,
      minRangeM: 0,
      fovDeg: i % 3 === 0 ? 90 : 360,
      bearingDeg: rnd() * 360,
      elMinDeg: -5,
      elMaxDeg: 85,
      model: defaultSensorModel(kind, 3000),
      entered: {},
    });
  }
  return testVignette({ threats, sensors });
}

function median(fn: () => void, n = 31): number {
  for (let i = 0; i < 5; i++) fn();
  const ts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  ts.sort((a, b) => a - b);
  return ts[Math.floor(n / 2)]!;
}

describe('map performance, 40 threats and 15 sensors', () => {
  const v = synthetic();
  const frame = makeFrame(v.site);
  const pv = preview(v);

  it('builds every layer from cold in under 4 ms', () => {
    const ms = median(() => {
      const c = new FeatureCache(frame);
      buildAll(v, c);
      threatsFeature(frame, threatPositions(v, pv, 60));
      highlightFeature(v, c, ['s0', 't3'], 's4');
      handleFeatures(frame, v, ['s0']);
    });
    console.info(`map build: ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThan(4);
  });

  it('runs one drag move (handle math, document patch, changed layers) in under 2 ms', () => {
    const c = new FeatureCache(frame);
    buildAll(v, c);
    const d = startDrag(
      v,
      { target: 'sensor', key: 's0', handle: 'range' },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      false,
    )!;
    let doc = v;
    let i = 0;
    const ms = median(() => {
      i++;
      const step = dragStep(
        d,
        { x: d.base.x + 2000 + i * 10, y: d.base.y },
        { x: 0, y: 0 },
        false,
        'nav',
      );
      const next = produce(doc, step.recipe);
      const ups = layerUpdates(doc, next, c);
      highlightFeature(next, c, ['s0'], null);
      handleFeatures(frame, next, ['s0']);
      if (ups.length !== 2)
        throw new Error(`expected sensors and systems, got ${ups.map((u) => u[0])}`);
      doc = next;
    });
    console.info(`map drag move: ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThan(2);
  });
});
