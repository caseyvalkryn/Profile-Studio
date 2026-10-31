// Layer systems (legacy 43-layer-systems.js): ground frames by kind, status marks, selection
// ring, system id labels. Legacy "systems" are the sensors, effectors and nodes.
import { register } from '../layers';
import { r1 } from '../svg';

register({
  id: 'systems',
  label: 'Systems',
  order: 40,
  chip: null,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'cam', 'sel', 'hover', 'focus', 'thumb'],
  draw(ctx) {
    const S = ctx.S;
    const cam = ctx.cam;
    let out = '';
    for (const s of ctx.scene.systems || []) {
      const p = cam.project(s.x, s.y, cam.kind === 'plan' ? 0 : s.z || 0);
      let inner = '';
      if (cam.kind === 'axon' && s.z > 0) {
        const g = cam.project(s.x, s.y, 0);
        inner += S('line', {
          x1: r1(g[0]),
          y1: r1(g[1]),
          x2: r1(p[0]),
          y2: r1(p[1]),
          class: 'drop',
        });
      }
      const c = ctx.cls(s.id);
      if (c) inner += S('circle', { cx: r1(p[0]), cy: r1(p[1]), r: 11, class: 'selring' + c });
      if (ctx.thumb) {
        inner += S('circle', { cx: r1(p[0]), cy: r1(p[1]), r: 2.5, class: 'gfk gf-dot' });
      } else {
        inner += ctx.sym.groundFrame(s.kind, s.status, p[0], p[1]);
      }
      out += S(
        'g',
        {
          class: 'sys' + c + ctx.dim(s.id),
          'data-k': 'system',
          'data-id': s.id,
          'data-role': 'centre',
        },
        inner,
      );
      ctx.hit({
        kind: 'system',
        id: s.id,
        i: null,
        role: 'centre',
        sx: p[0],
        sy: p[1],
        r: 7,
        handle: true,
      });
      if (!ctx.thumb) {
        const x = p[0] + 10;
        const y = p[1] + 14;
        ctx.label({
          p: 4,
          id: s.id,
          box: ctx.sym.textBox(x, y, s.id, 11.5),
          svg: ctx.sym.label(x, y, s.id, 'sl lid' + ctx.dim(s.id)),
        });
      }
    }
    return out;
  },
});
