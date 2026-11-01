// Board render, legacy 44-render.js one to one: compose the camera and the layers, the hit list,
// the card render. The legacy chart (render.chart) belongs to the strip lane and is not here.
// The port is literal, so the legacy names stay (elev, axon, profile for the record).
//
// Added to legacy:
// - `opts.derived` is required: the board does not derive. The caller passes a DerivedView.
// - The result carries `fragments`, one per layer that ran: { layerId, svg, inputs }. `svg` is the
//   layer's `<g class="ly ly-ID">` group (or '' when it drew nothing); `inputs` lists the ctx
//   fields it reads, so a caller can rewrite only the layers whose inputs changed.
// - `opts.only` runs a subset of layers (a tick render). Labels then sees only their candidates.
// - Every hit carries `key`, the v6 UUID of the object (null for a raid hull).
// - Units are per call (no global mode): `view.units`, default 'nav' as the record reads.
import type { Pt3 } from '../engine/geo';
import type { ElevationMode, Units } from '../state/ui';
import { cameras, type Cam, type CamView } from './cameras';
import { makeUnits } from './format';
import { bounds as geoBounds, type Bounds } from './geo';
import {
  defaultLayers,
  list,
  type Ctx,
  type CtxField,
  type Ghost,
  type LabelCand,
  type Placing,
  type Ruler,
} from './layers';
import './layers/index';
import { S, clamp } from './svg';
import { symbols } from './symbols';
import type { CamKind, CardRec, DerivedView, Hit, Scene, Sel, Size } from './types';

const NS = 'http://www.w3.org/2000/svg';

export type BoardView = {
  proj?: CamKind;
  yaw?: number;
  pitch?: number;
  ref?: string;
  bounds?: Bounds;
  zoom?: number;
  px?: number;
  py?: number;
  units?: Units;
  layers?: Partial<Record<string, boolean>>;
  t?: number | null;
  sel?: Sel | null;
  hover?: Sel | null;
  focus?: string[];
  placing?: Placing | null;
  ruler?: Ruler | null;
  snap?: boolean;
  hoverT?: number | null;
  elevationMode?: ElevationMode;
  path?: string | null;
};

export type RenderOpts = {
  derived: DerivedView;
  thumb?: boolean;
  edit?: boolean;
  ghost?: Ghost | null;
  /** Run only these layer ids (in registry order). */
  only?: readonly string[];
};

export type Fragment = { layerId: string; svg: string; inputs: readonly CtxField[] };
export type RenderResult = { svg: string; cam: Cam; hits: Hit[]; fragments: Fragment[] };

const keyMemo = new WeakMap<Scene, Map<string, string>>();

/** Display id to key over every keyed record of the scene. */
function keysOf(record: Scene): Map<string, string> {
  let m = keyMemo.get(record);
  if (m) return m;
  m = new Map();
  const sc = record.scene;
  for (const list of [sc.systems, sc.volumes, sc.paths, sc.planes, sc.aircraft, record.events]) {
    for (const r of list || []) if (!m.has(r.id)) m.set(r.id, r.key);
  }
  keyMemo.set(record, m);
  return m;
}

function makeCtx(
  record: Scene,
  derived: DerivedView,
  cam: Cam,
  view: BoardView,
  opts: RenderOpts,
  layers: Record<string, boolean | undefined>,
): Ctx {
  const t = view.t == null ? null : view.t;
  const ref = view.ref || 'asset';
  const sel: Sel = view.sel || { kind: null, id: null, i: null };
  const hover: Sel = view.hover || { kind: null, id: null, i: null };
  const focus = view.focus || [];
  const fset: Record<string, true> = {};
  const fpaths: Record<string, true> = {};
  focus.forEach((id) => (fset[id] = true));
  (record.events || []).forEach((e) => {
    if (fset[e.id] && e.path) fpaths[e.path] = true;
  });
  const origin: Pt3 =
    typeof derived.originAt === 'function'
      ? derived.originAt(ref, null, t)
      : derived.origin || { x: 0, y: 0, z: 0 };
  const u = makeUnits(view.units || record.units || 'nav');
  const keys = keysOf(record);
  const hits: Hit[] = [];
  const labels: LabelCand[] = [];
  const ctx: Ctx = {
    profile: record,
    scene: record.scene,
    derived,
    cam,
    t,
    sel,
    hover,
    focus,
    layers,
    units: u.mode,
    thumb: !!opts.thumb,
    edit: !!opts.edit && !opts.thumb,
    placing: view.placing || null,
    ruler: view.ruler || null,
    snap: view.snap !== false,
    ghost: opts.ghost || null,
    hoverT: view.hoverT == null ? null : view.hoverT,
    ref,
    origin,
    S,
    sym: symbols,
    u,
    dim(id) {
      if (!focus.length || (id != null && (fset[id] || fpaths[id]))) return '';
      return ' dim';
    },
    cls(id) {
      if (id != null && sel.id === id) return ' sel';
      if (id != null && hover.id === id) return ' hov';
      return '';
    },
    hits,
    labels,
    labelsOn: true,
    hit(h) {
      hits.push({
        ...h,
        key: h.key !== undefined ? h.key : h.kind === 'group' ? null : (keys.get(h.id) ?? null),
      });
    },
    // label candidate: { p: priority (0 first), box: {x0,y0,x1,y1}, svg, always, id }
    label(c) {
      c.n = labels.length;
      labels.push(c);
    },
  };
  return ctx;
}

