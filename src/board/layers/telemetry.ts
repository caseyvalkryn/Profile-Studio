// Layer telemetry (legacy 43-layer-telemetry.js, chip 5): planned TSPI samples, station links at
// t, flown samples and the flown frame at t. Legacy names stay (paths, systems, elev, axon).
import { posAt, type TimedPoint } from '../../engine/geo';
import type { Cam } from '../cameras';
import { register } from '../layers';
import { r1 } from '../svg';
import type { FlownSample, SystemRec } from '../types';

function z(cam: Cam, v: number | undefined): number {
  return cam.kind === 'plan' ? 0 : v || 0;
}

type FlownPt = TimedPoint | FlownSample;

// position on a flown list: geo timed points ({t0, t1}) or resampled samples ({t})
function flownAt(list: FlownPt[], t: number): { x: number; y: number; z: number } {
  if ((list[0] as TimedPoint).t0 != null) return posAt(list as TimedPoint[], t);
  const s = list as FlownSample[];
  if (t <= s[0]!.t) return s[0]!;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1]!;
    const b = s[i]!;
    if (t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  return s[s.length - 1]!;
}

register({
  id: 'telemetry',
  order: 65,
  chip: 5,
  defaultOn: false,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'profile', 'derived', 'cam', 't', 'focus', 'thumb'],
  draw(ctx) {
    const S = ctx.S;
    const cam = ctx.cam;
    const d = ctx.derived;
    const rec = ctx.profile;
    let out = '';
    const tm = rec.telemetry || { interval: 0, stations: [] };
    const step = tm.interval > 0 ? tm.interval : 20;
    const sysById: Record<string, SystemRec> = {};
    for (const s of ctx.scene.systems || []) sysById[s.id] = s;
    for (const p of ctx.scene.paths || []) {
      const w = d.timed && d.timed[p.id];
      if (!w || !w.length) continue;
      const dim = ctx.dim(p.id);
      let inner = '';
      const end = w[w.length - 1]!.t1;
      for (let t = 0; t <= end + 1e-6; t += step) {
        const q = posAt(w, t);
        const s = cam.project(q.x, q.y, z(cam, q.z));
        inner += S('rect', {
          x: r1(s[0] - 1.3),
          y: r1(s[1] - 1.3),
          width: 2.6,
          height: 2.6,
          class: 'tel',
        });
      }
      let here: [number, number] | null = null;
      if (ctx.t != null) {
        const q = posAt(w, ctx.t);
        const h = cam.project(q.x, q.y, z(cam, q.z));
        here = h;
        for (const id of tm.stations || []) {
          const b = sysById[id];
          if (!b) continue;
          const c = cam.project(b.x, b.y, z(cam, b.z));
          inner += S('line', {
            x1: r1(c[0]),
            y1: r1(c[1]),
            x2: r1(h[0]),
            y2: r1(h[1]),
            class: 'tell',
          });
        }
      }
      const raw = rec.debrief && rec.debrief.tspi && rec.debrief.tspi[p.id];
      if (raw && raw.length) {
        const every = Math.max(1, Math.ceil(raw.length / 200));
        raw.forEach((smp, i) => {
          if (i % every) return;
          const fs = cam.project(smp[1], smp[2], z(cam, smp[3]));
          inner += S('rect', {
            x: r1(fs[0] - 2),
            y: r1(fs[1] - 2),
            width: 4,
            height: 4,
            class: 'flsq',
          });
        });
      }
      const fl = d.flown && d.flown[p.id];
      if (here && ctx.t != null && fl && fl.timed && fl.timed.length) {
        const last = fl.timed[fl.timed.length - 1]!;
        const lastT =
          (last as TimedPoint).t1 != null ? (last as TimedPoint).t1 : (last as FlownSample).t;
        if (ctx.t <= lastT) {
          const fq = flownAt(fl.timed, ctx.t);
          const fp = cam.project(fq.x, fq.y, z(cam, fq.z));
          inner += S('line', {
            x1: r1(fp[0]),
            y1: r1(fp[1]),
            x2: r1(here[0]),
            y2: r1(here[1]),
            class: 'fllink',
          });
          inner += S(
            'g',
            { class: 'flownfr' },
            ctx.sym.airFrame(p.identity || 'hostile', 'lost', fp[0], fp[1], ctx.thumb ? 4 : 7),
          );
        }
      }
      if (inner) out += S('g', { class: 'telem' + dim, 'data-k': 'path', 'data-id': p.id }, inner);
    }
    return out;
  },
});
