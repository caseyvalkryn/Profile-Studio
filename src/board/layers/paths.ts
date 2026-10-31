// Layer paths (legacy 43-layer-paths.js): planned routes in the identity ink, hold rings,
// waypoint dots, one-point warning. Legacy "paths" are the threat routes.
import type { TimedPoint } from '../../engine/geo';
import { poly, type Cam } from '../cameras';
import { register, type Ctx } from '../layers';
import { r1 } from '../svg';
import type { PathRec } from '../types';

function timedOf(ctx: Ctx, p: PathRec): TimedPoint[] {
  const t = ctx.derived.timed && ctx.derived.timed[p.id];
  if (t && t.length) return t;
  return (p.pts || []).map((q) => ({ x: q.x, y: q.y, z: q.z || 0, t0: 0, t1: q.hold || 0 }));
}

// screen points of the route; elevation subdivides legs because range from the origin is not linear
function routePts(cam: Cam, w: TimedPoint[]): [number, number][] {
  const out: [number, number][] = [];
  w.forEach((q, i) => {
    if (cam.kind === 'elev' && i > 0) {
      const a = w[i - 1]!;
      const n = 12;
      for (let k = 1; k < n; k++) {
        const f = k / n;
        out.push(cam.project(a.x + (q.x - a.x) * f, a.y + (q.y - a.y) * f, a.z + (q.z - a.z) * f));
      }
    }
    out.push(cam.project(q.x, q.y, cam.kind === 'plan' ? 0 : q.z));
  });
  return out;
}

function str(pts: number[][]): string {
  return pts.map((p) => r1(p[0]!) + ',' + r1(p[1]!)).join(' ');
}

register({
  id: 'paths',
  label: 'Paths',
  order: 60,
  chip: null,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'derived', 'cam', 'sel', 'hover', 'focus', 'thumb'],
  draw(ctx) {
    const S = ctx.S;
    const cam = ctx.cam;
    let out = '';
    const paths = ctx.scene.paths || [];
    for (const p of paths) {
      const w = timedOf(ctx, p);
      if (!w.length) continue;
      const selP = ctx.sel.kind === 'path' && ctx.sel.id === p.id;
      const wt = ctx.focus.indexOf(p.id) >= 0 ? ' w3' : selP || paths.length < 2 ? ' w2' : ' w1';
      const ink = ' id-' + (p.identity || 'hostile');
      const dim = ctx.dim(p.id);
      const spts = routePts(cam, w);
      let inner = '';
      if (cam.kind === 'axon') {
        inner += S('polyline', {
          points: poly(
            cam,
            w.map((q) => [q.x, q.y, 0]),
          ),
          class: 'shadow' + ink,
        });
        for (const q of w) {
          const a = cam.project(q.x, q.y, q.z);
          const b = cam.project(q.x, q.y, 0);
          inner += S('line', {
            x1: r1(a[0]),
            y1: r1(a[1]),
            x2: r1(b[0]),
            y2: r1(b[1]),
            class: 'drop',
          });
        }
      }
      if (spts.length > 1)
        inner += S('polyline', { points: str(spts), class: 'route' + ink + wt + ctx.cls(p.id) });
      for (const q of w) {
        const s = cam.project(q.x, q.y, cam.kind === 'plan' ? 0 : q.z);
        inner += S('circle', {
          cx: r1(s[0]),
          cy: r1(s[1]),
          r: ctx.thumb ? 1.2 : 1.8,
          class: 'wpd' + ink,
        });
        if (q.t1 > q.t0 && cam.kind === 'plan' && !ctx.thumb)
          inner += S('circle', { cx: r1(s[0]), cy: r1(s[1]), r: 8, class: 'holdring' + ink });
      }
      const s0 = spts[0]!;
      if (w.length === 1 && !ctx.thumb) inner += ctx.sym.warn(s0[0] + 12, s0[1] - 10);
      out += S('g', { class: 'path' + dim, 'data-k': 'path', 'data-id': p.id }, inner);
      ctx.hit({
        kind: 'path',
        id: p.id,
        i: null,
        role: null,
        sx: s0[0],
        sy: s0[1],
        r: 0,
        seg: spts,
      });
      if (!ctx.thumb) {
        const x = s0[0] + 6;
        const y = s0[1] + 14;
        ctx.label({
          p: 2,
          id: p.id,
          box: ctx.sym.textBox(x, y, p.id, 11.5),
          svg: ctx.sym.label(x, y, p.id, 'pid' + ink + dim),
        });
        if (selP || paths.length <= 2) {
          w.forEach((q, i) => {
            const s = cam.project(q.x, q.y, cam.kind === 'plan' ? 0 : q.z);
            const lx = s[0] + 6;
            const ly = s[1] - 6;
            const n = String(i + 1);
            ctx.label({
              p: 6,
              id: p.id,
              box: ctx.sym.textBox(lx, ly, n, 10),
              svg: ctx.sym.label(lx, ly, n, 'small wpn' + dim),
            });
          });
        }
      }
    }
    return out;
  },
});
