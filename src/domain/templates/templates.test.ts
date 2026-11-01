import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateById } from './index';
import { parseVignette } from '../schema';
import { MEASURES, measureById } from '../measures';
import { run } from '../../engine/run';
import { enteredValues, score } from '../../engine/score';
import { sweep } from '../../engine/sweep';
import { HOVER_SCOPE } from './hoverTrackHold';
import { SWEEP_SCOPE } from './detectionRangeSweep';
import { preview } from '../../engine/preview';
import type { Vignette } from '../types';

type BoundsM = [number, number, number, number];

/** Bounds of every asset in metres (from the removed map/geojson.ts, lane 9.2.6). */
function assetBounds(d: Vignette): BoundsM | null {
  let b: BoundsM | null = null;
  const add = (x: number, y: number, r = 0) => {
    b = b
      ? [Math.min(b[0], x - r), Math.min(b[1], y - r), Math.max(b[2], x + r), Math.max(b[3], y + r)]
      : [x - r, y - r, x + r, y + r];
  };
  for (const t of d.threats) for (const w of t.path) add(w.x, w.y);
  for (const s of [...d.sensors, ...d.effectors]) add(s.x, s.y, s.rangeM);
  for (const n of d.nodes) add(n.x, n.y);
  for (const a of d.areas) for (const [x, y] of a.pts) add(x, y);
  return b;
}

const RUNNABLE = TEMPLATES.filter((t) => t.id !== 'blank');
// 2.3 Track Quantity is an entered measure (vendor sheet); it scores from the asset's entered
// value, not the run rows.
const ENTERED = new Set(MEASURES.filter((m) => m.sourceClass !== 'simulated').map((m) => m.id));

