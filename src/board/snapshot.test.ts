// @vitest-environment node
// Board snapshots: 9 fixtures x plan, elev (From asset), axon at 1440x900, at t = 0 and at the
// first stage time (see stageT). Every SVG is well formed and every class it emits is
// declared in board.css.
import fs from 'node:fs';
import path from 'node:path';
import { importLegacyV4 } from '../domain/migrate';
import { scene } from './render';
import { toScene } from './scene';
import { FIXTURES, derivedView, fixture, wellFormed, type FixtureDerived } from './testkit';

const SIZE = { W: 1440, H: 900 };

// The first stage time: the earliest trackLine span start after t = 0 (the first Detect or the
// first stage change). A fixture with no track line takes tmax / 2 so the timed layers still draw.
function stageT(d: FixtureDerived): number {
  let best = Infinity;
  for (const spans of Object.values(d.trackLine || {}))
    for (const s of spans) if (s.t0 > 0 && s.t0 < best) best = s.t0;
  return Number.isFinite(best) ? best : Math.round((d.tmax || 0) / 2);
}
const VIEWS = [
  ['plan', {}],
  ['elev', { elevationMode: 'fromAsset' as const }],
  ['axon', {}],
] as const;

const css = fs
  .readFileSync(path.resolve(__dirname, 'board.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const declared = new Set<string>();
for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) declared.add(m[1]!);

function classesOf(svg: string): Set<string> {
  const out = new Set<string>();
  for (const m of svg.matchAll(/\sclass="([^"]*)"/g))
    for (const c of m[1]!.split(/\s+/)) if (c) out.add(c);
  return out;
}

describe('board snapshots', () => {
  for (const id of FIXTURES) {
    const f = fixture(id);
    const sc = toScene(importLegacyV4(JSON.parse(JSON.stringify(f.input))));
    const d = derivedView(f.derived);
    const t1 = stageT(f.derived);
    for (const [proj, extra] of VIEWS) {
      for (const t of t1 > 0 ? [0, t1] : [0]) {
        it(`${id} ${proj} t=${t}`, () => {
          const r = scene(sc, { proj, t, ...extra }, SIZE, { derived: d });
          expect(wellFormed(r.svg)).toBe(true);
          const missing = [...classesOf(r.svg)].filter((c) => !declared.has(c));
          expect(missing).toEqual([]);
          expect(r.svg).toMatchSnapshot();
        });
      }
    }
  }
});
