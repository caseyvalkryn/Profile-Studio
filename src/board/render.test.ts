// @vitest-environment node
// Board render, two parts.
// 1. The legacy render cases (legacy/test/cases/render.js), case by case, on the fixtures in
//    fixtures/legacy-derive/ (input through importLegacyV4 and toScene, derived from the fixture).
//    The chart cases are skipped: render.chart belongs to the strip lane.
// 2. Byte parity: the port's SVG equals the live legacy renderer's SVG (legacy scripts loaded in
//    node, as src/engine/preview.test.ts does) over every seed, camera, time and option set.
import { importLegacyV4 } from '../domain/migrate';
import { derived, preview } from '../engine';
import { cameras } from './cameras';
import { bounds } from './geo';
import { list } from './layers';
import { card, hitTest, scene, type BoardView, type RenderOpts } from './render';
import { toScene } from './scene';
import {
  FIXTURES,
  derivedView,
  fixture,
  loadLegacy,
  wellFormed,
  type LegacyPatch,
} from './testkit';
import type { DerivedView, Scene } from './types';

const CAMS = ['plan', 'elev', 'axon'] as const;
const SIZE = { W: 900, H: 600 };

function load(id: string): { sc: Scene; d: DerivedView; tmax: number } {
  const f = fixture(id);
  return {
    sc: toScene(importLegacyV4(JSON.parse(JSON.stringify(f.input)))),
    d: derivedView(f.derived),
    tmax: f.derived.tmax,
  };
}

