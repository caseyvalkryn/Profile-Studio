// Layer planes (legacy 43-layer-planes.js): height planes. Elevation draws a line at z; axon a
// square at z over the bounds. Legacy names stay (elev, axon): the port is literal.
import { poly } from '../cameras';
import { register } from '../layers';
import { r1 } from '../svg';

register({
  id: 'planes',
  label: 'Planes',
  order: 25,
  chip: null,
  defaultOn: true,
  cameras: ['elev', 'axon'],
  inputs: ['scene', 'cam', 'sel', 'hover', 'focus', 'thumb', 'profile'],
  draw(ctx) {
    const S = ctx.S;
    const cam = ctx.cam;
    let out = '';
    if (cam.kind !== 'elev' && cam.kind !== 'axon') return '';
    for (const p of ctx.scene.planes || []) {
      const c = 'plane' + ctx.cls(p.id) + ctx.dim(p.id);
      const at = { 'data-k': 'plane', 'data-id': p.id };
      let lp: number[];
      if (cam.kind === 'elev') {
        const a = cam.projectRZ!(0, p.z);
        const b = cam.projectRZ!(cam.maxR!, p.z);
        out += S(
          'line',
          Object.assign({ x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), class: c }, at),
        );
        ctx.hit({
          kind: 'plane',
          id: p.id,
          i: null,
          role: 'line',
          sx: a[0],
          sy: a[1],
          r: 0,
          seg: [a, b],
        });
        lp = [b[0] - 4, b[1] - 4];
      } else {
        const bd = cam.bounds!;
        const lo = bd.cx - bd.ext / 2;
        const hi = bd.cx + bd.ext / 2;
        const lo2 = bd.cy - bd.ext / 2;
        const hi2 = bd.cy + bd.ext / 2;
        out += S(
          'polygon',
          Object.assign(
            {
              points: poly(cam, [
                [lo, lo2, p.z],
                [hi, lo2, p.z],
                [hi, hi2, p.z],
                [lo, hi2, p.z],
              ]),
              class: c,
            },
            at,
          ),
        );
        const q = cam.project(lo, hi2, p.z);
        lp = [q[0] + 4, q[1] - 4];
      }
      if (!ctx.thumb && p.label) {
        const anchor = cam.kind === 'elev' ? 'end' : 'start';
        ctx.label({
          p: 5,
          id: p.id,
          box: ctx.sym.textBox(lp[0]!, lp[1]!, p.label, 11.5, anchor),
          svg: ctx.sym.label(lp[0]!, lp[1]!, p.label, 'pl' + ctx.dim(p.id), anchor),
        });
      }
    }
    return out;
  },
});
