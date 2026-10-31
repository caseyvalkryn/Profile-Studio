// Layer grid (legacy 43-layer-grid.js): grid, axes, compass, scale bar, range rings (chip 7
// "rings" reads ctx.layers.rings), axon hint. Legacy names stay (elev, axon): the port is literal.
import { poly } from '../cameras';
import { makeUnits, numOnly, type BoardUnits } from '../format';
import { gridStep } from '../geo';
import { register, type Ctx } from '../layers';
import { esc, r1 } from '../svg';

// the other unit system's horizontal text
function twinH(u: BoardUnits, m: number): string {
  return makeUnits(u.mode === 'si' ? 'nav' : 'si').h(m);
}

function ringRadii(u: BoardUnits) {
  const unit = u.mode === 'si' ? 1000 : u.NM;
  return [1, 2, 5, 10].map((n) => ({ m: n * unit, label: n + (u.mode === 'si' ? ' km' : ' nm') }));
}

function drawPlan(ctx: Ctx): string {
  const S = ctx.S;
  const cam = ctx.cam;
  let out = '';
  // visible world rectangle, union with the content square
  const a = cam.unproject(0, 0) as { x: number; y: number };
  const b = cam.unproject(cam.W, cam.H) as { x: number; y: number };
  const bd = cam.bounds!;
  const x0 = Math.min(a.x, b.x, bd.cx - bd.ext / 2);
  const x1 = Math.max(a.x, b.x, bd.cx + bd.ext / 2);
  const y0 = Math.min(a.y, b.y, bd.cy - bd.ext / 2);
  const y1 = Math.max(a.y, b.y, bd.cy + bd.ext / 2);
  let st = gridStep(bd.ext / (cam.zoom || 1));
  if ((x1 - x0) / st > 400) st = (x1 - x0) / 400;
  for (let g = Math.ceil(x0 / st) * st; g <= x1; g += st) {
    const p = cam.project(g, y0);
    const q = cam.project(g, y1);
    out += S('line', {
      x1: r1(p[0]),
      y1: r1(p[1]),
      x2: r1(q[0]),
      y2: r1(q[1]),
      class: Math.abs(g) < 1e-6 ? 'axis' : 'grid',
    });
  }
  for (let g = Math.ceil(y0 / st) * st; g <= y1; g += st) {
    const p = cam.project(x0, g);
    const q = cam.project(x1, g);
    out += S('line', {
      x1: r1(p[0]),
      y1: r1(p[1]),
      x2: r1(q[0]),
      y2: r1(q[1]),
      class: Math.abs(g) < 1e-6 ? 'axis' : 'grid',
    });
  }
  if (!ctx.thumb) {
    out += ctx.sym.compass(cam.W - 30, 34, 14, cam.north);
    const u = ctx.u;
    const visExt = bd.ext / (cam.zoom || 1);
    const bar = u.roundBar(visExt);
    out += ctx.sym.scaleBar(16, cam.H - 22, bar.m * cam.scale, bar.label, twinH(u, bar.m));
  }
  return out;
}

function drawElev(ctx: Ctx): string {
  const S = ctx.S;
  const cam = ctx.cam;
  const u = ctx.u;
  const ax = cam.axes;
  const f = cam.frame;
  let out = '';
  for (const t of ax.xTicks) {
    out += S('line', {
      x1: t.px,
      y1: r1(f.y0),
      x2: t.px,
      y2: r1(f.y1),
      class: t.v === 0 ? 'axis' : 'grid',
    });
    if (!ctx.thumb)
      out += S(
        'text',
        { x: t.px, y: r1(f.y1 + 14), class: 'tick', 'text-anchor': 'middle' },
        esc(numOnly(u.h(t.v))),
      );
  }
  for (const t of ax.yTicks) {
    out += S('line', {
      x1: r1(f.x0),
      y1: t.px,
      x2: r1(f.x1),
      y2: t.px,
      class: t.v === 0 ? 'axis' : 'grid',
    });
    if (!ctx.thumb)
      out += S(
        'text',
        { x: r1(f.x0 - 6), y: r1((t.px ?? 0) + 3.5), class: 'tick', 'text-anchor': 'end' },
        esc(numOnly(u.v(t.v))),
      );
  }
  if (!ctx.thumb) {
    const L = u.labels();
    const datum = (ctx.profile.site && ctx.profile.site.datum) || 'AGL';
    out += S(
      'text',
      { x: r1(f.x1), y: r1(cam.H - 6), class: 'axl', 'text-anchor': 'end' },
      esc(ax.xLabel + ', ' + L.h),
    );
    out += S('text', { x: 6, y: 14, class: 'axl' }, esc(ax.yLabel + ' ' + L.v + ' ' + datum));
  }
  return out;
}

