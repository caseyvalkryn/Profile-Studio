import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateById } from './index';
import { parseVignette } from '../schema';
import { MEASURES, measureById } from '../measures';
import { run } from '../../engine/run';
import { score } from '../../engine/score';
import { preview } from '../../engine/preview';

const RUNNABLE = TEMPLATES.filter((t) => t.id !== 'blank');
// 2.3 Track Quantity is an entered measure (vendor sheet); the run rows cannot produce it.
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

  it('every make() passes parseVignette with schema profile-studio/5', () => {
    for (const t of TEMPLATES) {
      const v = parseVignette(t.make());
      expect(v.schema).toBe('profile-studio/5');
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
      const scores = score(rows, v.measures);
      for (const id of t.mainMeasures) {
        const s = scores.find((x) => x.id === id)!;
        expect(s, `${t.id}: ${id}`).toBeDefined();
        if (ENTERED.has(id)) {
          expect(s.value, `${t.id}: ${id} is entered`).toBeNull();
          expect(s.sourceClass).toBe('entered');
        } else {
          expect(s.value, `${t.id}: ${id}`).not.toBeNull();
          expect(s.interval, `${t.id}: ${id}`).not.toBeNull();
        }
      }
    }
  }, 30_000);
});
