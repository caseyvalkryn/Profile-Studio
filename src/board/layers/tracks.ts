// Layer tracks (legacy 43-layer-tracks.js, chip 4): frames at t by the track lifecycle
// (derived.trackLine), leaders, data blocks, sensor-to-track lines, engagement bars, mission
// kill, elevation slant line, axon drop lines, hover ghosts. It also draws the target TSPI cross
// (chip 8 "target", registered below, read from ctx.layers.target). Legacy names stay (paths,
// systems, elev, axon).
import { COAST_S } from '../../domain/catalog';
import { posAt, type Pt3, type TimedPoint } from '../../engine/geo';
import type { Cam } from '../cameras';
import { hundredsFt, type BoardUnits } from '../format';
import { register, type Ctx } from '../layers';
import { isSensorKind as isSensor } from '../scene';
import { r1 } from '../svg';
import type { EventRec, SystemRec, TrackSpan } from '../types';

function zOf(cam: Cam, v: number | undefined): number {
  return cam.kind === 'plan' ? 0 : v || 0;
}

// the span of trackLine that holds t, with its index; the last span includes its end
function spanAt(lines: TrackSpan[], t: number): number {
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i]!;
    if (t >= s.t0 && (t < s.t1 || (i === lines.length - 1 && t <= s.t1))) return i;
  }
  return -1;
}

export type FrameState = { identity: string; status: string; gapStart: number | null };

// { identity, status, gapStart } or null before Detect
export function frameState(
  lines: TrackSpan[] | undefined,
  t: number | null,
  identity: string | null | undefined,
): FrameState | null {
  if (!lines || !lines.length || t == null) return null;
  const i = spanAt(lines, t);
  if (i < 0) return null;
  const st = lines[i]!.state;
  let status = 'normal';
  let gapStart: number | null = null;
  let base = st;
  if (st === 'coast' || st === 'lost') {
    status = st === 'coast' ? 'coasting' : 'lost';
    let j = i;
    while (j > 0 && (lines[j - 1]!.state === 'coast' || lines[j - 1]!.state === 'lost')) j--;
    gapStart = lines[j]!.t0;
    base = 'pending';
    for (let k = j - 1; k >= 0; k--) {
      if (lines[k]!.state !== 'coast' && lines[k]!.state !== 'lost') {
        base = lines[k]!.state;
        break;
      }
    }
  }
  const id =
    base === 'pending' ? 'pending' : base === 'unknown' ? 'unknown' : identity || 'hostile';
  return { identity: id, status, gapStart };
}

// what the system holds: the planned position, or dead reckoning from the last cover while in a gap
function heldPos(
  w: TimedPoint[],
  t: number,
  fs: FrameState | null,
): { p: Pt3; v: [number, number, number]; holding: boolean } {
  const q = posAt(w, t);
  if (!fs || fs.gapStart == null)
    return { p: q, v: [q.vx || 0, q.vy || 0, q.vz || 0], holding: !!q.holding };
  const g = posAt(w, fs.gapStart);
  const dt = Math.min(t - fs.gapStart, COAST_S);
  const v: [number, number, number] = [g.vx || 0, g.vy || 0, g.vz || 0];
  return {
    p: { x: g.x + v[0] * dt, y: g.y + v[1] * dt, z: (g.z || 0) + v[2] * dt },
    v,
    holding: !!g.holding,
  };
}

function speedLine(u: BoardUnits, z: number, spd: number): string {
  const h = u.mode === 'si' ? String(Math.round(z)) : hundredsFt(z);
  return h + ' ' + u.spd(spd).replace(/\s+/g, '').toUpperCase();
}