function drawAxon(ctx: Ctx): string {
  const S = ctx.S;
  const cam = ctx.cam;
  const bd = cam.bounds!;
  let out = '';
  const lo = bd.cx - bd.ext / 2;
  const hi = bd.cx + bd.ext / 2;
  const lo2 = bd.cy - bd.ext / 2;
  const hi2 = bd.cy + bd.ext / 2;
  const st = gridStep(bd.ext);
  for (let g = Math.ceil(lo / st) * st; g <= hi; g += st) {
    const a = cam.project(g, lo2, 0);
    const b = cam.project(g, hi2, 0);
    out += S('line', {
      x1: r1(a[0]),
      y1: r1(a[1]),
      x2: r1(b[0]),
      y2: r1(b[1]),
      class: Math.abs(g) < 1e-6 ? 'axis' : 'grid',
    });
  }
  for (let g = Math.ceil(lo2 / st) * st; g <= hi2; g += st) {
    const a = cam.project(lo, g, 0);
    const b = cam.project(hi, g, 0);
    out += S('line', {
      x1: r1(a[0]),
      y1: r1(a[1]),
      x2: r1(b[0]),
      y2: r1(b[1]),
      class: Math.abs(g) < 1e-6 ? 'axis' : 'grid',
    });
  }
  if (!ctx.thumb) {
    out += ctx.sym.compass(cam.W - 30, 34, 14, cam.north);
    if (cam.hint) out += S('text', { x: 16, y: r1(cam.H - 10), class: 'hint' }, esc(cam.hint));
  }
  return out;
}

function drawRings(ctx: Ctx): string {
  const S = ctx.S;
  const cam = ctx.cam;
  const o = cam.kind === 'elev' ? cam.origin : ctx.origin;
  let out = '';
  for (const rr of ringRadii(ctx.u)) {
    let lab: number[];
    if (cam.kind === 'plan') {
      const c = cam.project(o.x, o.y, 0);
      const r = rr.m * cam.scale;
      out += S('circle', { cx: r1(c[0]), cy: r1(c[1]), r: r1(r), class: 'rring' });
      lab = [c[0] + r * 0.707 + 2, c[1] - r * 0.707 - 2];
    } else if (cam.kind === 'axon') {
      const pts: number[][] = [];
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * 2 * Math.PI;
        pts.push([o.x + rr.m * Math.cos(a), o.y + rr.m * Math.sin(a), 0]);
      }
      out += S('polyline', { points: poly(cam, pts), class: 'rring' });
      const e = cam.project(o.x + rr.m, o.y, 0);
      lab = [e[0] + 2, e[1] - 2];
    } else {
      if (rr.m > cam.maxR!) continue;
      const p = cam.projectRZ!(rr.m, 0);
      const q = cam.projectRZ!(rr.m, cam.maxZ!);
      out += S('line', { x1: r1(p[0]), y1: r1(p[1]), x2: r1(q[0]), y2: r1(q[1]), class: 'rring' });
      lab = [q[0] + 2, q[1] + 10];
    }
    if (!ctx.thumb)
      out += S('text', { x: r1(lab[0]!), y: r1(lab[1]!), class: 'lbl small ghostink' }, rr.label);
  }
  return out;
}

register({
  id: 'grid',
  label: 'Grid',
  order: 10,
  chip: null,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['cam', 'layers', 'units', 'thumb', 'profile', 'origin'],
  draw(ctx) {
    let out =
      ctx.cam.kind === 'plan'
        ? drawPlan(ctx)
        : ctx.cam.kind === 'elev'
          ? drawElev(ctx)
          : drawAxon(ctx);
    if (ctx.layers.rings) out += drawRings(ctx);
    return out;
  },
});

// chip 7: drawn above by the grid layer; this entry gives the layer bar its chip
register({
  id: 'rings',
  label: 'Rings',
  order: 11,
  chip: 7,
  defaultOn: false,
  cameras: ['plan', 'elev', 'axon'],
  inputs: [],
  draw: () => '',
});