/** Legacy render.scene(record, view, size, opts) → { svg, cam, hits }, plus fragments. */
export function scene(
  record: Scene,
  view: BoardView | null | undefined,
  size: Size | null | undefined,
  opts: RenderOpts,
): RenderResult {
  const v = view || {};
  const sz = size || { W: 900, H: 600 };
  const derived = opts.derived;
  const sc = record.scene;
  const kind: CamKind = v.proj === 'elev' || v.proj === 'axon' ? v.proj : 'plan';
  const layers: Record<string, boolean | undefined> = Object.assign(
    defaultLayers(),
    v.layers || {},
  );
  const camView: CamView = {
    yaw: v.yaw,
    pitch: v.pitch,
    ref: v.ref || 'asset',
    bounds: v.bounds || geoBounds(sc),
    zoom: v.zoom,
    px: v.px,
    py: v.py,
    elevationMode: v.elevationMode,
    path: v.path,
  };
  const cam = cameras.get(kind).setup(sc, derived, sz, camView, { thumb: !!opts.thumb });
  const ctx = makeCtx(record, derived, cam, v, opts, layers);
  const only = opts.only ? new Set(opts.only) : null;
  let body = '';
  const fragments: Fragment[] = [];
  for (const L of list()) {
    if (L.cameras.indexOf(cam.kind) < 0) continue;
    if (only && !only.has(L.id)) continue;
    if (L.id === 'handles' && !ctx.edit) continue;
    let on = L.chip == null || (layers[L.id] == null ? L.defaultOn : !!layers[L.id]);
    // the tracks layer also draws the target TSPI cross (chip 8) when Tracks is off
    if (L.id === 'tracks' && !on && layers.target) on = true;
    if (L.id === 'labels') ctx.labelsOn = on && !ctx.thumb;
    else if (!on) continue;
    const s = L.draw(ctx);
    const g = s ? '<g class="ly ly-' + L.id + '">' + s + '</g>' : '';
    body += g;
    fragments.push({ layerId: L.id, svg: g, inputs: L.inputs });
  }
  const svg = S(
    'svg',
    {
      xmlns: NS,
      viewBox: '0 0 ' + sz.W + ' ' + sz.H,
      width: sz.W,
      height: sz.H,
      preserveAspectRatio: cam.preserveAspectRatio,
      class: 'board' + (opts.thumb ? ' thumb' : '') + (ctx.edit ? ' edit' : ''),
      'data-proj': cam.kind,
      role: 'img',
      'aria-label':
        kind === 'plan'
          ? 'Board in plan'
          : kind === 'elev'
            ? 'Board in elevation'
            : 'Board in axonometric',
    },
    body,
  );
  return { svg, cam, hits: ctx.hits, fragments };
}

