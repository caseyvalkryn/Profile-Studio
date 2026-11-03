// Layer coverage (added 2026-11-03, not in legacy): the sensor volume the reach ring only
// hints at. A system covers the slant ranges rmin to range, the azimuths of its field of view
// about its bearing and the elevations elMin to elMax from its apex (x, y, z). The layer draws
// that volume under the Reach toggle, one order below reach so the ring sits on top:
//   3D: the faces (the elevation band's lower and upper cones, the two azimuth sides, the cap)
//       as faint fills, the edges (cap arcs at the limits and at 30 and 60 degrees, the
//       meridians at the azimuth edges or at the four cardinals, the limit rays), the boresight
//       of a sector and the footprint edge where the lower limit meets the ground.
//   Elevation: the band between the limit rays as a face, with the boresight.
//   Plan: the boresight of a sector and the footprint edge.
// Everything on or under the ground is cut away (the ground is the reach ring's business), so
// a camera on a mast shows the near edge of the ground it sees and a radar with a raised
// minimum elevation shows its blind cone. Adds no hit and no label; pointer-events none.
import { maxZOf, type Cam } from '../cameras';
import { register, type Ctx } from '../layers';
import { isSensorKind as isSensor } from '../scene';
import { r1 } from '../svg';
import type { SystemRec } from '../types';
import { active } from './reach';

const D2R = Math.PI / 180;
const EPS = 1e-6;

type P = { x: number; y: number; z: number };
type Pr = (p: P) => [number, number];

/** The polyline runs of `pts` above the ground, cut at the crossings. */
export function clipRuns(pts: readonly P[]): P[][] {
  const runs: P[][] = [];
  let run: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = i > 0 ? pts[i - 1]! : null;
    if (q && q.z > EPS !== p.z > EPS) {
      const f = (0 - q.z) / (p.z - q.z);
      const c = { x: q.x + f * (p.x - q.x), y: q.y + f * (p.y - q.y), z: 0 };
      if (p.z > EPS) run.push(c);
      else {
        run.push(c);
        runs.push(run);
        run = [];
      }
    }
    if (p.z > EPS) run.push(p);
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length >= 2);
}

/** The polygon `pts` cut to the half space above the ground (Sutherland and Hodgman, one plane). */
export function clipPoly(pts: readonly P[]): P[] {
  const out: P[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const ain = a.z > -EPS;
    const bin = b.z > -EPS;
    if (ain) out.push(a);
    if (ain !== bin) {
      const f = (0 - a.z) / (b.z - a.z);
      out.push({ x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y), z: 0 });
    }
  }
  // a face on the ground is the reach ring's: nothing of it stays
  return out.length >= 3 && out.some((p) => p.z > EPS) ? out : [];
}

function pointList(pts: readonly P[], pr: Pr): string {
  return pts
    .map((p) => {
      const s = pr(p);
      return r1(s[0]) + ',' + r1(s[1]);
    })
    .join(' ');
}

/** The az span: [a0, span] in radians, math angle (x east, y north), as the reach ring. */
function azOf(s: SystemRec): { full: boolean; a0: number; span: number } {
  const full = !(s.fov < 360);
  const span = full ? 2 * Math.PI : s.fov * D2R;
  return { full, a0: full ? 0 : (90 - s.bearing) * D2R - span / 2, span };
}

function elOf(s: SystemRec): { lo: number; hi: number } {
  return { lo: Math.max(-90, s.elMin), hi: Math.min(90, s.elMax) };
}

/** The point at azimuth `a` (math angle), elevation `el` (degrees) and slant range `r`. */
function at(s: SystemRec, a: number, el: number, r: number): P {
  const c = Math.cos(el * D2R);
  return {
    x: s.x + r * c * Math.cos(a),
    y: s.y + r * c * Math.sin(a),
    z: s.z + r * Math.sin(el * D2R),
  };
}

function arc(s: SystemRec, el: number, a0: number, span: number, n: number): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) out.push(at(s, a0 + (span * i) / n, el, s.range));
  return out;
}

function meridian(s: SystemRec, a: number, lo: number, hi: number, n: number): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) out.push(at(s, a, lo + ((hi - lo) * i) / n, s.range));
  return out;
}

