import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateById } from './index';
import { parseVignette } from '../schema';
import { measureById } from '../measures';
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

  it('every make() passes parseVignette with schema profile-studio/8', () => {
    for (const t of TEMPLATES) {
      const v = parseVignette(t.make());
      expect(v.schema).toBe('profile-studio/8');
      expect([v.collection, v.version]).toEqual(['', 1]);
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

  it('gives each template the class of its row (spec section 9)', () => {
    expect(Object.fromEntries(TEMPLATES.map((t) => [t.id, t.make().class]))).toEqual({
      'point-defence': 'Counter-UAS',
      'hover-track-hold': 'Counter-UAS',
      'swarm-split': 'Multi-aircraft',
      'delta-wing-owa': 'One-way attack',
      'fiber-fpv': 'Counter-UAS',
      'surrogate-racetrack': 'Surrogate',
      'detection-range-sweep': 'Counter-UAS',
      blank: 'Custom',
    });
  });

  it('every template but Blank has Q-01, in the DroneScore unit (plan 10.1)', () => {
    for (const t of RUNNABLE) {
      const v = t.make();
      expect(v.questions.map((q) => q.id)).toEqual(['Q-01']);
      for (const m of v.measures) expect(m.unit).toBe(measureById(m.id)!.unit);
      expect(t.question).toBe(v.questions[0]!.text);
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
      const texts = [t.question, ...v.questions.flatMap((q) => [q.text, q.note])];
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
});
