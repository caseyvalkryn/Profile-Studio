// Spec section 11 for the board: with 40 threats and 15 sensors a time tick (tS change to the
// DOM write) stays under 16 ms and one drag step under 100 ms. Mounted in jsdom; the per-layer
// writer runs synchronously through boardFlush and the gesture move through flushMove.
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import '../../../ui/test-utils';
import { SENSOR_KINDS, defaultSensorModel } from '../../../domain/catalog';
import type { Sensor, Threat, Vignette } from '../../../domain/types';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import Board, { mounted } from './Board';
import { boardFlush } from './renderer';
import { BOARD_DEFAULTS, useBoard } from './store';

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

describe('board performance, 40 threats and 15 sensors', () => {
  beforeEach(() => {
    useDocument.getState().open(synthetic());
    useUi.setState({ ...UI_DEFAULTS });
    useBoard.setState({ ...BOARD_DEFAULTS });
  });

  it('writes a time tick to the DOM in under 16 ms', () => {
    useUi.setState({ timeOn: true });
    render(createElement(Board, { width: 1440, height: 900 }));
    act(() => boardFlush());
    const h = [...mounted][0]!.renderer;
    let t = 0;
    const ms = median(() => {
      t = (t + 7) % 400;
      useUi.getState().setTime(t);
      boardFlush();
    });
    console.info(`board tick: ${ms.toFixed(3)} ms`);
    expect(h.renders.partial).toBeGreaterThan(0);
    expect(ms).toBeLessThan(16);
  });

  it('runs one drag step (snap, document patch, ghost, DOM write) in under 100 ms', () => {
    const { getByTestId } = render(createElement(Board, { width: 1440, height: 900 }));
    act(() => boardFlush());
    const stage = getByTestId('board-stage');
    const h = [...mounted][0]!;
    useUi.getState().setSelection(['s1']);
    boardFlush();
    const hit = h.renderer.last!.hits.find((x) => x.kind === 'system' && x.id === 'S2' && x.role === 'range')!;
    expect(hit).toBeTruthy();
    const ev = (type: string, x: number, y: number) =>
      stage.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', bubbles: true }),
      );
    ev('pointerdown', hit.sx, hit.sy);
    ev('pointermove', hit.sx + 10, hit.sy);
    h.gestures.flushMove();
    boardFlush();
    expect(useBoard.getState().ghost).not.toBeNull();
    let i = 0;
    const ms = median(() => {
      i++;
      ev('pointermove', hit.sx + 10 + (i % 40), hit.sy);
      h.gestures.flushMove();
      boardFlush();
    });
    ev('pointerup', hit.sx + 20, hit.sy);
    boardFlush();
    console.info(`board drag step: ${ms.toFixed(3)} ms`);
    expect(useBoard.getState().ghost).toBeNull();
    expect(ms).toBeLessThan(100);
  });
});