/** The elevations with a cap arc: the limits inside the open sphere, and 30 and 60 between. */
export function capElevations(lo: number, hi: number): number[] {
  const out: number[] = [];
  if (lo > -90) out.push(lo);
  for (const e of [30, 60]) if (e > lo && e < hi) out.push(e);
  if (hi < 90 && hi > lo) out.push(hi);
  return out;
}

/** The horizontal radius where the lower limit meets the ground, or null when it never does. */
export function footprintEdge(s: SystemRec): number | null {
  const { lo } = elOf(s);
  if (!(s.z > 0) || !(lo < 0) || lo <= -90) return null;
  const slant = s.z / Math.sin(-lo * D2R);
  if (slant >= s.range) return null;
  const rg = slant * Math.cos(lo * D2R);
  return rg > 0 ? rg : null;
}

function kindClass(s: SystemRec): string {
  return isSensor(s.kind)
    ? 'cov-sensor'
    : s.kind === 'ew' || s.kind === 'de'
      ? 'cov-ew'
      : 'cov-eff';
}

/** The height the 3D drawing is cut at: the Elevation frame top (1.2 of 1.3 maxZ, 150 m least). */
export function ceilingOf(scene: Ctx['scene']): number {
  return 1.2 * Math.max(1.3 * maxZOf(scene), 150);
}

function draw3d(ctx: Ctx, s: SystemRec, pr: Pr): string {
  const S = ctx.S;
  const { full, a0, span } = azOf(s);
  const { lo, hi } = elOf(s);
  if (!(hi > lo)) return '';
  const nArc = full ? 48 : Math.max(12, Math.round((48 * span) / (2 * Math.PI)));
  const nMer = 16;
  const apex: P = { x: s.x, y: s.y, z: s.z };
  const top = ceilingOf(ctx.scene);
  const flip = (p: P): P => ({ x: p.x, y: p.y, z: top - p.z });
  let faces = '';
  let edges = '';
  // every face and edge is cut at the ground and at the ceiling
  const face = (pts: readonly P[]) => {
    const c = clipPoly(clipPoly(pts).map(flip)).map(flip);
    if (c.length) faces += S('polygon', { points: pointList(c, pr), class: 'face' });
  };
  const edge = (pts: readonly P[], cls: string) => {
    for (const run of clipRuns(pts))
      for (const cut of clipRuns(run.map(flip)))
        edges += S('polyline', { points: pointList(cut.map(flip), pr), class: cls });
  };
  const ring = (r: number, z: number, cls: string) => {
    const pts: P[] = [];
    for (let i = 0; i <= nArc; i++) {
      const a = a0 + (span * i) / nArc;
      pts.push({ x: s.x + r * Math.cos(a), y: s.y + r * Math.sin(a), z });
    }
    edge(pts, cls);
  };
  // faces: the lower and upper cones, the azimuth sides and the cap of a sector
  if (lo > -90) face([apex, ...arc(s, lo, a0, span, nArc)]);
  if (hi < 90) face([apex, ...arc(s, hi, a0, span, nArc)]);
  if (!full) {
    face([apex, ...meridian(s, a0, lo, hi, nMer)]);
    face([apex, ...meridian(s, a0 + span, lo, hi, nMer)]);
    face([...arc(s, lo, a0, span, nArc), ...arc(s, hi, a0, span, nArc).reverse()]);
  }
  // edges: the cap arcs, then the meridians with their limit rays
  for (const el of capElevations(lo, hi)) edge(arc(s, el, a0, span, nArc), 'edge');
  const azs = full ? [0, Math.PI / 2, Math.PI, 1.5 * Math.PI] : [a0, a0 + span];
  for (const a of azs) {
    edge(meridian(s, a, lo, hi, nMer), 'edge');
    if (lo > -90) edge([apex, at(s, a, lo, s.range)], 'edge');
    if (hi < 90) edge([apex, at(s, a, hi, s.range)], 'edge');
  }
  if (!full) edge([apex, at(s, a0 + span / 2, (lo + hi) / 2, s.range)], 'axis');
  const rg = footprintEdge(s);
  if (rg != null) ring(rg, EPS * 2, 'ground');
  // the cut at the ceiling: the volume's outer and inner horizontal reach at that height
  const dz = top - s.z;
  if (dz > 0 && dz < s.range && dz <= s.range * Math.sin(hi * D2R)) {
    let rOut = Math.sqrt(s.range * s.range - dz * dz);
    if (lo > 0) rOut = Math.min(rOut, dz / Math.tan(lo * D2R));
    const rIn = hi < 90 ? dz / Math.tan(hi * D2R) : 0;
    if (rOut > rIn) {
      ring(rOut, top - EPS * 2, 'ground');
      if (rIn > 0) ring(rIn, top - EPS * 2, 'ground');
    }
  }
  return faces + edges;
}

