// Layer reach (legacy 43-layer-reach.js, chip 1): sensor and effector rings. Dashed at rest;
// solid with a tint while covering at t. Elevation: slant range arc from (r of the system,
// system z) and the elevation limit rays. Legacy names stay (systems, elev, axon).
import { poly, type Cam } from '../cameras';
import { register, type Ctx } from '../layers';
import { isSensorKind as isSensor } from '../scene';
import { r1 } from '../svg';
import type { SystemRec } from '../types';

const D2R = Math.PI / 180;

function active(ctx: Ctx, s: SystemRec): boolean {
  if (ctx.t == null || s.status === 'inactive' || typeof ctx.derived.holdsAt !== 'function')
    return false;
  const t = ctx.t;
  const held = ctx.derived.holdsAt(s.id, t) || [];
  if (!held.length) return false;
  if (isSensor(s.kind)) return true;
  return (ctx.profile.events || []).some(
    (e) =>
      e.type === 'engage' &&
      e.t <= t &&
      held.indexOf(e.path) >= 0 &&
      (e.system === s.id || e.system == null),
  );
}

function ringClass(ctx: Ctx, s: SystemRec, on: boolean): string {
  return (
    'ring ' +
    (isSensor(s.kind) ? 'rg-sensor' : s.kind === 'ew' ? 'rg-ew' : 'rg-eff') +
    (on ? ' on' : '') +
    (s.status === 'inactive' ? ' off' : '') +
    ctx.cls(s.id) +
    ctx.dim(s.id)
  );
}

// plan ring or sector path in screen px
function planShape(c: number[], R: number, s: SystemRec): string | null {
  if (!(s.fov < 360)) return null;
  const a0 = (90 - s.bearing - s.fov / 2) * D2R;
  const a1 = (90 - s.bearing + s.fov / 2) * D2R;
  return (
    'M' +
    r1(c[0]!) +
    ',' +
    r1(c[1]!) +
    ' L' +
    r1(c[0]! + R * Math.cos(a1)) +
    ',' +
    r1(c[1]! - R * Math.sin(a1)) +
    ' A' +
    r1(R) +
    ',' +
    r1(R) +
    ' 0 ' +
    (s.fov > 180 ? 1 : 0) +
    ' 1 ' +
    r1(c[0]! + R * Math.cos(a0)) +
    ',' +
    r1(c[1]! - R * Math.sin(a0)) +
    ' Z'
  );
}

function elevArc(cam: Cam, rs: number, zs: number, R: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (-90 + (180 * i) / 48) * D2R;
    const z = zs + R * Math.sin(a);
    if (z < 0 || z > cam.maxZ! * 1.2) continue;
    const p = cam.projectRZ!(rs + R * Math.cos(a), z);
    pts.push(r1(p[0]) + ',' + r1(p[1]));
  }
  return pts.join(' ');
}

register({
  id: 'reach',
  order: 30,
  chip: 1,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'profile', 'derived', 'cam', 't', 'sel', 'hover', 'focus', 'thumb'],
  draw(ctx) {
    const S = ctx.S;
    const cam = ctx.cam;
    let out = '';
    for (const s of ctx.scene.systems || []) {
      if (!(s.range > 0)) continue;
      const on = active(ctx, s);
      const c = ringClass(ctx, s, on);
      const at = { 'data-k': 'system', 'data-id': s.id };
      let top: number[] | null;
      if (cam.kind === 'plan') {
        const ce = cam.project(s.x, s.y, 0);
        const R = s.range * cam.scale;
        const d = planShape(ce, R, s);
        if (d) out += S('path', Object.assign({ d, class: c }, at));
        else
          out += S(
            'circle',
            Object.assign({ cx: r1(ce[0]), cy: r1(ce[1]), r: r1(R), class: c }, at),
          );
        if (s.rmin > 0)
          out += S(
            'circle',
            Object.assign(
              { cx: r1(ce[0]), cy: r1(ce[1]), r: r1(s.rmin * cam.scale), class: c + ' rmin' },
              at,
            ),
          );
        top = [ce[0], ce[1] - R - 4];
      } else if (cam.kind === 'elev') {
        const o = cam.origin;
        const rs = Math.hypot(s.x - o.x, s.y - o.y);
        const zs = s.z || 0;
        const arc = elevArc(cam, rs, zs, s.range);
        if (arc) out += S('polyline', Object.assign({ points: arc, class: c }, at));
        if (s.rmin > 0) {
          const inner = elevArc(cam, rs, zs, s.rmin);
          if (inner) out += S('polyline', Object.assign({ points: inner, class: c + ' rmin' }, at));
        }
        if (s.elMin > -90 || s.elMax < 90) {
          const c0 = cam.projectRZ!(rs, zs);
          [s.elMin, s.elMax].forEach((el, i) => {
            if ((i === 0 && el <= -90) || (i === 1 && el >= 90)) return;
            const e = cam.projectRZ!(
              rs + s.range * Math.cos(el * D2R),
              zs + s.range * Math.sin(el * D2R),
            );
            out += S(
              'line',
              Object.assign(
                {
                  x1: r1(c0[0]),
                  y1: r1(c0[1]),
                  x2: r1(e[0]),
                  y2: r1(e[1]),
                  class: 'elray' + ctx.dim(s.id),
                },
                at,
              ),
            );
          });
        }
        const tp = cam.projectRZ!(rs, Math.min(cam.maxZ!, zs + s.range));
        top = [tp[0], tp[1] - 4];
      } else {
        const full = !(s.fov < 360);
        const n = 64;
        const span = full ? 2 * Math.PI : s.fov * D2R;
        const a0 = full ? 0 : (90 - s.bearing) * D2R - span / 2;
        let pts: number[][] = [];
        for (let i = 0; i <= n; i++) {
          const a = a0 + (span * i) / n;
          pts.push([s.x + s.range * Math.cos(a), s.y + s.range * Math.sin(a), 0]);
        }
        if (!full) pts = [[s.x, s.y, 0]].concat(pts, [[s.x, s.y, 0]]);
        out += S('polyline', Object.assign({ points: poly(cam, pts), class: c }, at));
        top = null;
      }
      if (top && !ctx.thumb && !isSensor(s.kind)) {
        ctx.label({
          p: 3,
          id: s.id,
          box: ctx.sym.textBox(top[0]!, top[1]!, 'MAX RG', 10, 'middle'),
          svg: ctx.sym.label(top[0]!, top[1]!, 'MAX RG', 'small mr' + ctx.dim(s.id), 'middle'),
        });
      }
    }
    return out;
  },
});
