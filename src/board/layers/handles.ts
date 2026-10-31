// Layer handles (legacy 43-layer-handles.js; edit only, plan and elev): handles of the selected
// object (sel.i filled), the pre-drag ghost record at 32 percent, the ruler, the placement ghost
// and the formation member ghost. Legacy names stay (paths, systems, volumes, aircraft, elev).
// One change: legacy ghostRecord ran PS.derive.all on the ghost; the board does not derive, so the
// ghost carries its own timed points (ghost.derived.timed) or falls back to its waypoints.
import { archetypeById } from '../../domain/catalog';
import { bearingTo, posAt, type Pt3 } from '../../engine/geo';
import { poly, type Cam } from '../cameras';
import { fmtN, numOnly } from '../format';
import { formationPoints, segmentPoint } from '../geo';
import { register, type Ctx, type RulerEnd } from '../layers';
import type { HandleExtra } from '../symbols';
import { esc, r1 } from '../svg';
import type { PathRec, SystemRec, VolumeRec } from '../types';

const D2R = Math.PI / 180;

/** Legacy C.SYS_DEFAULTS range per system kind, read by the placement ghost ring. */
const SYS_RANGE: Record<string, number> = {
  radar: 4000,
  rf: 3000,
  eoir: 2500,
  acoustic: 800,
  ew: 1500,
  kinetic: 3000,
  de: 1000,
  c2: 0,
  tspi: 0,
};

function find<T extends { id: string }>(
  list: readonly T[] | undefined,
  id: string | null | undefined,
): T | null {
  return (list || []).filter((x) => x.id === id)[0] || null;
}
function zOf(cam: Cam, v: number | undefined): number {
  return cam.kind === 'plan' ? 0 : v || 0;
}
type PtIn = { x: number; y: number; z?: number } | number[];
function P(q: PtIn): Pt3 {
  return Array.isArray(q) ? { x: q[0]!, y: q[1]!, z: q[2] || 0 } : { x: q.x, y: q.y, z: q.z || 0 };
}

function h(
  ctx: Ctx,
  kind: string,
  sx: number,
  sy: number,
  k: string,
  id: string,
  i: number | null | undefined,
  role: string,
  extra?: HandleExtra,
): string {
  const ex: HandleExtra = extra || {};
  ex.attrs = { 'data-k': k, 'data-id': id, 'data-i': i == null ? null : i, 'data-role': role };
  ctx.hit({ kind: k, id, i: i == null ? null : i, role, sx, sy, r: 5, handle: true });
  return ctx.sym.handle(kind, sx, sy, ex);
}

function tag(ctx: Ctx, x: number, y: number, text: string): string {
  return ctx.S('text', { x: r1(x), y: r1(y), class: 'hlab' }, esc(text));
}

// the point on the segment a to b that stays inside the board rect (inset 12 px), so a far ray end stays in reach
function clipToBoard(cam: Cam, a: number[], b: number[]): number[] {
  const m = 12;
  const x0 = m;
  const y0 = m;
  const x1 = (cam.W || 0) - m;
  const y1 = (cam.H || 0) - m;
  let f = 1;
  const dx = b[0]! - a[0]!;
  const dy = b[1]! - a[1]!;
  if (!(x1 > x0 && y1 > y0)) return b;
  if (dx > 0 && b[0]! > x1) f = Math.min(f, (x1 - a[0]!) / dx);
  if (dx < 0 && b[0]! < x0) f = Math.min(f, (x0 - a[0]!) / dx);
  if (dy > 0 && b[1]! > y1) f = Math.min(f, (y1 - a[1]!) / dy);
  if (dy < 0 && b[1]! < y0) f = Math.min(f, (y0 - a[1]!) / dy);
  f = Math.max(0, f);
  return [a[0]! + dx * f, a[1]! + dy * f];
}

// screen angle in degrees of a plan bearing (clockwise from north)
function scrAngle(brg: number): number {
  return brg - 90;
}

