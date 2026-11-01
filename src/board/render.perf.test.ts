// @vitest-environment node
// Board render time on a 40-threat, 15-sensor synthetic vignette, all three cameras at 1440x900.
// Budget: 16 ms per frame for the tick layers (tracks, telemetry, envelopes, events, labels).
// The full render is logged, not budgeted: it runs on edits and camera moves, not on every tick.
import { SENSOR_KINDS } from '../domain/catalog';
import type { Threat } from '../domain/types';
import { posAt, timed } from '../engine/geo';
import { testEffector, testSensor, testVignette } from '../engine/testVignette';
import { scene } from './render';
import { toScene } from './scene';
import type { DerivedView, TrackSpan } from './types';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function synthetic(nThreats = 40, nSensors = 15, seed = 7) {
  const rnd = lcg(seed);
  const between = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const types = ['g1-quad-isr', 'g1-fpv-fiber', 'g2-lm-xwing', 'g3-delta-owa', 'g1-swarm-quad'];
  const threats: Threat[] = [];
  for (let i = 0; i < nThreats; i++) {
    const brg = between(0, 2 * Math.PI);
    const R = between(4000, 9000);
    const n = 4 + Math.floor(rnd() * 3);
    const path = [];
    for (let k = 0; k < n; k++) {
      const r = R * (1 - k / (n - 1));
      const wob = between(-0.15, 0.15);
      path.push({
        key: `t${i}w${k}`,
        x: r * Math.cos(brg + wob),
        y: r * Math.sin(brg + wob),
        z: between(40, 400),
        holdS: 0,
      });
    }
    threats.push({
      key: `t${i}`,
      id: `T${i + 1}`,
      type: types[i % types.length]!,
      path,
      speedMs: between(12, 40),
      group: i % 8 < 4 ? 'R' + Math.floor(i / 8) : '',
    });
  }
  const sensors = [];
  for (let i = 0; i < nSensors; i++) {
    const kind = SENSOR_KINDS[i % SENSOR_KINDS.length]!;
    sensors.push(
      testSensor(`S${i + 1}`, kind, kind === 'radar' ? 6000 : 3000, {
        key: `s${i}`,
        x: between(-1500, 1500),
        y: between(-1500, 1500),
      }),
    );
  }
  const v = testVignette({
    threats,
    sensors,
    effectors: [testEffector('E1'), testEffector('E2', { kind: 'ew', x: 200 })],
  });
  const sc = toScene(v);
  const tl: DerivedView['timed'] = {};
  const trackLine: Record<string, TrackSpan[]> = {};
  for (const th of threats) {
    const w = timed(th.path, th.speedMs ?? 15);
    tl[th.id] = w;
    const t1 = w[w.length - 1]!.t1;
    trackLine[th.id] = [
      { state: 'pending', t0: t1 * 0.2, t1: t1 * 0.35 },
      { state: 'unknown', t0: t1 * 0.35, t1: t1 * 0.6 },
      { state: 'identity', t0: t1 * 0.6, t1 },
    ];
  }
  const groups: Record<string, string[]> = {};
  const groupOf: Record<string, string> = {};
  for (const th of threats) {
    if (!th.group) continue;
    (groups[th.group] ||= []).push(th.id);
    groupOf[th.id] = th.group;
  }
  const derived: DerivedView = {
    timed: tl,
    trackLine,
    groupOf,
    origin: { x: 0, y: 0, z: 0 },
    coveringAt: (pid, t) => {
      const w = tl[pid];
      if (!w) return [];
      const p = posAt(w, t);
      return sc.scene.systems
        .filter((s) => Math.hypot(p.x - s.x, p.y - s.y) <= (s.range || 0))
        .map((s) => s.id);
    },
    holdsAt: () => [],
    envelopesAt: (t) =>
      Object.values(groups).map((m) => ({
        members: m,
        hull: m.map((id) => {
          const p = posAt(tl[id]!, t);
          return { x: p.x, y: p.y };
        }),
      })),
  };
  return { sc, derived };
}

const SIZE = { W: 1440, H: 900 };
const TICK = ['tracks', 'telemetry', 'envelopes', 'events', 'labels'];

function timeIt(fn: () => void, n = 20): number {
  for (let i = 0; i < 3; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  return (performance.now() - t0) / n;
}

describe('board render time, 40 threats x 15 sensors', () => {
  const { sc, derived } = synthetic();
  for (const proj of ['plan', 'elev', 'axon'] as const) {
    it(proj + ': tick layers render under 16 ms', () => {
      const view = { proj, t: 120 };
      const full = timeIt(() => scene(sc, view, SIZE, { derived }));
      const tracks = timeIt(() => scene(sc, view, SIZE, { derived, only: ['tracks'] }));
      const tick = timeIt(() => scene(sc, view, SIZE, { derived, only: TICK }));
      console.log(
        `board perf ${proj}: full ${full.toFixed(2)} ms, tracks ${tracks.toFixed(2)} ms, tick set ${tick.toFixed(2)} ms`,
      );
      expect(scene(sc, view, SIZE, { derived, only: ['tracks'] }).svg.length).toBeGreaterThan(0);
      expect(tick).toBeLessThan(16);
      expect(tracks).toBeLessThan(16);
    });
  }
});