describe('TEMPLATES', () => {
  it('follows the spec section 9 order with Blank last', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      'point-defence',
      'hover-track-hold',
      'swarm-split',
      'delta-wing-owa',
      'fiber-fpv',
      'surrogate-racetrack',
      'detection-range-sweep',
      'blank',
    ]);
    expect(templateById('blank')?.question).toBe('');
  });

  it('every make() passes parseVignette with schema profile-studio/6', () => {
    for (const t of TEMPLATES) {
      const v = parseVignette(t.make());
      expect(v.schema).toBe('profile-studio/6');
      expect([v.planes, v.events, v.snapshots, v.cards, v.debrief]).toEqual([[], [], [], [], null]);
      expect(v.threats.every((x) => x.group === '')).toBe(true);
      expect(parseVignette(JSON.parse(JSON.stringify(v)))).toEqual(v);
      expect(v.areas.some((a) => a.kind === 'asset')).toBe(true);
      expect(v.site.name).not.toBe('');
    }
  });

  it('two make() calls give different ids and keys', () => {
    for (const t of TEMPLATES) {
      const a = t.make();
      const b = t.make();
      expect(a.id).not.toBe(b.id);
      const keys = (v: typeof a) =>
        [
          ...v.threats.flatMap((x) => [x.key, ...x.path.map((w) => w.key)]),
          ...v.sensors.map((x) => x.key),
          ...v.effectors.map((x) => x.key),
          ...v.nodes.map((x) => x.key),
          ...v.areas.map((x) => x.key),
          ...v.questions.map((x) => x.key),
          ...v.hypotheses.map((x) => x.key),
        ].sort();
      const ka = keys(a);
      const kb = new Set(keys(b));
      expect(new Set(ka).size).toBe(ka.length);
      expect(ka.some((k) => kb.has(k))).toBe(false);
    }
  });

  it('every mainMeasures id exists in MEASURES and has a setting in the vignette', () => {
    for (const t of TEMPLATES) {
      const v = t.make();
      for (const id of t.mainMeasures) {
        expect(measureById(id), `${t.id}: ${id}`).toBeDefined();
        expect(
          v.measures.map((m) => m.id),
          `${t.id}: ${id}`,
        ).toContain(id);
      }
    }
  });

  it('every template but Blank has Q-01 and H-01 on a main measure, in the DroneScore unit', () => {
    for (const t of RUNNABLE) {
      const v = t.make();
      expect(v.questions.map((q) => q.id)).toEqual(['Q-01']);
      expect(v.hypotheses.map((h) => h.id)).toEqual(['H-01']);
      const h = v.hypotheses[0]!;
      expect(h.question).toBe(v.questions[0]!.key);
      expect(t.mainMeasures).toContain(h.measure);
      expect(h.prediction).not.toBeNull();
      for (const m of v.measures) expect(m.unit).toBe(measureById(m.id)!.unit);
      expect(t.question).toBe(v.questions[0]!.text);
    }
  });

  it('the sweep hint matches the sweep Factor shape', () => {
    const t = templateById('detection-range-sweep')!;
    expect(t.sweep?.factor.kind).toBe('threat-altitude');
    expect(t.sweep?.factor.levels).toEqual(t.sweep?.levels);
  });

  it('the sweep template stores its factor on the vignette and passes the schema (review 6 F-02)', () => {
    const t = templateById('detection-range-sweep')!;
    const v = parseVignette(t.make());
    expect(v.sweep?.factors).toEqual([t.sweep!.factor]);
    expect(v.report.sections?.scope).toBe(SWEEP_SCOPE);
    // stored text names no unit, so it reads the same in nm and km (review 7.R F-17)
    expect(SWEEP_SCOPE).not.toMatch(/\d\s*(m|ft|km|nm)\b|\b(AGL|MSL)\b/);
    for (const o of TEMPLATES.filter((x) => !x.sweep)) expect(o.make().sweep, o.id).toBeUndefined();
  });

  it('the sweep shows an altitude effect on 1.1.2 (review 6 F-14)', () => {
    const v = templateById('detection-range-sweep')!.make();
    const s = sweep(v, v.sweep!.factors, 10, 1);
    const at = s.cells.map((c) => c.scores[0]!.value!);
    expect(at[0]!).toBeLessThan(at[at.length - 1]! - 500);
  }, 30_000);

  it('Hover track hold leaves the hover limit to the generated scope line (review 7.R F-01)', () => {
    const v = templateById('hover-track-hold')!.make();
    expect(v.report.sections?.scope).toBe(HOVER_SCOPE);
    expect(HOVER_SCOPE).toMatch(/^1\.2\.2 Track Continuity is measured over the orbit turn/);
    // The limit (the runs do not stop at the hover) is stated once, by simulationLimits.
    for (const text of [HOVER_SCOPE, v.questions[0]!.note]) {
      expect(text).not.toMatch(/stop|paus|without|Monte Carlo|waypoint/i);
    }
  });

  it('keeps the 24 px laydown rule at the default Build view (build.ts, review 7.R F-13)', () => {
    // The default view fits assetBounds with 1 m and 48 px padding (controller.ts `fit`) in the
    // map area of a 1440 x 900 window: 1440 less the 240 px library and the 280 px inspector,
    // 900 less the 36 px header, the 32 px Build bar and the 181 px timeline. Web Mercator keeps
    // one scale in x and y near the site, so the fit scale is the larger of the two ratios.
    const MAP_W = 1440 - 240 - 280;
    const MAP_H = 900 - 36 - 32 - 181;
    const PAD = 48;
    const MIN_PX = 24;
    for (const t of RUNNABLE) {
      const v = t.make();
      const b = assetBounds(v)!;
      const mPerPx = Math.max(
        (b[2] - b[0] + 2) / (MAP_W - 2 * PAD),
        (b[3] - b[1] + 2) / (MAP_H - 2 * PAD),
      );
      const assets = [...v.sensors, ...v.effectors, ...v.nodes].map((a) => ({
        id: a.id,
        x: a.x,
        y: a.y,
      }));
      const others = [
        ...v.threats.flatMap((th) =>
          th.path.map((w, i) => ({ id: `${th.id} WP ${i + 1}`, x: w.x, y: w.y })),
        ),
        ...v.areas.flatMap((a) =>
          a.pts.map(([x, y], i) => ({ id: `${a.id} corner ${i + 1}`, x, y })),
        ),
      ];
      const px = (a: { x: number; y: number }, o: { x: number; y: number }) =>
        Math.hypot(a.x - o.x, a.y - o.y) / mPerPx;
      // Every point asset clears every other point asset, every waypoint and every corner.
      assets.forEach((a, i) => {
        for (const o of [...assets.slice(i + 1), ...others])
          expect(px(a, o), `${t.id}: ${a.id} to ${o.id}`).toBeGreaterThanOrEqual(MIN_PX);
      });
    }
  });

  it('Swarm: no two waypoints share a point, so a stacked click reaches each once (7.R F-11)', () => {
    const v = templateById('swarm-split')!.make();
    const pts = v.threats.flatMap((t) =>
      t.path.map((w, i) => ({ id: `${t.id} WP ${i + 1}`, ...w })),
    );
    expect(pts).toHaveLength(18);
    pts.forEach((a, i) => {
      for (const b of pts.slice(i + 1))
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.id} to ${b.id}`).toBeGreaterThanOrEqual(100);
    });
    // The six starts read apart at the default Build view: 24 px or more (build.ts rule).
    const b = assetBounds(v)!;
    const mPerPx = Math.max((b[2] - b[0] + 2) / (920 - 96), (b[3] - b[1] + 2) / (651 - 96));
    const starts = v.threats.map((t) => t.path[0]!);
    starts.forEach((a, i) => {
      for (const o of starts.slice(i + 1))
        expect(Math.hypot(a.x - o.x, a.y - o.y) / mPerPx).toBeGreaterThanOrEqual(24);
    });
  });

  it('names every measure in template text by its DroneScore ID and name (review 7.R F-02)', () => {
    const named = /(?<![\d.])(\d[a-z]?\.\d+(?:\.\d+)?) (?=[A-Z])/g;
    let checked = 0;
    for (const t of TEMPLATES) {
      const v = t.make();
      const texts = [
        t.question,
        ...v.questions.flatMap((q) => [q.text, q.note]),
        ...Object.values(v.report.sections ?? {}),
      ];
      for (const text of texts.filter((x): x is string => typeof x === 'string')) {
        for (const m of text.matchAll(named)) {
          const measure = measureById(m[1]!);
          if (!measure) continue;
          const rest = text.slice(m.index + m[0].length);
          expect(rest.startsWith(measure.name), `${t.id}: ${m[1]} ${rest.slice(0, 30)}`).toBe(true);
          expect(rest.charAt(measure.name.length), `${t.id}: ${m[1]}`).not.toMatch(/[A-Za-z]/);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it('Swarm 2.3 Track Quantity scores Meets from the entered value 6 (review 6 F-05)', () => {
    const v = templateById('swarm-split')!.make();
    const s = score([], v.measures, { entered: enteredValues(v) }).find((x) => x.id === '2.3')!;
    expect(s).toMatchObject({
      value: 6,
      interval: null,
      sourceClass: 'entered',
      evaluation: 'meets',
    });
  });

  it('the preview reaches exactly the listed steps', () => {
    for (const t of TEMPLATES) {
      const pv = preview(t.make());
      for (const tp of Object.values(pv.threats)) {
        const reached = Object.entries(tp.stages)
          .filter(([, s]) => s != null)
          .map(([k]) => k);
        expect(reached, t.id).toEqual(t.steps);
      }
    }
  });

  it('every template but Blank runs at n 10, seed 1 and scores its simulated main measures', () => {
    for (const t of RUNNABLE) {
      const v = parseVignette(t.make());
      const { rows } = run(v, 10, 1);
      expect(rows.length).toBe(10 * v.threats.length);
      const scores = score(rows, v.measures, { entered: enteredValues(v) });
      for (const id of t.mainMeasures) {
        const s = scores.find((x) => x.id === id)!;
        expect(s, `${t.id}: ${id}`).toBeDefined();
        if (ENTERED.has(id)) {
          expect(s.value, `${t.id}: ${id} is entered`).not.toBeNull();
          expect(s.interval, `${t.id}: ${id} is entered`).toBeNull();
          expect(s.sourceClass).toBe('entered');
        } else {
          expect(s.value, `${t.id}: ${id}`).not.toBeNull();
          expect(s.interval, `${t.id}: ${id}`).not.toBeNull();
        }
      }
    }
  }, 30_000);
});
