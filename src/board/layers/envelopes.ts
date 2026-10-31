// Layer envelopes (legacy 43-layer-envelopes.js, chip 3): one hull per link cluster at t, or at
// each profile snapshot when t is null. Legacy names stay (axon for the 3D camera).
import { register } from '../layers';
import { r1 } from '../svg';

function xy(q: [number, number] | { x: number; y: number }): [number, number] {
  return Array.isArray(q) ? q : [q.x, q.y];
}

register({
  id: 'envelopes',
  order: 50,
  chip: 3,
  defaultOn: true,
  cameras: ['plan', 'axon'],
  inputs: ['profile', 'derived', 'cam', 't', 'sel', 'hover', 'focus', 'thumb', 'units'],
  draw(ctx) {
    const S = ctx.S;
    const cam = ctx.cam;
    const d = ctx.derived;
    let out = '';
    const envelopesAt = d.envelopesAt;
    if (cam.kind === 'elev' || typeof envelopesAt !== 'function') return '';
    const times = ctx.t != null ? [ctx.t] : ctx.profile.snapshots || [];
    for (const t of times) {
      for (const env of envelopesAt(t) || []) {
        const hull = (env.hull || []).map(xy);
        if (!hull.length) continue;
        const members = env.members || [];
        const gid =
          (d.groupOf && members.length && d.groupOf[members[0]!]) || members[0] || 'group';
        const dim = members.length && members.every((m) => ctx.dim(m)) ? ' dim' : '';
        const c = 'hull' + ctx.cls(gid) + dim + (hull.length < 3 ? ' thin' : '');
        const spts = hull.map((q) => cam.project(q[0], q[1], 0));
        const pts = spts.map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ');
        out += S(hull.length < 3 ? 'polyline' : 'polygon', {
          points: pts,
          class: c,
          'data-k': 'group',
          'data-id': gid,
        });
        if (hull.length >= 3)
          ctx.hit({
            kind: 'group',
            id: gid,
            i: null,
            role: null,
            sx: spts[0]![0],
            sy: spts[0]![1],
            r: 0,
            poly: spts,
          });
        if (!ctx.thumb && ctx.t == null) {
          const top = spts.reduce((a, b) => (b[1] < a[1] ? b : a));
          const text = ctx.u.t(t);
          ctx.label({
            p: 5,
            id: gid,
            box: ctx.sym.textBox(top[0], top[1] - 6, text, 10, 'middle'),
            svg: ctx.sym.label(top[0], top[1] - 6, text, 'small hl' + dim, 'middle'),
          });
        }
      }
    }
    return out;
  },
});