function pathHandles(ctx: Ctx, p: PathRec): string {
  const cam = ctx.cam;
  const d = ctx.derived;
  let out = '';
  const w = (d.timed && d.timed[p.id]) || [];
  if (!w.length) return '';
  w.forEach((q, i) => {
    const s = cam.project(q.x, q.y, zOf(cam, q.z));
    const hold = (p.pts[i] && p.pts[i]!.hold) || 0;
    if (cam.kind === 'plan' && (ctx.sel.i === i || hold > 0)) {
      const rr = 9 + (hold / 10) * 12;
      out += h(ctx, 'hold', s[0], s[1], 'path', p.id, i, 'hold', { r: rr });
      if (hold > 0) out += tag(ctx, s[0] + rr + 6, s[1] - 6, 'hold ' + Math.round(hold) + ' s');
    }
    out += h(ctx, 'wp', s[0], s[1], 'path', p.id, i, 'centre', { filled: ctx.sel.i === i });
    if (cam.kind === 'elev' && ctx.sel.i === i)
      out += tag(ctx, s[0] + 9, s[1] - 9, ctx.u.v(q.z) + ' (' + fmtN(q.z, 0) + ' m)');
  });
  for (let i = 0; i < w.length - 1; i++) {
    const m = segmentPoint(w, i, 0.5);
    const ms = cam.project(m.x, m.y, zOf(cam, m.z));
    out += h(ctx, 'insert', ms[0], ms[1], 'path', p.id, i, 'insert');
  }
  return out;
}

function systemHandles(ctx: Ctx, s: SystemRec): string {
  const cam = ctx.cam;
  let out = '';
  const c = cam.project(s.x, s.y, zOf(cam, s.z));
  out += h(ctx, 'wp', c[0], c[1], 'system', s.id, null, 'centre', { filled: true });
  if (!(s.range > 0)) return out;
  const lab = s.id + ' ' + ctx.u.hDual(s.range);
  if (cam.kind === 'plan') {
    const R = s.range * cam.scale;
    const sector = s.fov < 360;
    const b = sector ? s.bearing : 90;
    const at = (brg: number, f: number) =>
      [c[0] + Math.sin(brg * D2R) * R * f, c[1] - Math.cos(brg * D2R) * R * f] as [number, number];
    const rp = at(b, 1);
    out += h(ctx, 'range', rp[0], rp[1], 'system', s.id, null, 'range');
    out += tag(ctx, rp[0] + 8, rp[1] - 8, lab);
    if (sector) {
      const e0 = at(s.bearing - s.fov / 2, 1);
      const e1 = at(s.bearing + s.fov / 2, 1);
      const mid = at(s.bearing, 0.85);
      out += h(ctx, 'arcEnd', e0[0], e0[1], 'system', s.id, null, 'arcEnd0', {
        angle: scrAngle(s.bearing - s.fov / 2),
      });
      out += h(ctx, 'arcEnd', e1[0], e1[1], 'system', s.id, null, 'arcEnd1', {
        angle: scrAngle(s.bearing + s.fov / 2),
      });
      out += h(ctx, 'arcMid', mid[0], mid[1], 'system', s.id, null, 'arcMid');
    }
  } else {
    const o = cam.origin;
    const rs = Math.hypot(s.x - o.x, s.y - o.y);
    const zs = s.z || 0;
    const rr = cam.projectRZ!(rs + s.range, zs);
    out += h(ctx, 'range', rr[0], rr[1], 'system', s.id, null, 'range');
    out += tag(ctx, rr[0] - 8, rr[1] - 10, lab).replace(
      'class="hlab"',
      'class="hlab" text-anchor="end"',
    );
    const rays: [string, number, boolean][] = [
      ['elRay0', s.elMin, s.elMin > -90],
      ['elRay1', s.elMax, s.elMax < 90],
    ];
    for (const e of rays) {
      if (!e[2]) continue;
      const a = cam.projectRZ!(rs, zs);
      let b2: number[] = cam.projectRZ!(
        rs + s.range * Math.cos(e[1] * D2R),
        zs + s.range * Math.sin(e[1] * D2R),
      );
      b2 = clipToBoard(cam, a, b2);
      const ang = Math.atan2(b2[1]! - a[1], b2[0]! - a[0]) / D2R;
      out += h(ctx, 'elRay', b2[0]!, b2[1]!, 'system', s.id, null, e[0], { angle: ang });
      out += tag(
        ctx,
        b2[0]! + 8,
        b2[1]! - 4,
        (e[0] === 'elRay0' ? 'elMin ' : 'elMax ') + Math.round(e[1]) + '°',
      );
    }
  }
  return out;
}

