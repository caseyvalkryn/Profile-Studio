// @vitest-environment node
// The coverage layer: the ground clip helpers, the cap elevations, the footprint edge and the
// drawing per camera on the JIOP-1 cameras (profiles/saved/JIOP-1.json) and CUAS-001.
import fs from 'node:fs';
import path from 'node:path';
import { parseVignette } from '../../domain';
import { importLegacyV4 } from '../../domain/migrate';
import { derived, preview } from '../../engine';
import { scene } from '../render';
import { toScene } from '../scene';
import { derivedView, fixture } from '../testkit';
import type { SystemRec } from '../types';
import { capElevations, clipPoly, clipRuns, footprintEdge } from './coverage';

const SIZE = { W: 900, H: 600 };

function sys(p: Partial<SystemRec>): SystemRec {
  return {
    key: 'k',
    id: 'S',
    kind: 'radar',
    x: 0,
    y: 0,
    z: 0,
    range: 100,
    rmin: 0,
    fov: 360,
    bearing: 0,
    elMin: -90,
    elMax: 90,
    status: 'active',
    zmin: 0,
    zmax: null,
    ...p,
  };
}

function jiop1() {
  const v = parseVignette(
    JSON.parse(fs.readFileSync(path.resolve('profiles/saved/JIOP-1.json'), 'utf8')),
  );
  return { sc: toScene(v), d: derived(v, preview(v)) };
}

function covGroups(svg: string): string[] {
  return svg.match(/<g class="cov [^"]*" data-k="coverage" data-id="[^"]*">.*?<\/g>/g) || [];
}

describe('ground clip', () => {
  it('clipRuns cuts a polyline at the ground and drops the part below', () => {
    const runs = clipRuns([
      { x: 0, y: 0, z: 10 },
      { x: 10, y: 0, z: -10 },
      { x: 20, y: 0, z: -10 },
      { x: 30, y: 0, z: 10 },
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual([
      { x: 0, y: 0, z: 10 },
      { x: 5, y: 0, z: 0 },
    ]);
    expect(runs[1]).toEqual([
      { x: 25, y: 0, z: 0 },
      { x: 30, y: 0, z: 10 },
    ]);
    expect(
      clipRuns([
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ]),
    ).toEqual([]);
  });

  it('clipPoly keeps the part above the ground and drops a face on the ground', () => {
    const c = clipPoly([
      { x: 0, y: 0, z: 10 },
      { x: 10, y: 0, z: 10 },
      { x: 10, y: 0, z: -10 },
      { x: 0, y: 0, z: -10 },
    ]);
    expect(c).toEqual([
      { x: 0, y: 0, z: 10 },
      { x: 10, y: 0, z: 10 },
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ]);
    expect(
      clipPoly([
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 10, z: 0 },
      ]),
    ).toEqual([]);
  });
});

describe('cap elevations and the footprint edge', () => {
  it('a dome from 0 to 90 has arcs at 0, 30 and 60; a camera band has its limits and 30', () => {
    expect(capElevations(0, 90)).toEqual([0, 30, 60]);
    expect(capElevations(-22.2, 42.2)).toEqual([-22.2, 30, 42.2]);
    expect(capElevations(-90, 90)).toEqual([30, 60]);
  });

  it('the footprint edge is where the lower limit meets the ground', () => {
    // CAM-4: 2.5 m up, lower limit -0.6 degrees, 500 m reach: the ground from 239 m out
    const rg = footprintEdge(sys({ z: 2.5, elMin: -0.6, elMax: 12.6, range: 500 }));
    expect(rg).toBeCloseTo(2.5 / Math.tan(0.6 * (Math.PI / 180)), 3);
    expect(footprintEdge(sys({ z: 0, elMin: -10 }))).toBeNull();
    expect(footprintEdge(sys({ z: 5, elMin: 0 }))).toBeNull();
    // the lower limit reaches the ground beyond the reach: no edge inside the ring
    expect(footprintEdge(sys({ z: 50, elMin: -1, range: 100 }))).toBeNull();
  });
});

describe('the layer on JIOP-1', () => {
  const { sc, d } = jiop1();

  it('3D: one group per camera with faces, edges, a boresight and a footprint edge', () => {
    const out = scene(sc, { proj: 'axon', t: null }, SIZE, { derived: d });
    const groups = covGroups(out.svg);
    expect(groups.map((g) => /data-id="([^"]*)"/.exec(g)![1])).toEqual([
      'CAM-1',
      'CAM-2',
      'CAM-3',
      'CAM-4',
    ]);
    for (const g of groups) {
      expect(g).toContain('class="cov cov-sensor"');
      expect((g.match(/class="face"/g) || []).length).toBe(5);
      expect(g).toContain('class="axis"');
      expect(g).toContain('class="ground"');
      expect(g).toContain('class="edge"');
    }
    expect(out.svg.indexOf('<g class="ly ly-coverage">')).toBeLessThan(
      out.svg.indexOf('<g class="ly ly-reach">'),
    );
  });

  it('Elevation: the band face and the boresight; Plan: the boresight and the footprint edge', () => {
    const el = covGroups(scene(sc, { proj: 'elev', t: null }, SIZE, { derived: d }).svg);
    expect(el).toHaveLength(4);
    for (const g of el) {
      expect(g).toContain('class="face"');
      expect(g).toContain('class="axis"');
      expect(g).not.toContain('class="edge"');
    }
    const pl = covGroups(scene(sc, { proj: 'plan', t: null }, SIZE, { derived: d }).svg);
    expect(pl).toHaveLength(4);
    for (const g of pl) {
      expect(g).toContain('<line');
      expect(g).toContain('class="ground"');
      expect(g).not.toContain('class="face"');
    }
  });

  it('follows the Reach toggle, adds no hit, and the thumb draws it too', () => {
    const off = scene(sc, { proj: 'axon', t: null, layers: { reach: false } }, SIZE, {
      derived: d,
    });
    expect(off.svg).not.toContain('ly-coverage');
    const on = scene(sc, { proj: 'axon', t: 0 }, SIZE, { derived: d, edit: true });
    expect(on.hits.some((h) => h.kind === 'coverage')).toBe(false);
    const thumb = scene(
      sc,
      { proj: 'axon', t: null },
      { W: 300, H: 160 },
      {
        derived: d,
        thumb: true,
      },
    );
    expect(covGroups(thumb.svg)).toHaveLength(4);
  });
});

describe('the layer on CUAS-001', () => {
  const f = fixture('CUAS-001');
  const sc = toScene(importLegacyV4(JSON.parse(JSON.stringify(f.input))));
  const d = derivedView(f.derived);

  it('a ground system with no limits draws a dome wireframe and no face; the tint follows cover', () => {
    const rest = scene(sc, { proj: 'axon', t: null }, SIZE, { derived: d }).svg;
    const groups = covGroups(rest);
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g).toContain('class="edge"');
      expect(g).not.toContain(' on"');
    }
    const t = f.derived.tmax / 2;
    const live = scene(sc, { proj: 'axon', t }, SIZE, { derived: d }).svg;
    const ringOn = (live.match(/class="ring rg-sensor on/g) || []).length;
    const covOn = (live.match(/class="cov cov-sensor on/g) || []).length;
    expect(covOn).toBe(ringOn);
    // Plan: an omnidirectional system on the ground draws nothing
    const plan = scene(sc, { proj: 'plan', t: null }, SIZE, { derived: d }).svg;
    for (const g of covGroups(plan)) expect(g).not.toContain('class="ground"');
  });
});
