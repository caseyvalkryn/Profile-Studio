// @vitest-environment node
// Key point marks on the track (lane 13.3): the keypoints layer draws each threat's F2T2EA stages
// and its defended asset entry from the engine's derived, each with its time as --kt; the root svg
// carries the cursor time as --t (board.css derives the state); keypoints-now draws the current
// mark per threat. CUAS-001
// through toScene and the engine: T1 Find 0:28, Fix 0:46, Track and Target 2:30, Engage 4:22,
// Assess 5:00, DA 6:54.
import { importLegacyV4 } from '../domain/migrate';
import { derived, preview, type Derived } from '../engine';
import { posAt } from '../engine/geo';
import { hitTest, scene, type BoardView } from './render';
import { toScene } from './scene';
import { fixture } from './testkit';

const SIZE = { W: 1440, H: 900 };
const v = importLegacyV4(JSON.parse(JSON.stringify(fixture('CUAS-001').input)));
const d: Derived = derived(v, preview(v));
const sc = toScene(v);
const ORDER = ['find', 'fix', 'track', 'target', 'engage', 'assess', 'da'];

type Mark = {
  cls: string[];
  id: string;
  stage: string;
  kt: string;
  title: string;
  x: number;
  y: number;
};

// the glyph centre from its first shape (symbols.keyPoint geometry)
function anchor(stage: string, inner: string): [number, number] {
  const n = (s: string) => [...s.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const shape = inner.replace(/<circle[^>]*class="kp-halo"[^>]*><\/circle>/, '');
  if (stage === 'track' || stage === 'engage') {
    const p = n(/points="([^"]*)"/.exec(shape)![1]!);
    return [p[0]!, p[1]! + 4.5];
  }
  if (stage === 'target' || stage === 'assess') {
    const p = n(/ d="([^"]*)"/.exec(shape)![1]!);
    return stage === 'target' ? [p[0]! + 4, p[1]!] : [p[0]! + 4, p[1]! + 4];
  }
  if (stage === 'da') {
    const x = Number(/ x="([^"]*)"/.exec(shape)![1]);
    const y = Number(/ y="([^"]*)"/.exec(shape)![1]);
    return [x + 1.5, y + 4.5];
  }
  return [Number(/cx="([^"]*)"/.exec(shape)![1]), Number(/cy="([^"]*)"/.exec(shape)![1])];
}

function marks(svg: string): Mark[] {
  const re =
    /<g class="(kp [^"]*)" data-k="keypoint" data-id="([^"]*)" data-stage="([^"]*)" style="--kt:([^"]*)"><title>([^<]*)<\/title>(.*?)<\/g>/g;
  return [...svg.matchAll(re)].map((m) => {
    const [x, y] = anchor(m[3]!, m[6]!);
    return { cls: m[1]!.split(' '), id: m[2]!, stage: m[3]!, kt: m[4]!, title: m[5]!, x, y };
  });
}

type Now = {
  cls: string[];
  id: string;
  stage: string;
  hx: number;
  hy: number;
  x: number;
  y: number;
};

function nowMarks(svg: string): Now[] {
  const re =
    /<g class="(kp kp-now [^"]*)" data-k="keypoint-now" data-id="([^"]*)" data-stage="([^"]*)"><circle cx="([^"]*)" cy="([^"]*)" r="6" class="kp-halo"><\/circle>(.*?)<\/g>/g;
  return [...svg.matchAll(re)].map((m) => {
    const [x, y] = anchor(m[3]!, m[6]!);
    return {
      cls: m[1]!.split(' '),
      id: m[2]!,
      stage: m[3]!,
      hx: Number(m[4]),
      hy: Number(m[5]),
      x,
      y,
    };
  });
}

const layer = (svg: string, id: string) =>
  new RegExp('<g class="ly ly-' + id + '">.*?</g></g>(?=<g class="ly|</svg>)').exec(svg)?.[0] ?? '';
const rootStyle = (svg: string) => /^<svg [^>]*?(?: style="([^"]*)")?>/.exec(svg)![1] ?? null;

function render(view: BoardView, dv: Derived = d, opts: { thumb?: boolean; edit?: boolean } = {}) {
  return scene(sc, view, SIZE, { derived: dv, ...opts });
}