function drawTracks(ctx: Ctx): string {
  const S = ctx.S;
  const cam = ctx.cam;
  const d = ctx.derived;
  const u = ctx.u;
  const t = ctx.t;
  let under = '';
  let over = '';
  const paths = ctx.scene.paths || [];
  const R = ctx.thumb ? 4 : 7;
  const sysById: Record<string, SystemRec> = {};
  for (const s of ctx.scene.systems || []) sysById[s.id] = s;
  const events: EventRec[] = ctx.profile.events || [];

  // hover ghost frames at the strip pointer time
  if (ctx.hoverT != null && !ctx.thumb) {
    const ht = ctx.hoverT;
    for (const p of paths) {
      const w = d.timed && d.timed[p.id];
      if (!w || !w.length) continue;
      const fs = frameState(d.trackLine && d.trackLine[p.id], ht, p.identity);
      if (!fs) continue;
      const hp = heldPos(w, ht, fs).p;
      const s = cam.project(hp.x, hp.y, zOf(cam, hp.z));
      under += S(
        'g',
        { class: 'ghostfr' },
        ctx.sym.airFrame(fs.identity, fs.status, s[0], s[1], R),
      );
    }
  }
  if (t == null) return under;

  // raid collapse: with Envelopes on, one frame per hull unless a member is selected
  const lead: Record<string, string[]> = {};
  const skip: Record<string, true> = {};
  if (ctx.layers.envelopes && typeof d.envelopesAt === 'function') {
    for (const env of d.envelopesAt(t) || []) {
      const m = env.members || [];
      if (m.length < 2) continue;
      if (ctx.sel.kind === 'path' && ctx.sel.id != null && m.indexOf(ctx.sel.id) >= 0) continue;
      lead[m[0]!] = m;
      m.slice(1).forEach((id) => (skip[id] = true));
    }
  }

  for (const p of paths) {
    const w = d.timed && d.timed[p.id];
    if (!w || !w.length) continue;
    const dim = ctx.dim(p.id);
    const q = posAt(w, t);
    const qs = cam.project(q.x, q.y, zOf(cam, q.z));
    const fs = frameState(d.trackLine && d.trackLine[p.id], t, p.identity);
    const cross = ctx.layers.target ? ctx.sym.tspiCross(qs[0], qs[1]) : '';
    if (!fs || skip[p.id] || !ctx.layers.tracks) {
      if (cross) under += S('g', { class: 'tgt' + dim }, cross);
      continue;
    }
    const hp = heldPos(w, t, fs);
    let fp: Pt3 = hp.p;
    let n = 1;
    const members = lead[p.id];
    if (members) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      n = members.length;
      for (const id of members) {
        const tw = d.timed[id];
        const mw = tw && tw.length ? posAt(tw, t) : fp;
        cx += mw.x;
        cy += mw.y;
        cz += mw.z || 0;
      }
      fp = { x: cx / n, y: cy / n, z: cz / n };
    }
    const s = cam.project(fp.x, fp.y, zOf(cam, fp.z));
    let inner = '';
    const gap = fs.status === 'coasting' || fs.status === 'lost';

    if (cross) {
      under += S(
        'g',
        { class: 'tgt' + dim },
        cross +
          (gap
            ? S('line', { x1: r1(qs[0]), y1: r1(qs[1]), x2: r1(s[0]), y2: r1(s[1]), class: 'tgtl' })
            : ''),
      );
    }
    // sensor-to-track lines; a coasting track draws none
    if (!gap && typeof d.coveringAt === 'function') {
      for (const id of d.coveringAt(p.id, t) || []) {
        const b = sysById[id];
        if (!b || !isSensor(b.kind)) continue;
        const bs = cam.project(b.x, b.y, zOf(cam, b.z));
        under += S('g', { class: 'trk' + dim }, ctx.sym.lockLine(bs, s, 'tracking'));
      }
    }
    // axon drop line, elevation slant line from the reference
    if (cam.kind === 'axon') {
      const gs = cam.project(fp.x, fp.y, 0);
      inner += S('line', {
        x1: r1(s[0]),
        y1: r1(s[1]),
        x2: r1(gs[0]),
        y2: r1(gs[1]),
        class: 'drop id-' + fs.identity,
      });
    }
    if (cam.kind === 'elev') {
      const o = cam.origin;
      const os = cam.project(o.x, o.y, o.z || 0);
      inner += S('line', {
        x1: r1(os[0]),
        y1: r1(os[1]),
        x2: r1(s[0]),
        y2: r1(s[1]),
        class: 'slant',
      });
      if (!ctx.thumb) {
        const rh = Math.hypot(fp.x - o.x, fp.y - o.y);
        const dz = (fp.z || 0) - (o.z || 0);
        const txt =
          u.h(Math.hypot(rh, dz)) + ' ' + Math.round((Math.atan2(dz, rh) * 180) / Math.PI) + '°';
        const mx = (os[0] + s[0]) / 2;
        const my = (os[1] + s[1]) / 2 - 4;
        ctx.label({
          p: 1.5,
          id: p.id,
          box: ctx.sym.textBox(mx, my, txt, 10, 'middle'),
          svg: ctx.sym.label(mx, my, txt, 'small slx' + dim, 'middle'),
        });
      }
    }
    // leader: distance flown in 10 s at the current scale; none while lost or holding
    const spd = Math.hypot(hp.v[0], hp.v[1]);
    if (fs.status !== 'lost' && !hp.holding && spd > 0) {
      const a2 = cam.project(fp.x + hp.v[0], fp.y + hp.v[1], zOf(cam, (fp.z || 0) + hp.v[2]));
      inner += ctx.sym.leader(s[0], s[1], a2[0] - s[0], a2[1] - s[1], spd * 10 * cam.scale);
    }
    inner += ctx.sym.airFrame(fs.identity, fs.status, s[0], s[1], R);
    const c = ctx.cls(p.id);
    if (c) inner += S('circle', { cx: r1(s[0]), cy: r1(s[1]), r: R + 6, class: 'selring' + c });

    // engagement marks from the latest engage at or before t
    let eng: EventRec | null = null;
    let term: EventRec | null = null;
    for (const e of events) {
      if (e.path !== p.id || e.t > t) continue;
      if (e.type === 'engage' && (!eng || e.t >= eng.t)) eng = e;
      if (e.type === 'terminal' && (!term || e.t >= term.t)) term = e;
    }
    if (eng && t <= eng.t + 15) {
      const fe = d.firstEffector && d.firstEffector[p.id];
      const es =
        (eng.system != null ? sysById[eng.system] : undefined) ||
        (fe ? sysById[fe.system] : undefined);
      if (es) {
        const ep = cam.project(es.x, es.y, zOf(cam, es.z));
        if (es.kind === 'ew') {
          under += S('g', { class: 'eng-l' + dim }, ctx.sym.lockLine(ep, s, 'jam'));
          if (!ctx.thumb)
            inner +=
              ctx.sym.engageBar(s[0], s[1], 'ENG-EA') +
              S('text', { x: r1(s[0] - R - 9), y: r1(s[1] + 4), class: 'jmk' }, 'J');
        } else if (es.kind === 'kinetic') {
          under += S('g', { class: 'eng-l' + dim }, ctx.sym.lockLine(ep, s, 'lock'));
          if (!ctx.thumb) inner += ctx.sym.engageBar(s[0], s[1], 'MIF-M');
        } else if (es.kind === 'de') {
          under += S('g', { class: 'eng-l' + dim }, ctx.sym.lockLine(ep, s, 'de'));
        }
      }
    }
    if (term) inner += ctx.sym.missionKill(s[0], s[1], R);

    over += S(
      'g',
      { class: 'trkf' + dim, 'data-k': 'path', 'data-id': p.id, 'data-role': 'frame' },
      inner,
    );
    ctx.hit({ kind: 'path', id: p.id, i: null, role: null, sx: s[0], sy: s[1], r: R });

    if (!ctx.thumb) {
      const l1 =
        p.id +
        (p.group ? ' ' + p.group : '') +
        (n > 1 ? ' x' + n : '') +
        (fs.status === 'coasting' ? ' CST' : '') +
        (fs.status === 'lost' ? ' LOST' : '') +
        (hp.holding && !gap ? ' HOLD' : '');
      const l2 = speedLine(u, fp.z || 0, gap ? spd : Math.hypot(q.vx || 0, q.vy || 0));
      const bx = s[0] + R + 6;
      const by = s[1] - 2;
      ctx.label({
        p: 1,
        id: p.id,
        always: true,
        box: ctx.sym.textBox(bx, by, [l1, l2], 11.5),
        svg: S(
          'g',
          { class: 'dbg' + dim + (fs.status === 'lost' ? ' lost' : '') },
          ctx.sym.dataBlock(bx, by, l1, l2),
        ),
      });
    }
  }
  return under + over;
}

register({
  id: 'tracks',
  order: 80,
  chip: 4,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: [
    'scene',
    'profile',
    'derived',
    'cam',
    't',
    'hoverT',
    'layers',
    'sel',
    'hover',
    'focus',
    'thumb',
    'units',
  ],
  draw: drawTracks,
});

// chip 8: drawn by the tracks layer; this entry gives the layer bar its chip
register({
  id: 'target',
  order: 81,
  chip: 8,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: [],
  draw: () => '',
});
