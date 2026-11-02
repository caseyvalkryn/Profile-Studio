// Layer volumes (legacy 43-layer-volumes.js): defended asset, engagement zone, no fly volume,
// reference pattern, range area. Range areas draw first so a site boundary sits under the rest. Legacy names stay (volumes for areas, elev, axon): the port is literal.
import { poly } from '../cameras';
import { register } from '../layers';
import { r1 } from '../svg';

function centroid(pts: readonly (readonly number[])[]): [number, number] {
  let x = 0;
  let y = 0;
  for (const q of pts) {
    x += q[0]!;
    y += q[1]!;
  }
  return [x / pts.length, y / pts.length];
}

function inside(pt: number[], pts: readonly (readonly number[])[]): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (
      a[1]! > pt[1]! !== b[1]! > pt[1]! &&
      pt[0]! < ((b[0]! - a[0]!) * (pt[1]! - a[1]!)) / (b[1]! - a[1]!) + a[0]!
    )
      c = !c;
  }
  return c;
}

// nearest and farthest horizontal distance of the footprint from o
function rSpan(pts: readonly (readonly number[])[], o: { x: number; y: number }): [number, number] {
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    hi = Math.max(hi, Math.hypot(a[0]! - o.x, a[1]! - o.y));
    const dx = b[0]! - a[0]!;
    const dy = b[1]! - a[1]!;
    const L = dx * dx + dy * dy;
    const f = L > 0 ? Math.max(0, Math.min(1, ((o.x - a[0]!) * dx + (o.y - a[1]!) * dy) / L)) : 0;
    lo = Math.min(lo, Math.hypot(a[0]! + f * dx - o.x, a[1]! + f * dy - o.y));
  }
  if (inside([o.x, o.y], pts)) lo = 0;
  return [lo, hi];
}

register({
  id: 'volumes',
  label: 'Volumes',
  order: 20,
  chip: null,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'cam', 'sel', 'hover', 'focus', 'thumb', 'profile'],
  draw(ctx) {
    const S = ctx.S;
    const cam = ctx.cam;
    let out = '';
    const vols = ctx.scene.volumes || [];
    // stable: record order holds within each group
    const ordered = [
      ...vols.filter((v) => v.kind === 'range'),
      ...vols.filter((v) => v.kind !== 'range'),
    ];
    for (const v of ordered) {
      if (!v.pts || v.pts.length < 2) continue;
      const c = 'vol vol-' + v.kind + ctx.cls(v.id) + ctx.dim(v.id);
      const at = { 'data-k': 'volume', 'data-id': v.id };
      let lp: number[];
      if (cam.kind === 'plan') {
        const spts = v.pts.map((q) => cam.project(q[0], q[1], 0));
        out += S('polygon', Object.assign({ points: poly(cam, v.pts), class: c }, at));
        ctx.hit({
          kind: 'volume',
          id: v.id,
          i: null,
          role: null,
          sx: spts[0]![0],
          sy: spts[0]![1],
          r: 0,
          poly: spts,
        });
        if (v.kind === 'asset' && !ctx.thumb) {
          const ce = centroid(v.pts);
          const cs = cam.project(ce[0], ce[1], 0);
          out += S(
            'g',
            Object.assign({ class: 'vsym' + ctx.dim(v.id) }, at),
            ctx.sym.groundFrame('asset', 'active', cs[0], cs[1]),
          );
        }
        lp = spts[0]!;
      } else if (cam.kind === 'elev') {
        const rs = rSpan(v.pts, cam.origin);
        const z0 = v.zmin || 0;
        const z1 = v.zmax || 0;
        const a = cam.projectRZ!(rs[0], z1 > z0 ? z1 : z0);
        const b = cam.projectRZ!(rs[1], z0);
        if (z1 > z0) {
          out += S(
            'rect',
            Object.assign(
              {
                x: r1(a[0]),
                y: r1(a[1]),
                width: r1(Math.max(1, b[0] - a[0])),
                height: r1(Math.max(1, b[1] - a[1])),
                class: c,
              },
              at,
            ),
          );
        } else {
          out += S(
            'line',
            Object.assign(
              { x1: r1(a[0]), y1: r1(b[1]), x2: r1(b[0]), y2: r1(b[1]), class: c + ' flat' },
              at,
            ),
          );
        }
        ctx.hit({
          kind: 'volume',
          id: v.id,
          i: null,
          role: null,
          sx: a[0],
          sy: a[1],
          r: 0,
          poly: [
            [a[0], a[1]],
            [b[0], a[1]],
            [b[0], b[1]],
            [a[0], b[1]],
          ],
        });
        lp = [a[0], a[1]];
      } else {
        const zb = v.zmin || 0;
        out += S(
          'polygon',
          Object.assign(
            {
              points: poly(
                cam,
                v.pts.map((q) => [q[0], q[1], zb]),
              ),
              class: c,
            },
            at,
          ),
        );
        if (v.zmax > zb) {
          out += S(
            'polygon',
            Object.assign(
              {
                points: poly(
                  cam,
                  v.pts.map((q) => [q[0], q[1], v.zmax]),
                ),
                class: c,
              },
              at,
            ),
          );
          for (const q of v.pts) {
            const p0 = cam.project(q[0], q[1], zb);
            const p1 = cam.project(q[0], q[1], v.zmax);
            out += S('line', {
              x1: r1(p0[0]),
              y1: r1(p0[1]),
              x2: r1(p1[0]),
              y2: r1(p1[1]),
              class: c + ' edge',
            });
          }
        }
        if (v.kind === 'asset' && !ctx.thumb) {
          const ca = centroid(v.pts);
          const cp = cam.project(ca[0], ca[1], 0);
          out += S(
            'g',
            Object.assign({ class: 'vsym' + ctx.dim(v.id) }, at),
            ctx.sym.groundFrame('asset', 'active', cp[0], cp[1]),
          );
        }
        lp = cam.project(v.pts[0]![0], v.pts[0]![1], v.zmax || 0);
      }
      if (!ctx.thumb && v.label) {
        const x = lp[0]! + 4;
        const y = lp[1]! - 4;
        ctx.label({
          p: 5,
          id: v.id,
          box: ctx.sym.textBox(x, y, v.label, 11.5),
          svg: ctx.sym.label(x, y, v.label, 'vl' + ctx.dim(v.id)),
        });
      }
    }
    return out;
  },
});