function volumeHandles(ctx: Ctx, v: VolumeRec): string {
  const cam = ctx.cam;
  let out = '';
  if (cam.kind === 'plan') {
    v.pts.forEach((q, i) => {
      const s = cam.project(q[0], q[1], 0);
      out += h(ctx, 'vertex', s[0], s[1], 'volume', v.id, i, 'vertex', { filled: ctx.sel.i === i });
    });
    v.pts.forEach((q, i) => {
      const n = v.pts[(i + 1) % v.pts.length]!;
      const s = cam.project((q[0] + n[0]) / 2, (q[1] + n[1]) / 2, 0);
      out += h(ctx, 'edge', s[0], s[1], 'volume', v.id, i, 'edge');
    });
  } else if (v.zmax > 0) {
    const o = cam.origin;
    let lo = Infinity;
    let hi = 0;
    for (const q of v.pts) {
      const r = Math.hypot(q[0] - o.x, q[1] - o.y);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    const t = cam.projectRZ!((lo + hi) / 2, v.zmax);
    out += h(ctx, 'top', t[0], t[1], 'volume', v.id, null, 'top');
    out += tag(ctx, t[0] + 12, t[1] - 6, ctx.u.v(v.zmax));
  }
  return out;
}

function selected(ctx: Ctx): string {
  const sel = ctx.sel;
  const sc = ctx.scene;
  const cam = ctx.cam;
  const d = ctx.derived;
  if (!sel || !sel.kind || sel.id == null) return '';
  if (sel.kind === 'path') {
    const p = find(sc.paths, sel.id);
    return p ? pathHandles(ctx, p) : '';
  }
  if (sel.kind === 'system') {
    const s = find(sc.systems, sel.id);
    return s ? systemHandles(ctx, s) : '';
  }
  if (sel.kind === 'volume') {
    const v = find(sc.volumes, sel.id);
    return v ? volumeHandles(ctx, v) : '';
  }
  if (sel.kind === 'plane' && cam.kind === 'elev') {
    const pl = find(sc.planes, sel.id);
    if (!pl) return '';
    const m = cam.projectRZ!(cam.maxR! / 2, pl.z);
    return (
      h(ctx, 'line', m[0], m[1], 'plane', pl.id, null, 'line') +
      tag(ctx, m[0] + 10, m[1] - 6, ctx.u.v(pl.z))
    );
  }
  if (sel.kind === 'event') {
    const e = find(ctx.profile.events, sel.id);
    const w = e && d.timed && d.timed[e.path];
    if (!e || !w || !w.length) return '';
    const q = posAt(w, e.t);
    const bs = cam.project(q.x, q.y, zOf(cam, q.z));
    return h(ctx, 'bead', bs[0], bs[1], 'event', e.id, null, 'bead', { filled: true });
  }
  return '';
}

function ghostRecord(ctx: Ctx): string {
  const g = ctx.ghost;
  const S = ctx.S;
  const cam = ctx.cam;
  let out = '';
  if (!g || !g.rec || !g.rec.scene) return '';
  const sc = g.rec.scene;
  const gt = (g.derived && g.derived.timed) || {};
  for (const v of sc.volumes || []) {
    if (cam.kind === 'plan' && v.pts && v.pts.length > 2)
      out += S('polygon', { points: poly(cam, v.pts), class: 'gvol' });
  }
  for (const s of sc.systems || []) {
    const c = cam.project(s.x, s.y, zOf(cam, s.z));
    out += S('circle', { cx: r1(c[0]), cy: r1(c[1]), r: 4, class: 'gsys' });
    if (cam.kind === 'plan' && s.range > 0)
      out += S('circle', {
        cx: r1(c[0]),
        cy: r1(c[1]),
        r: r1(s.range * cam.scale),
        class: 'gring',
      });
  }
  for (const p of sc.paths || []) {
    const w: { x: number; y: number; z: number }[] =
      (gt[p.id] && gt[p.id]!.length ? gt[p.id] : p.pts) || [];
    if (w.length > 1)
      out += S('polyline', {
        points: poly(
          cam,
          w.map((q) => [q.x, q.y, zOf(cam, q.z)]),
        ),
        class: 'groute',
      });
  }
  return out ? S('g', { class: 'ghostrec' }, out) : '';
}

type End = { x: number; y: number; z: number; v: [number, number]; track: boolean };

function rulerEnd(ctx: Ctx, e: RulerEnd): End {
  const d = ctx.derived;
  const pid = e.kind === 'path' ? e.id : e.pathId;
  const w = pid ? d.timed && d.timed[pid] : undefined;
  if (pid && ctx.t != null && w && w.length) {
    const q = posAt(w, ctx.t);
    return { x: q.x, y: q.y, z: q.z || 0, v: [q.vx || 0, q.vy || 0], track: true };
  }
  return { x: e.x, y: e.y, z: e.z || 0, v: [0, 0], track: false };
}

function ruler(ctx: Ctx): string {
  const rl = ctx.ruler;
  const S = ctx.S;
  const cam = ctx.cam;
  const u = ctx.u;
  if (!rl || !rl.a || cam.kind !== 'plan') return '';
  const a = rulerEnd(ctx, rl.a);
  const b = rl.b ? rulerEnd(ctx, rl.b) : a;
  const sa = cam.project(a.x, a.y, 0);
  const sb = cam.project(b.x, b.y, 0);
  let out =
    S('line', { x1: r1(sa[0]), y1: r1(sa[1]), x2: r1(sb[0]), y2: r1(sb[1]), class: 'ruler' }) +
    S('circle', { cx: r1(sa[0]), cy: r1(sa[1]), r: 2.5, class: 'rulerend' }) +
    S('circle', { cx: r1(sb[0]), cy: r1(sb[1]), r: 2.5, class: 'rulerend' });
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0) {
    const lines = [u.h(dist) + ' ' + u.brg(bearingTo({ x: a.x, y: a.y }, { x: b.x, y: b.y }))];
    if (a.track && b.track) {
      const vc = -(dx * (b.v[0] - a.v[0]) + dy * (b.v[1] - a.v[1])) / dist;
      const dz = b.z - a.z;
      lines.push(
        'closing ' + u.spd(vc),
        (dz >= 0 ? '+' : '-') + numOnly(u.v(Math.abs(dz))) + ' ' + u.labels().v,
      );
    }
    const lx = r1((sa[0] + sb[0]) / 2 + 6);
    out += S(
      'text',
      { x: lx, y: r1((sa[1] + sb[1]) / 2 - 6), class: 'rulerl' },
      lines.map((ln, k) => S('tspan', k ? { x: lx, dy: '1.2em' } : { x: lx }, esc(ln))).join(''),
    );
  }
  return S('g', { class: 'rulerg' }, out);
}