/** Legacy render.card(record, cd, size, thumb), with the derived view passed in. */
export function card(
  record: Scene,
  derived: DerivedView,
  cd: CardRec | null | undefined,
  size?: Size | null,
  thumb?: boolean,
): string {
  const sz = size || { W: 300, H: 160 };
  let view: BoardView;
  if (!cd) {
    view = {
      proj: 'plan',
      yaw: -35,
      pitch: 55,
      ref: 'asset',
      layers: defaultLayers(),
      focus: [],
      t: null,
    };
  } else {
    const c = cd.cam;
    view = {
      proj: (c && c.proj) || 'plan',
      yaw: c && c.yaw,
      pitch: c && c.pitch,
      ref: (c && c.ref) || 'asset',
      elevationMode: c && c.elevationMode,
      layers: Object.assign(defaultLayers(), cd.layers || {}),
      focus: cd.focus || [],
      t: cd.t == null ? null : cd.t,
    };
    if (c && c.zoom != null && view.proj !== 'axon')
      Object.assign(view, framePan(record, derived, view, c, sz, !!thumb));
  }
  return scene(record, view, sz, { derived, thumb: !!thumb, edit: false }).svg;
}

/**
 * The zoom and pan that draw a card's stored frame at this size (lane 11.F, F-02): the world point
 * at the middle of the fitted view plus the card's centre goes to the middle of the render, as
 * Build's card.open does on the board (features/build/cards/cards.ts panFor). 3D keeps its fit.
 */
function framePan(
  record: Scene,
  derived: DerivedView,
  view: BoardView,
  c: CardRec['cam'],
  sz: Size,
  thumb: boolean,
): { zoom: number; px: number; py: number } {
  const zoom = c.zoom!;
  const ctr = c.centre || { x: 0, y: 0 };
  const kind: CamKind = view.proj === 'elev' ? 'elev' : 'plan';
  const at = (z: number) =>
    cameras.get(kind).setup(
      record.scene,
      derived,
      sz,
      {
        yaw: view.yaw,
        pitch: view.pitch,
        ref: view.ref || 'asset',
        bounds: geoBounds(record.scene),
        zoom: z,
        px: 0,
        py: 0,
        elevationMode: view.elevationMode,
      },
      { thumb },
    );
  const fit = at(1).unproject(sz.W / 2, sz.H / 2);
  if (!fit) return { zoom, px: 0, py: 0 };
  const cam = at(zoom);
  const w =
    'r' in fit ? { a: fit.r + ctr.x, b: fit.z + ctr.y } : { a: fit.x + ctr.x, b: fit.y + ctr.y };
  const s = kind === 'elev' && cam.projectRZ ? cam.projectRZ(w.a, w.b) : cam.project(w.a, w.b, 0);
  return { zoom, px: sz.W / 2 - s[0]!, py: sz.H / 2 - s[1]! };
}

// ---------------------------------------------------------------- hit test
function segDist(px: number, py: number, seg: number[][]): number {
  let best = Infinity;
  for (let i = 0; i < seg.length; i++) {
    const a = seg[i]!;
    const b = seg[i + 1] || seg[i]!;
    const dx = b[0]! - a[0]!;
    const dy = b[1]! - a[1]!;
    const L = dx * dx + dy * dy;
    const f = L > 0 ? clamp(((px - a[0]!) * dx + (py - a[1]!) * dy) / L, 0, 1) : 0;
    best = Math.min(best, Math.hypot(px - (a[0]! + f * dx), py - (a[1]! + f * dy)));
  }
  return best;
}
function inPoly(px: number, py: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (
      a[1]! > py !== b[1]! > py &&
      px < ((b[0]! - a[0]!) * (py - a[1]!)) / (b[1]! - a[1]!) + a[0]!
    )
      inside = !inside;
  }
  return inside;
}
function hitDist(h: Hit, sx: number, sy: number): number {
  if (h.seg) return segDist(sx, sy, h.seg);
  if (h.poly) return inPoly(sx, sy, h.poly) ? 0 : segDist(sx, sy, h.poly.concat([h.poly[0]!]));
  return Math.max(0, Math.hypot(sx - h.sx, sy - h.sy) - (h.r || 0));
}

/** Nearest within tol, handles before objects; on a tie the later (upper) hit wins. */
export function hitTest(
  hits: readonly Hit[] | null | undefined,
  sx: number,
  sy: number,
  tol?: number,
): Hit | null {
  const tl = tol == null ? 7 : tol;
  let bestH: Hit | null = null;
  let dH = Infinity;
  let bestO: Hit | null = null;
  let dO = Infinity;
  for (const h of hits || []) {
    const d = hitDist(h, sx, sy);
    if (d > tl) continue;
    if (h.handle) {
      if (d <= dH) {
        dH = d;
        bestH = h;
      }
    } else if (d <= dO) {
      dO = d;
      bestO = h;
    }
  }
  return bestH || bestO;
}

export const render = { scene, card, hitTest };
