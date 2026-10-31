// Layer events (legacy 43-layer-events.js, chip 2): event beads with letter glyphs, warning
// triangles on early events, and first-see ticks per sensor and effector in the system ink.
// Legacy names stay (paths, systems, elev, axon).
import { posAt, type TimedPoint } from '../../engine/geo';
import { EFFECTOR_KINDS, SENSOR_KINDS } from '../../domain/catalog';
import type { Cam } from '../cameras';
import { register } from '../layers';
import { esc, r1 } from '../svg';

/** Legacy C.EV_TYPES: the bead letter per legacy event type. */
export const EV_TYPES: Record<string, string> = {
  detect: 'D',
  track: 'T',
  id: 'I',
  engage: 'E',
  split: 'S',
  merge: 'M',
  loiter: 'L',
  terminal: 'X',
  checkpoint: 'C',
};

function sysInk(kind: string): string {
  if (kind === 'ew') return 'ink-ew';
  return (SENSOR_KINDS as readonly string[]).indexOf(kind) >= 0 ? 'ink-sensor' : 'ink-eff';
}

function zOf(cam: Cam, v: number | undefined): number {
  return cam.kind === 'plan' ? 0 : v || 0;
}

// unit screen direction of travel at time t, else null
function screenDir(cam: Cam, w: TimedPoint[], t: number): [number, number] | null {
  const q = posAt(w, t);
  const hx = q.hx || 0;
  const hy = q.hy || 0;
  if (!hx && !hy) return null;
  const a = cam.project(q.x, q.y, zOf(cam, q.z));
  const b = cam.project(q.x + hx * 20, q.y + hy * 20, zOf(cam, q.z));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  return L > 1e-6 ? [dx / L, dy / L] : null;
}

register({
  id: 'events',
  order: 70,
  chip: 2,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'profile', 'derived', 'cam', 'sel', 'hover', 'focus', 'thumb'],
  draw(ctx) {
    const S = ctx.S;
    const cam = ctx.cam;
    const d = ctx.derived;
    let out = '';
    const see = (SENSOR_KINDS as readonly string[]).concat(EFFECTOR_KINDS as readonly string[]);
    const warnBy: Record<string, true> = {};
    for (const w of d.warnings || []) if (w.eventId) warnBy[w.eventId] = true;

    // first-see ticks
    if (!ctx.thumb) {
      for (const p of ctx.scene.paths || []) {
        const w = d.timed && d.timed[p.id];
        const f = d.first && d.first[p.id];
        if (!w || !w.length || !f) continue;
        for (const s of ctx.scene.systems || []) {
          if (see.length && see.indexOf(s.kind) < 0) continue;
          const fs = f[s.id];
          if (!fs || fs.t == null) continue;
          const pos = fs.pos || posAt(w, fs.t);
          const c = cam.project(pos.x, pos.y, zOf(cam, pos.z));
          const dir = screenDir(cam, w, fs.t) || [1, 0];
          const nx = -dir[1] * 6;
          const ny = dir[0] * 6;
          const ink = sysInk(s.kind);
          const dim = ctx.dim(p.id);
          out += S('line', {
            x1: r1(c[0] - nx),
            y1: r1(c[1] - ny),
            x2: r1(c[0] + nx),
            y2: r1(c[1] + ny),
            class: 'fst ' + ink + dim,
          });
          const lx = c[0] + nx * 1.4 + 2;
          const ly = c[1] + ny * 1.4 + 3;
          ctx.label({
            p: 4.5,
            id: s.id,
            box: ctx.sym.textBox(lx, ly, s.id, 10),
            svg: ctx.sym.label(lx, ly, s.id, 'small fstx lid ' + ink + dim),
          });
        }
      }
    }

    // beads
    for (const e of ctx.profile.events || []) {
      const w = d.timed && d.timed[e.path];
      if (!w || !w.length || e.t == null) continue;
      const q = posAt(w, e.t);
      const c = cam.project(q.x, q.y, zOf(cam, q.z));
      const cls = ctx.cls(e.id) || (ctx.focus.indexOf(e.id) >= 0 ? ' sel' : '');
      const dim = ctx.dim(e.id);
      const r = ctx.thumb ? 3 : 6;
      let inner = S('circle', { cx: r1(c[0]), cy: r1(c[1]), r, class: 'bead' });
      if (!ctx.thumb)
        inner += S(
          'text',
          { x: r1(c[0]), y: r1(c[1] + 3), class: 'beadtx' },
          esc(EV_TYPES[e.type] || '?'),
        );
      if (warnBy[e.id] && !ctx.thumb) inner += ctx.sym.warn(c[0] + 9, c[1] - 9);
      out += S(
        'g',
        {
          class: 'ev' + cls + dim + (warnBy[e.id] ? ' warned' : ''),
          'data-k': 'event',
          'data-id': e.id,
          'data-role': 'bead',
        },
        inner,
      );
      ctx.hit({
        kind: 'event',
        id: e.id,
        i: null,
        role: 'bead',
        sx: c[0],
        sy: c[1],
        r,
        handle: true,
      });
      if (!ctx.thumb && e.label) {
        const lx = c[0] + 10;
        const ly = c[1] + 14;
        ctx.label({
          p: 3,
          id: e.id,
          box: ctx.sym.textBox(lx, ly, e.label, 11.5),
          svg: ctx.sym.label(lx, ly, e.label, 'evl' + dim),
        });
      }
    }
    return out;
  },
});