// every element with data-k carries data-id; no em-dash; no literal colour
function checkSvg(svg: string, where: string) {
  expect(typeof svg, where).toBe('string');
  for (const t of svg.match(/<[a-z][^>]*\sdata-k="[^"]*"[^>]*>/g) || [])
    expect(/\sdata-id="[^"]+"/.test(t), where + ': ' + t).toBe(true);
  expect(svg.indexOf('—'), where + ': em-dash').toBeLessThan(0);
  expect(
    /#[0-9a-fA-F]{3,6}\b/.test(svg.replace(/url\(#[^)]*\)/g, '')),
    where + ': literal colour',
  ).toBe(false);
  expect(wellFormed(svg), where + ': well formed').toBe(true);
}

describe('legacy render cases on the fixtures', () => {
  it.each(FIXTURES)('%s', (id) => {
    const { sc, d, tmax } = load(id);
    const opts: RenderOpts = { derived: d };
    for (const proj of CAMS) {
      for (const t of [null, 0, tmax]) {
        const out = scene(sc, { proj, t }, SIZE, opts);
        const where = id + ' ' + proj + ' t ' + t;
        expect(out.svg.indexOf('<svg'), where).toBe(0);
        if (sc.scene.paths.length)
          expect(out.svg.indexOf('data-k="path"'), where + ': has a path').toBeGreaterThanOrEqual(
            0,
          );
        expect(out.cam.kind, where).toBe(proj);
        checkSvg(out.svg, where);
      }
      const p = sc.scene.paths[0];
      if (p) {
        const e = scene(sc, { proj, t: 60, sel: { kind: 'path', id: p.id, i: 0 } }, SIZE, {
          derived: d,
          edit: true,
        });
        expect(e.hits.length).toBeGreaterThan(0);
        if (proj !== 'axon')
          expect(e.hits.some((h) => h.handle && h.kind === 'path' && h.id === p.id)).toBe(true);
        checkSvg(e.svg, id + ' ' + proj + ' edit');
      }
      for (const k of ['systems', 'volumes', 'planes'] as const) {
        const o = sc.scene[k][0];
        if (!o) continue;
        const kind = k.slice(0, -1);
        checkSvg(
          scene(sc, { proj, t: 60, sel: { kind, id: o.id, i: 0 } }, SIZE, {
            derived: d,
            edit: true,
          }).svg,
          id + ' ' + proj + ' sel ' + kind,
        );
      }
      const ev = sc.events[0];
      if (ev)
        checkSvg(
          scene(sc, { proj, t: ev.t, sel: { kind: 'event', id: ev.id } }, SIZE, {
            derived: d,
            edit: true,
          }).svg,
          id + ' sel event',
        );
      const off: Record<string, boolean> = {};
      const on: Record<string, boolean> = {};
      list().forEach((L) => ((off[L.id] = false), (on[L.id] = true)));
      checkSvg(
        scene(sc, { proj, t: 60, layers: off }, SIZE, { derived: d, edit: true }).svg,
        id + ' layers off',
      );
      checkSvg(
        scene(sc, { proj, t: 120, hoverT: 90, layers: on, focus: p ? [p.id] : [] }, SIZE, opts).svg,
        id + ' layers on',
      );
      checkSvg(
        scene(sc, { proj, t: 120 }, { W: 300, H: 160 }, { derived: d, thumb: true }).svg,
        id + ' thumb',
      );
    }
    [...sc.cards, null].forEach((c, i) =>
      checkSvg(card(sc, d, c, { W: 300, H: 160 }, true), id + ' card ' + i),
    );
  });

  const { sc: c1, d: d1 } = load('CUAS-001');
  const E: RenderOpts = { derived: d1, edit: true };

  it('placing views: system ghost, aircraft route, formation ghost, ruler, ghost record', () => {
    const sysGhost = scene(
      c1,
      {
        proj: 'plan',
        t: 60,
        placing: { kind: 'system', sysKind: 'radar', pts: [], at: { x: 500, y: 500 } },
      },
      SIZE,
      E,
    );
    expect(sysGhost.svg).toContain('class="placing"');
    checkSvg(sysGhost.svg, 'placing system');
    checkSvg(
      scene(
        c1,
        { proj: 'elev', t: 60, placing: { kind: 'system', sysKind: 'radar', pts: [] } },
        SIZE,
        E,
      ).svg,
      'placing system elev',
    );
    checkSvg(
      scene(
        c1,
        {
          proj: 'plan',
          t: 60,
          placing: {
            kind: 'aircraft',
            pts: [
              { x: 0, y: 3000, z: 100 },
              { x: 500, y: 2000, z: 100 },
            ],
          },
        },
        SIZE,
        E,
      ).svg,
      'placing aircraft',
    );
    checkSvg(
      scene(
        c1,
        {
          proj: 'plan',
          t: 60,
          placing: { kind: 'formation', pts: [], pathId: 'T1', n: 3, spacing: 120 },
        },
        SIZE,
        E,
      ).svg,
      'placing formation',
    );
    const rl = scene(
      c1,
      {
        proj: 'plan',
        t: 60,
        ruler: {
          a: { x: 0, y: 0, kind: 'system', id: 'RDR-1' },
          b: { x: 1000, y: 1000, kind: 'path', id: 'T1' },
          done: true,
        },
      },
      SIZE,
      E,
    );
    expect(rl.svg).toContain('class="rulerl"');
    const ghost = scene(c1, { proj: 'plan', t: 60, sel: { kind: 'path', id: 'T1', i: 0 } }, SIZE, {
      ...E,
      ghost: { rec: c1, derived: d1 },
    });
    expect(ghost.svg).toContain('class="ghostrec"');
  });

  it('directed energy draws the EW ring class (F-11)', () => {
    const sc = structuredClone(c1);
    const ew = sc.scene.systems.find((x) => x.kind === 'ew')!;
    ew.kind = 'de';
    const svg = scene(sc, { proj: 'plan', t: 60 }, SIZE, { derived: d1 }).svg;
    expect(svg).toMatch(new RegExp('class="ring rg-ew[^"]*" data-k="system" data-id="' + ew.id));
  });

  it('track lifecycle on CUAS-001 T1: Detect 28 s, Track 46 s, Identify 150 s', () => {
    const frameAt = (t: number) => {
      const s = scene(c1, { proj: 'plan', t }, SIZE, { derived: d1 }).svg;
      const m = s.match(/<g class="af af-([a-z]+)[^"]*"/);
      return { id: m ? m[1] : null, cross: s.indexOf('class="tspi"') >= 0 };
    };
    const f20 = frameAt(20);
    expect(f20.id).toBeNull();
    expect(f20.cross).toBe(true);
    expect(frameAt(31).id).toBe('pending');
    expect(frameAt(120).id).toBe('unknown');
    expect(frameAt(200).id).toBe('hostile');
    const noTracks = scene(
      c1,
      { proj: 'plan', t: 200, layers: { tracks: false, target: true } },
      SIZE,
      { derived: d1 },
    ).svg;
    expect(noTracks.indexOf('class="tspi"') >= 0 && noTracks.indexOf('class="af ') < 0).toBe(true);
  });

  it('hit test: a handle wins over the object under it; every hit carries the key', () => {
    const sel = scene(c1, { proj: 'plan', t: 60, sel: { kind: 'path', id: 'T1', i: 0 } }, SIZE, E);
    const wp = sel.hits.find((h) => h.handle && h.role === 'centre' && h.kind === 'path');
    expect(wp).toBeTruthy();
    const got = hitTest(sel.hits, wp!.sx, wp!.sy);
    expect(got && got.handle && got.kind === 'path' && got.i === 0).toBe(true);
    expect(hitTest(sel.hits, -500, -500)).toBeNull();
    const t1 = c1.scene.paths.find((p) => p.id === 'T1')!;
    expect(got!.key).toBe(t1.key);
    for (const h of sel.hits)
      if (h.kind !== 'group') expect(typeof h.key, h.kind + ' ' + h.id).toBe('string');
  });

  it('cameras round trip', () => {
    const cam = cameras.get('plan').setup(c1.scene, d1, SIZE, { bounds: bounds(c1.scene) }, {});
    const sp = cam.project(1234, -567, 0);
    const back = cam.unproject(sp[0], sp[1]) as { x: number; y: number };
    expect(Math.abs(back.x - 1234)).toBeLessThan(1e-6);
    expect(Math.abs(back.y + 567)).toBeLessThan(1e-6);
    const ec = cameras
      .get('elev')
      .setup(c1.scene, d1, SIZE, { ref: 'asset', bounds: bounds(c1.scene) }, {});
    const ep = ec.projectRZ!(1500, 120);
    const eb = ec.unproject(ep[0], ep[1]) as { r: number; z: number };
    expect(Math.abs(eb.r - 1500)).toBeLessThan(1e-6);
    expect(Math.abs(eb.z - 120)).toBeLessThan(1e-6);
  });

  it('fragments: one per layer that ran, with its inputs; the svg body is their concatenation', () => {
    const out = scene(c1, { proj: 'plan', t: 60 }, SIZE, { derived: d1 });
    const ids = out.fragments.map((f) => f.layerId);
    expect(ids).toEqual([
      'grid',
      'volumes',
      'reach',
      'systems',
      'envelopes',
      'paths',
      'keypoints',
      'keypoints-now',
      'events',
      'tracks',
      'target',
      'labels',
    ]);
    const body = out.fragments.map((f) => f.svg).join('');
    expect(out.svg).toContain(body);
    for (const f of out.fragments) if (f.svg) expect(f.inputs.length, f.layerId).toBeGreaterThan(0);
    const tick = scene(c1, { proj: 'plan', t: 60 }, SIZE, { derived: d1, only: ['tracks'] });
    expect(tick.fragments.map((f) => f.layerId)).toEqual(['tracks']);
    expect(tick.fragments[0]!.svg).toBe(out.fragments.find((f) => f.layerId === 'tracks')!.svg);
  });
});

// Phase 10 deviations from the legacy renderer (review 10.R, lane 10.F). The legacy scripts load
// with these edits, so every other byte still compares against the live legacy output.
const PHASE_10_DEVIATIONS: readonly LegacyPatch[] = [
  // F-02: the selection and the focus place their labels first; event labels go ahead of the
  // track datablocks (p 1), as the mockup never culls an event label.
  [
    '43-layer-labels.js',
    'var pa = selId != null && a.id === selId ? 0 : a.p, pb = selId != null && b.id === selId ? 0 : b.p;',
    'var fo = ctx.focus || [], first = function (id) { return id != null && (id === selId || fo.indexOf(id) >= 0); };' +
      ' var pa = first(a.id) ? 0 : a.p, pb = first(b.id) ? 0 : b.p;',
  ],
  ['43-layer-events.js', 'ctx.label({ p: 3, id: e.id,', 'ctx.label({ p: 0.5, id: e.id,'],
  // F-06: in Elevation MAX RG clamps inside the frame, clear of the axis title, and the zero
  // range tick gives way to the labels at the origin.
  [
    '43-layer-reach.js',
    'top = [tp[0], tp[1] - 4];',
    'top = [tp[0], Math.max(tp[1] - 4, cam.frame.y0 + 12)];',
  ],
  [
    '43-layer-grid.js',
    'if (!ctx.thumb) out += S("text", { x: t.px, y: r1(f.y1 + 14),',
    'if (!ctx.thumb && t.v !== 0) out += S("text", { x: t.px, y: r1(f.y1 + 14),',
  ],
  // Lane 11.1 item 7: the label drops 8 px inside the frame top (was 12) and, when it would sit
  // within 10 px above the top height tick, keeps the axis title's 10 px gap above that tick.
  [
    '43-layer-reach.js',
    'top = [tp[0], Math.max(tp[1] - 4, cam.frame.y0 + 12)];',
    'var yt = cam.axes.yTicks, tk = yt.length ? yt[yt.length - 1].px : null,' +
      ' ty = Math.max(tp[1] - 4, cam.frame.y0 + 8);' +
      ' if (tk !== null && ty > tk - 10 && ty <= tk && tk - 10 >= cam.frame.y0 + 8) ty = tk - 10;' +
      ' top = [tp[0], ty];',
  ],
  // Lane 11.1 item 8: the board label "MAX RG" reads "Max range" (user decision, 2026-11-01).
  [
    '43-layer-reach.js',
    'ctx.sym.textBox(top[0], top[1], "MAX RG", 10, "middle"), svg: ctx.sym.label(top[0], top[1], "MAX RG",',
    'ctx.sym.textBox(top[0], top[1], "Max range", 10, "middle"), svg: ctx.sym.label(top[0], top[1], "Max range",',
  ],
  // Lane 11.F F-01: only the max range ring (plan circle or sector, Elevation arc) carries
  // data-role="range", the one reach part a press off the glyph drags as range.
  [
    '43-layer-reach.js',
    'at = { "data-k": "system", "data-id": s.id }, top;',
    'at = { "data-k": "system", "data-id": s.id }, rg = Object.assign({}, at, { "data-role": "range" }), top;',
  ],
  [
    '43-layer-reach.js',
    'if (d) out += S("path", Object.assign({ d: d, class: c }, at));',
    'if (d) out += S("path", Object.assign({ d: d, class: c }, rg));',
  ],
  ['43-layer-reach.js', 'r: r1(R), class: c }, at));', 'r: r1(R), class: c }, rg));'],
  [
    '43-layer-reach.js',
    'if (arc) out += S("polyline", Object.assign({ points: arc, class: c }, at));',
    'if (arc) out += S("polyline", Object.assign({ points: arc, class: c }, rg));',
  ],
  // F-11: directed energy draws the EW ring, as the mockup's "ring ew".
  [
    '43-layer-reach.js',
    's.kind === "ew" ? "rg-ew"',
    's.kind === "ew" || s.kind === "de" ? "rg-ew"',
  ],
];

// Phase 13 deviation (lane 13.3): the key point marks on the track. The port's `keypoints` and
// `keypoints-now` layers (registered in layers/events.ts, under the Events chip) draw each
// threat's F2T2EA stages and its defended asset entry as `<g class="kp ...">` groups, and the
// root svg carries the cursor time as `style="--t:<t>"` for their CSS state. Legacy has no such
// layer, its derive has no `stages` and its root has no style, so a source patch would have to
// write the whole feature again in ES5 (the stage loop, the declutter, the seven glyphs, the
// title, the current mark). The layers add no hit and no label candidate, so stripping their
// groups and the root style leaves every other byte comparable. The marks' presence,
// positions, `--kt` and the root `--t` are asserted in keypoints.test.ts.
const KP_LAYER =
  /<g class="ly ly-keypoints(?:-now)?">(?:<g class="kp [^"]*" data-k="keypoint(?:-now)?"[^>]*>.*?<\/g>)+<\/g>/g;
const ROOT_T = /^(<svg [^>]*?) style="--t:[^"]*"/;
function withoutKeyPoints(svg: string): string {
  return svg.replace(KP_LAYER, '').replace(ROOT_T, '$1');
}