function drawElev(ctx: Ctx, s: SystemRec, cam: Cam): string {
  const S = ctx.S;
  const { lo, hi } = elOf(s);
  if (!(hi > lo) || (lo <= -90 && hi >= 90)) return '';
  const o = cam.origin;
  const rs = Math.hypot(s.x - o.x, s.y - o.y);
  const zs = s.z || 0;
  // the band in the r, z plane as the limit rays: x carries r, z the height
  const pr: Pr = (p) => cam.projectRZ!(p.x, p.z);
  const ray = (el: number): P => ({
    x: rs + s.range * Math.cos(el * D2R),
    y: 0,
    z: zs + s.range * Math.sin(el * D2R),
  });
  const apex: P = { x: rs, y: 0, z: zs };
  const pts: P[] = [apex];
  const n = 24;
  for (let i = 0; i <= n; i++) pts.push(ray(lo + ((hi - lo) * i) / n));
  let out = '';
  // cut at the ground and at the frame top (1.2 maxZ, as the slant arc of the reach layer)
  const top = cam.maxZ! * 1.2;
  const flip = (p: P): P => ({ x: p.x, y: p.y, z: top - p.z });
  const c = clipPoly(clipPoly(pts).map(flip)).map(flip);
  if (c.length) out += S('polygon', { points: pointList(c, pr), class: 'face' });
  if (s.fov < 360)
    for (const run of clipRuns(clipRuns([apex, ray((lo + hi) / 2)]).flatMap((r) => r.map(flip))))
      out += S('polyline', { points: pointList(run.map(flip), pr), class: 'axis' });
  return out;
}

function drawPlan(ctx: Ctx, s: SystemRec, cam: Cam): string {
  const S = ctx.S;
  const { full, a0, span } = azOf(s);
  let out = '';
  if (!full) {
    const a = a0 + span / 2;
    const p0 = cam.project(s.x, s.y, 0);
    const p1 = cam.project(s.x + s.range * Math.cos(a), s.y + s.range * Math.sin(a), 0);
    out += S('line', {
      x1: r1(p0[0]),
      y1: r1(p0[1]),
      x2: r1(p1[0]),
      y2: r1(p1[1]),
      class: 'axis',
    });
  }
  const rg = footprintEdge(s);
  if (rg != null) {
    const ce = cam.project(s.x, s.y, 0);
    const R = rg * cam.scale;
    if (full) out += S('circle', { cx: r1(ce[0]), cy: r1(ce[1]), r: r1(R), class: 'ground' });
    else {
      const pts: string[] = [];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (span * i) / n;
        pts.push(r1(ce[0] + R * Math.cos(a)) + ',' + r1(ce[1] - R * Math.sin(a)));
      }
      out += S('polyline', { points: pts.join(' '), class: 'ground' });
    }
  }
  return out;
}

register({
  id: 'coverage',
  label: 'Coverage',
  order: 29,
  chip: null,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'profile', 'derived', 'cam', 't', 'sel', 'hover', 'focus', 'layers', 'thumb'],
  draw(ctx) {
    if (ctx.layers.reach === false) return '';
    const S = ctx.S;
    const cam = ctx.cam;
    let out = '';
    for (const s of ctx.scene.systems || []) {
      if (!(s.range > 0)) continue;
      let inner: string;
      if (cam.kind === 'axon') inner = draw3d(ctx, s, (p) => cam.project(p.x, p.y, p.z));
      else if (cam.kind === 'elev') inner = drawElev(ctx, s, cam);
      else inner = drawPlan(ctx, s, cam);
      if (!inner) continue;
      out += S(
        'g',
        {
          class:
            'cov ' +
            kindClass(s) +
            (active(ctx, s) ? ' on' : '') +
            (s.status === 'inactive' ? ' off' : '') +
            ctx.cls(s.id) +
            ctx.dim(s.id),
          'data-k': 'coverage',
          'data-id': s.id,
        },
        inner,
      );
    }
    return out;
  },
});