describe('key point marks on the track', () => {
  it('one mark per key point in STAGES order then DA, each with its time as --kt', () => {
    const svg = render({ proj: 'plan', t: null }).svg;
    const ms = marks(svg);
    expect(ms.map((m) => m.stage)).toEqual(ORDER);
    expect(ms.every((m) => m.id === 'T1')).toBe(true);
    expect(
      ms.every((m) => m.cls.length === 2 && m.cls[0] === 'kp' && m.cls[1] === 'kp-' + m.stage),
    ).toBe(true);
    expect(ms.map((m) => m.kt)).toEqual([
      '28',
      '46',
      '150',
      '150',
      '262',
      '300',
      String(Math.round(d.daEntry.T1! * 10) / 10),
    ]);
    expect(ms[2]!.title).toBe('T1 Track · t+2:30 · EO-1');
    expect(ms[0]!.title).toBe('T1 Find · t+0:28 · RDR-1');
    expect(ms[6]!.title).toBe('T1 DA · t+6:54');
  });

  it('time off: no --t on the root and nothing in the now layer', () => {
    const svg = render({ proj: 'plan', t: null }).svg;
    expect(rootStyle(svg)).toBeNull();
    expect(svg).not.toContain('ly-keypoints-now');
    expect(svg).not.toContain('kp-halo');
    expect(nowMarks(svg)).toEqual([]);
  });

  it('t = 200: the root --t, the --kt on all seven marks, one now mark per threat at Target', () => {
    const svg = render({ proj: 'plan', t: 200 }).svg;
    expect(rootStyle(svg)).toBe('--t:200');
    expect(marks(svg).filter((m) => m.kt !== '')).toHaveLength(7);
    const now = nowMarks(svg);
    // Target shares 2:30 with Track and comes later in the order: the latest at or before 200
    expect(now.map((n) => n.id + ' ' + n.stage)).toEqual(['T1 target']);
    expect(now[0]!.cls).toEqual(['kp', 'kp-now', 'kp-target']);
    expect(svg.match(/class="kp-halo"/g)?.length).toBe(1);
    // at the cached screen position of the static Target mark
    const target = marks(svg).find((m) => m.stage === 'target')!;
    expect([now[0]!.x, now[0]!.y]).toEqual([target.x, target.y]);
    expect([now[0]!.hx, now[0]!.hy]).toEqual([target.x, target.y]);
    // before Find no mark is current
    expect(nowMarks(render({ proj: 'plan', t: 10 }).svg)).toEqual([]);
  });

  it('the static layer does not change with the cursor; the now layer does', () => {
    const at = (t: number | null) => render({ proj: 'plan', t }).svg;
    const s = layer(at(null), 'keypoints');
    expect(s).not.toBe('');
    expect(layer(at(10), 'keypoints')).toBe(s);
    expect(layer(at(200), 'keypoints')).toBe(s);
    expect(layer(at(200), 'keypoints-now')).toBe(layer(at(210), 'keypoints-now'));
    expect(layer(at(200), 'keypoints-now')).not.toBe(layer(at(270), 'keypoints-now'));
  });

  it('each mark sits at the track position at its time; Track and Target part by 10 px', () => {
    const out = render({ proj: 'plan', t: null });
    const ms = marks(out.svg);
    const w = d.timed.T1!;
    const at = (t: number) => {
      const q = posAt(w, t);
      return out.cam.project(q.x, q.y, 0);
    };
    const times = [28, 46, 150, 150, 262, 300, d.daEntry.T1!];
    ms.forEach((m, i) => {
      const c = at(times[i]!);
      const off = Math.hypot(m.x - c[0], m.y - c[1]);
      if (m.stage === 'target') expect(off).toBeCloseTo(10, 0);
      else expect(off, m.stage).toBeLessThan(0.11);
    });
  });

  it('Find at the first-see tick when its time is the first sensor time', () => {
    const geo: Derived = {
      ...d,
      stages: { T1: { ...d.stages.T1!, find: { t: 30.125, system: 'RDR-1', tGeo: 30.125 } } },
    };
    const out = render({ proj: 'plan', t: null }, geo);
    const find = marks(out.svg)[0]!;
    const fs = d.first.T1!['RDR-1']!;
    const c = out.cam.project(fs.pos.x, fs.pos.y, 0);
    expect(Math.hypot(find.x - c[0], find.y - c[1])).toBeLessThan(0.11);
  });

  it('thumb mode draws no marks; Elevation and 3D draw every mark', () => {
    for (const proj of ['plan', 'elev', 'axon'] as const)
      expect(render({ proj, t: 200 }, d, { thumb: true }).svg).not.toContain('data-k="keypoint"');
    for (const view of [
      { proj: 'elev' as const, t: 200 },
      { proj: 'elev' as const, t: 200, elevationMode: 'alongPath' as const },
      { proj: 'axon' as const, t: 200 },
    ]) {
      const ms = marks(render(view).svg);
      expect(ms.map((m) => m.stage)).toEqual(ORDER);
      expect(ms.every((m) => Number.isFinite(m.x) && Number.isFinite(m.y))).toBe(true);
    }
  });

  it('the cached positions follow a camera change on the same derived', () => {
    const pos = (view: BoardView) => marks(render(view).svg).map((m) => [m.x, m.y]);
    const a = pos({ proj: 'plan', t: 10 });
    expect(pos({ proj: 'plan', t: 200 })).toEqual(a);
    const panned = pos({ proj: 'plan', t: 200, px: 40, py: -30 });
    panned.forEach((p, i) => {
      expect(p[0]! - a[i]![0]!).toBeCloseTo(40, 0);
      expect(p[1]! - a[i]![1]!).toBeCloseTo(-30, 0);
    });
    expect(pos({ proj: 'plan', t: 10 })).toEqual(a);
    expect(pos({ proj: 'elev', t: 10, elevationMode: 'alongPath' })).not.toEqual(
      pos({ proj: 'elev', t: 10 }),
    );
  });

  it('marks are not hit targets', () => {
    const out = render({ proj: 'plan', t: 200 }, d, { edit: true });
    expect(out.hits.some((h) => (h.kind as string) === 'keypoint')).toBe(false);
    // a press on a mark finds what lies under it: the authored event's bead, the asset's edge
    const got = marks(out.svg).map((m) => {
      const h = hitTest(out.hits, m.x, m.y);
      return m.stage + ' ' + (h ? h.kind + ' ' + h.id : 'none');
    });
    expect(got).toEqual([
      'find event e1',
      'fix event e2',
      'track event e3',
      'target event e3',
      'engage event e5',
      'assess event e6',
      'da volume DA',
    ]);
  });
});