describe('byte parity with the legacy renderer', () => {
  const PS = loadLegacy(PHASE_10_DEVIATIONS);
  const seeds = PS.seed.load();
  function port(r: (typeof seeds)[number]): Scene {
    return structuredClone(toScene(importLegacyV4(JSON.parse(JSON.stringify(r)))));
  }
  const W = { W: 1440, H: 900 };

  it.each(seeds.map((r) => [r.id, r] as const))('%s', (id, r) => {
    PS.units.set('nav');
    const d = PS.derive.all(r);
    const sc = port(r);
    const views: BoardView[] = [];
    const p0 = sc.scene.paths[0];
    for (const proj of CAMS) {
      for (const t of [null, 0, 60, 200, d.tmax]) views.push({ proj, t });
      views.push({
        proj,
        t: 120,
        hoverT: 90,
        layers: Object.fromEntries(list().map((L) => [L.id, true])),
        focus: p0 ? [p0.id] : [],
      });
      views.push({ proj, t: 60, layers: Object.fromEntries(list().map((L) => [L.id, false])) });
      views.push({ proj, yaw: 20, pitch: 30, zoom: 1.6, px: -40, py: 25, t: 90 });
      if (p0)
        views.push({
          proj,
          t: 60,
          sel: { kind: 'path', id: p0.id, i: 0 },
          hover: { kind: 'system', id: sc.scene.systems[0]?.id ?? null },
        });
      for (const k of ['systems', 'volumes', 'planes'] as const) {
        const o = sc.scene[k][0];
        if (o) views.push({ proj, t: 60, sel: { kind: k.slice(0, -1), id: o.id, i: 0 } });
      }
      const ev = sc.events[0];
      if (ev) views.push({ proj, t: ev.t, sel: { kind: 'event', id: ev.id } });
    }
    for (const v of views) {
      for (const mode of [{}, { edit: true }, { thumb: true }]) {
        const a = PS.render.scene(r, { ...v, units: 'nav' }, W, { derived: d, ...mode }).svg;
        const b = withoutKeyPoints(
          scene(sc, { ...v, units: 'nav' }, W, { derived: d, ...mode }).svg,
        );
        expect(b, id + ' ' + JSON.stringify(v) + ' ' + JSON.stringify(mode)).toBe(a);
      }
    }
    ((r.cards as unknown[] | undefined) ?? []).forEach((c, i) => {
      expect(
        withoutKeyPoints(card(sc, d, sc.cards[i], { W: 300, H: 160 }, true)),
        id + ' card ' + i,
      ).toBe(PS.render.card(r, c, { W: 300, H: 160 }, true));
    });
    expect(withoutKeyPoints(card(sc, d, null, null, false)), id + ' null card').toBe(
      PS.render.card(r, null, null, false),
    );
    PS.units.set('si');
    const a = PS.render.scene(r, { proj: 'elev', t: 60, units: 'si' }, W, { derived: d }).svg;
    expect(
      withoutKeyPoints(scene(sc, { proj: 'elev', t: 60, units: 'si' }, W, { derived: d }).svg),
      id + ' si',
    ).toBe(a);
    PS.units.set('nav');
  });

  it('CUAS-001 placing, ruler and ghost views', () => {
    PS.units.set('nav');
    const r = seeds.find((x) => x.id === 'CUAS-001')!;
    const d = PS.derive.all(r);
    const sc = port(r);
    const views: BoardView[] = [
      {
        proj: 'plan',
        t: 60,
        placing: { kind: 'system', sysKind: 'radar', pts: [], at: { x: 500, y: 500 } },
      },
      {
        proj: 'elev',
        t: 60,
        placing: { kind: 'system', sysKind: 'ew', pts: [], at: { x: 500, y: 500, z: 20 } },
      },
      {
        proj: 'plan',
        t: 60,
        placing: {
          kind: 'aircraft',
          pts: [
            { x: 0, y: 3000, z: 100 },
            { x: 500, y: 2000, z: 100 },
          ],
        },
      },
      {
        proj: 'plan',
        t: 60,
        placing: {
          kind: 'volume',
          pts: [
            [0, 0],
            [400, 0],
            [400, 300],
          ],
          cur: [100, 500],
        },
      },
      { proj: 'plan', t: 60, placing: { kind: 'event', pts: [], at: { x: 900, y: 900 } } },
      {
        proj: 'plan',
        t: 60,
        placing: { kind: 'formation', pts: [], pathId: 'T1', n: 3, spacing: 120 },
      },
      {
        proj: 'plan',
        t: 60,
        ruler: {
          a: { x: 0, y: 0, kind: 'system', id: 'RDR-1' },
          b: { x: 1000, y: 1000, kind: 'path', id: 'T1' },
          done: true,
        },
      },
      { proj: 'plan', t: 60, sel: { kind: 'path', id: 'T1', i: 1 } },
      { proj: 'elev', t: 60, sel: { kind: 'path', id: 'T1', i: 1 } },
    ];
    for (const v of views) {
      const a = PS.render.scene(r, { ...v, units: 'nav' }, W, { derived: d, edit: true }).svg;
      expect(
        withoutKeyPoints(scene(sc, { ...v, units: 'nav' }, W, { derived: d, edit: true }).svg),
        JSON.stringify(v),
      ).toBe(a);
    }
    const ga = PS.render.scene(
      r,
      { proj: 'plan', t: 60, sel: { kind: 'path', id: 'T1', i: 0 }, units: 'nav' },
      W,
      { derived: d, edit: true, ghost: r },
    ).svg;
    const gb = scene(
      sc,
      { proj: 'plan', t: 60, sel: { kind: 'path', id: 'T1', i: 0 }, units: 'nav' },
      W,
      { derived: d, edit: true, ghost: { rec: sc, derived: d } },
    ).svg;
    expect(withoutKeyPoints(gb)).toBe(ga);
  });
});

describe('the engine adapter feeds the board', () => {
  // Derived (src/engine/derived.ts) is assignable to DerivedView, and every fixture renders in
  // every camera from the adapter output rather than the fixture's legacy derive output.
  it('derived(v, preview(v)) renders every fixture in plan, elev and axon', () => {
    for (const id of FIXTURES) {
      const v = importLegacyV4(JSON.parse(JSON.stringify(fixture(id).input)));
      const d: DerivedView = derived(v, preview(v));
      const sc = toScene(v);
      for (const cam of CAMS) {
        const out = scene(sc, { cam, t: 0 } as BoardView, SIZE, { derived: d });
        checkSvg(out.svg, id + ' ' + cam + ' adapter');
        if (v.threats.length)
          expect(out.svg.indexOf('ly-tracks'), id + ' ' + cam).toBeGreaterThan(-1);
      }
    }
  });
});
