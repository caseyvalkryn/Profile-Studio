// Layer events (legacy 43-layer-events.js, chip 2): event beads with letter glyphs, warning
// triangles on early events, and first-see ticks per sensor and effector in the system ink.
// Legacy names stay (paths, systems, elev, axon).
//
// Added to legacy (lane 13.3): the key point marks, the `keypoints` layer below. Each threat's
// F2T2EA stages (derived.stages) and its defended asset entry (derived.daEntry) sit on its track
// at the position at that time, as the strip's glyphs (symbols.keyPoint), under the ticks and the
// beads. The layer does not read ctx.t: each mark carries its time as `--kt` and board.css
// derives the state (reached ink, future at 45 percent) from the root svg's `--t`, so a tick
// rewrites no mark. The `keypoints-now` layer draws only each threat's current mark (halo and
// accent glyph) and reads ctx.t. Neither is a hit target (no ctx.hit, no label candidate;
// board.css sets pointer-events none) and neither draws in thumb mode or with the Events chip
// off. Legacy derive has no stages, so with its output only the DA marks draw.
import { posAt, type Pt3, type TimedPoint } from '../../engine/geo';
import { STAGES, type StageName } from '../../engine/derived';
import { legacyUnits } from '../../engine/tokens';
import { EFFECTOR_KINDS, SENSOR_KINDS } from '../../domain/catalog';
import type { Cam } from '../cameras';
import { register, type Ctx } from '../layers';
import { esc, r1 } from '../svg';
import type { KeyPointStage } from '../symbols';
import type { DerivedView } from '../types';

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

/** The derived fields the key point marks read; both optional (legacy derive has no stages). */
type KeyPointDerived = DerivedView & {
  stages?: Record<string, Partial<Record<StageName, { t: number; system: string | null } | null>>>;
  daEntry?: Record<string, number | null>;
};

const KP_LABEL: Record<KeyPointStage, string> = {
  find: 'Find',
  fix: 'Fix',
  track: 'Track',
  target: 'Target',
  engage: 'Engage',
  assess: 'Assess',
  da: 'DA',
};

/** Two marks of one threat closer than this draw the later one off the line. */
const KP_NEAR = 6;
/** The offset step along the track's normal for a mark that would overlap an earlier one. */
const KP_STEP = 10;

/** One mark's time-independent parts, built once per derived object (KP_CACHE). */
type Mark = {
  stage: KeyPointStage;
  t: number;
  /** World position: the first-see tick's when the stage's system first sees the threat then. */
  pos: Pt3;
  /** `<g class="kp kp-<stage>`: dim follows. */
  head: string;
  /** The rest of the opening tag with `--kt` and the title: the glyph follows. */
  body: string;
};

/** One threat's marks in STAGES order then the defended asset entry, with its track. */
type Marks = { w: TimedPoint[]; marks: Mark[] };

/** Marks placed for one camera state: the glyph string and the screen centre per mark. */
type Placed = { glyph: string[]; x: number[]; y: number[] };

type KpCache = { marks: Map<string, Marks>; camKey: string; placed: Map<string, Placed> };

/**
 * The key point cache, keyed on the derived object. The renderer passes the same memoised
 * derived (boardDerived, one per Vignette reference) on every tick while the document is
 * unchanged; an edit makes a new Vignette, so a new derived and a fresh entry. Everything in
 * `marks` reads the derived alone (stages, daEntry, first, timed). `placed` is valid for one
 * camera state (camKey) and is rebuilt when the key changes.
 */
const KP_CACHE = new WeakMap<object, KpCache>();

function kpCache(d: KeyPointDerived): KpCache {
  let c = KP_CACHE.get(d);
  if (!c) {
    c = { marks: new Map(), camKey: '', placed: new Map() };
    KP_CACHE.set(d, c);
  }
  return c;
}

/**
 * A key for one camera state: the kind, size, elevation mode and path, and two fixed probe
 * points projected. A pan, a zoom, a rotation or a resize moves at least one probe.
 */
function camKey(cam: Cam): string {
  const a = cam.project(1234.5, -987.25, 321);
  const b = cam.project(-4321.75, 2345.5, 55);
  return (
    cam.kind +
    '|' +
    cam.W +
    '|' +
    cam.H +
    '|' +
    (cam.mode || '') +
    '|' +
    (cam.path || '') +
    '|' +
    a[0] +
    ',' +
    a[1] +
    '|' +
    b[0] +
    ',' +
    b[1]
  );
}

function buildMarks(d: KeyPointDerived, pathId: string, w: TimedPoint[]): Marks {
  const st = d.stages && d.stages[pathId];
  const da = d.daEntry && d.daEntry[pathId];
  const id = esc(pathId);
  const marks: Mark[] = [];
  const add = (stage: KeyPointStage, t: number, system: string | null, pos: Pt3) => {
    // the strip's title text (N-15): "T1 Track · t+1:40 · RDR-1"
    const title =
      pathId + ' ' + KP_LABEL[stage] + ' · ' + legacyUnits.t(t) + (system ? ' · ' + system : '');
    marks.push({
      stage,
      t,
      pos,
      head: '<g class="kp kp-' + stage,
      body:
        '" data-k="keypoint" data-id="' +
        id +
        '" data-stage="' +
        stage +
        '" style="--kt:' +
        r1(t) +
        '"><title>' +
        esc(title) +
        '</title>',
    });
  };
  if (st)
    for (const s of STAGES) {
      const v = st[s];
      if (!v || v.t == null) continue;
      const fs = v.system && d.first && d.first[pathId] ? d.first[pathId][v.system] : null;
      add(s, v.t, v.system, fs && fs.t === v.t && fs.pos ? fs.pos : posAt(w, v.t));
    }
  if (da != null) add('da', da, null, posAt(w, da));
  return { w, marks };
}