function placingGhost(ctx: Ctx): string {
  const pl = ctx.placing;
  const S = ctx.S;
  const cam = ctx.cam;
  let out = '';
  if (!pl || !pl.kind) return '';
  const pts = (pl.pts || []).map(P);
  const cur = pl.cur
    ? P(pl.cur)
    : pl.at
      ? P(pl.at)
      : pl.cursor
        ? P(pl.cursor)
        : pts.length
          ? pts[pts.length - 1]!
          : null;
  if (pl.kind === 'formation') {
    const path = find(ctx.scene.paths, pl.pathId);
    if (!path || !(path.pts && path.pts.length >= 2)) return '';
    for (const m of formationPoints(path.pts, pl.n || 2, pl.spacing || 100) || []) {
      if (m.length > 1)
        out += S('polyline', {
          points: poly(
            cam,
            m.map((q) => [q.x, q.y, zOf(cam, q.z)]),
          ),
          class: 'groute form',
        });
      for (const q of m) {
        const s = cam.project(q.x, q.y, zOf(cam, q.z));
        out += S('circle', { cx: r1(s[0]), cy: r1(s[1]), r: 2, class: 'gsys' });
      }
    }
    return S('g', { class: 'placing' }, out);
  }
  const all = cur && pts.indexOf(cur) < 0 ? pts.concat([cur]) : pts;
  if ((pl.kind === 'aircraft' || pl.kind === 'volume') && all.length > 1) {
    out += S(pl.kind === 'volume' && all.length > 2 ? 'polygon' : 'polyline', {
      points: poly(
        cam,
        all.map((q) => [q.x, q.y, zOf(cam, q.z)]),
      ),
      class: 'groute',
    });
  }
  for (const q of pts) {
    const s = cam.project(q.x, q.y, zOf(cam, q.z));
    out += S('circle', { cx: r1(s[0]), cy: r1(s[1]), r: 3, class: 'gsys' });
  }
  if (cur) {
    const c = cam.project(cur.x, cur.y, zOf(cam, cur.z));
    if (pl.kind === 'system') {
      const range = (pl.sysKind && SYS_RANGE[pl.sysKind]) || 0;
      if (cam.kind === 'plan' && range > 0)
        out += S('circle', {
          cx: r1(c[0]),
          cy: r1(c[1]),
          r: r1(range * cam.scale),
          class: 'gring',
        });
      out += S(
        'g',
        { class: 'gframe' },
        ctx.sym.groundFrame(pl.sysKind || 'radar', 'active', c[0], c[1]),
      );
    } else if (pl.kind === 'event') {
      out += S('circle', { cx: r1(c[0]), cy: r1(c[1]), r: 6, class: 'gbead' });
    } else if (pl.kind === 'aircraft') {
      const ar = pl.arch ? archetypeById(pl.arch) : undefined;
      out += S(
        'g',
        { class: 'gframe' },
        ctx.sym.airFrame(
          ar && ar.role === 'surrogate' ? 'neutral' : 'hostile',
          'normal',
          c[0],
          c[1],
        ),
      );
    }
    // the snap label shows in the board panel, not in the SVG
    out += S('path', {
      d:
        'M' +
        r1(c[0] - 12) +
        ',' +
        r1(c[1]) +
        'H' +
        r1(c[0] + 12) +
        'M' +
        r1(c[0]) +
        ',' +
        r1(c[1] - 12) +
        'V' +
        r1(c[1] + 12),
      class: 'xhair',
    });
  }
  return out ? S('g', { class: 'placing' }, out) : '';
}

register({
  id: 'handles',
  label: 'Handles',
  order: 85,
  chip: null,
  defaultOn: true,
  cameras: ['plan', 'elev'],
  inputs: [
    'scene',
    'profile',
    'derived',
    'cam',
    't',
    'sel',
    'edit',
    'thumb',
    'placing',
    'ruler',
    'ghost',
    'units',
  ],
  draw(ctx) {
    if (!ctx.edit || ctx.thumb || (ctx.cam.kind !== 'plan' && ctx.cam.kind !== 'elev')) return '';
    return ghostRecord(ctx) + selected(ctx) + placingGhost(ctx) + ruler(ctx);
  },
});