function place(ctx: Ctx, m: Marks): Placed {
  const cam = ctx.cam;
  const placed: Placed = { glyph: [], x: [], y: [] };
  for (const mk of m.marks) {
    const c = cam.project(mk.pos.x, mk.pos.y, zOf(cam, mk.pos.z));
    let x = c[0];
    let y = c[1];
    // declutter: step the later mark along the track's normal until it clears the earlier ones
    const near = (px: number, py: number) => {
      for (let j = 0; j < placed.x.length; j++)
        if (Math.hypot(placed.x[j]! - px, placed.y[j]! - py) < KP_NEAR) return true;
      return false;
    };
    if (near(x, y)) {
      const dir = screenDir(cam, m.w, mk.t) || [1, 0];
      const nx = -dir[1];
      const ny = dir[0];
      for (let k = 1; k <= 6 && near(x, y); k++) {
        x = c[0] + nx * KP_STEP * k;
        y = c[1] + ny * KP_STEP * k;
      }
    }
    placed.x.push(x);
    placed.y.push(y);
    placed.glyph.push(ctx.sym.keyPoint(mk.stage, x, y));
  }
  return placed;
}

/** One threat's marks and their placement for this camera from the cache; null when none. */
function threatMarks(
  ctx: Ctx,
  c: KpCache,
  pathId: string,
  w: TimedPoint[],
): { m: Marks; p: Placed } | null {
  let m = c.marks.get(pathId);
  if (!m || m.w !== w) {
    m = buildMarks(ctx.derived as KeyPointDerived, pathId, w);
    c.marks.set(pathId, m);
    c.placed.delete(pathId);
  }
  if (!m.marks.length) return null;
  let p = c.placed.get(pathId);
  if (!p) {
    p = place(ctx, m);
    c.placed.set(pathId, p);
  }
  return { m, p };
}

/** The cache for this derived, with the placements dropped when the camera state changed. */
function kpFor(ctx: Ctx): KpCache {
  const c = kpCache(ctx.derived as KeyPointDerived);
  const key = camKey(ctx.cam);
  if (key !== c.camKey) {
    c.camKey = key;
    c.placed.clear();
  }
  return c;
}

/** Calls fn per threat with marks, in scene order. */
function eachThreat(ctx: Ctx, fn: (id: string, m: Marks, p: Placed) => string): string {
  const d = ctx.derived as KeyPointDerived;
  const c = kpFor(ctx);
  let out = '';
  for (const path of ctx.scene.paths || []) {
    const w = d.timed && d.timed[path.id];
    if (!w || !w.length) continue;
    const got = threatMarks(ctx, c, path.id, w);
    if (got) out += fn(path.id, got.m, got.p);
  }
  return out;
}

// The key point marks as their own layer under the events chip (lane 13.3), one order below
// events, so the ticks, the beads and the datablocks sit above the marks. The layer does not read
// ctx.t: the state is CSS from `--kt` and the root `--t` (board.css), so its string changes only
// on an edit, a camera move, a focus or a layer change. The time-independent work (positions,
// titles, projection, declutter, glyphs) sits in KP_CACHE.
register({
  id: 'keypoints',
  label: 'Key points',
  order: 69,
  chip: null,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'derived', 'cam', 'focus', 'thumb', 'layers'],
  draw(ctx) {
    if (ctx.thumb || ctx.layers.events === false) return '';
    return eachThreat(ctx, (id, m, p) => {
      const dim = ctx.dim(id);
      let out = '';
      for (let i = 0; i < m.marks.length; i++) {
        const mk = m.marks[i]!;
        out += mk.head + dim + mk.body + p.glyph[i]! + '</g>';
      }
      return out;
    });
  },
});

// The current key point per threat (lane 13.3): the latest mark at or before the cursor, as the
// halo and a copy of its glyph in the accent, over the static marks. Reads ctx.t; its string
// changes only when some threat's current mark changes. Nothing with time off.
register({
  id: 'keypoints-now',
  label: 'Current key point',
  order: 69.5,
  chip: null,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: ['scene', 'derived', 'cam', 't', 'focus', 'thumb', 'layers'],
  draw(ctx) {
    const t = ctx.t;
    if (t == null || ctx.thumb || ctx.layers.events === false) return '';
    return eachThreat(ctx, (id, m, p) => {
      const marks = m.marks;
      let cur = -1;
      for (let i = 0; i < marks.length; i++)
        if (marks[i]!.t <= t && (cur < 0 || marks[i]!.t >= marks[cur]!.t)) cur = i;
      if (cur < 0) return '';
      const stage = marks[cur]!.stage;
      return (
        '<g class="kp kp-now kp-' +
        stage +
        ctx.dim(id) +
        '" data-k="keypoint-now" data-id="' +
        esc(id) +
        '" data-stage="' +
        stage +
        '"><circle cx="' +
        r1(p.x[cur]!) +
        '" cy="' +
        r1(p.y[cur]!) +
        '" r="6" class="kp-halo"></circle>' +
        p.glyph[cur]! +
        '</g>'
      );
    });
  },
});

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
        // ahead of the track datablocks (p 1): the mockup never culls an event label (F-02)
        ctx.label({
          p: 0.5,
          id: e.id,
          box: ctx.sym.textBox(lx, ly, e.label, 11.5),
          svg: ctx.sym.label(lx, ly, e.label, 'evl' + dim),
        });
      }
    }
    return out;
  },
});
