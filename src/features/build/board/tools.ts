// Board tools: legacy/js/45-tools.js (placement, drags, nudge, anchor, ruler, zoom, pan) on the
// MVP document. The legacy record is the scene (src/board/scene toScene); edits go to the v6
// document through `find` by key, one undo step each, a drag through the document drag API.
// Readout text (legacy `readout(store, text)`) goes to the board store's `readout` line; toasts
// to the shell toast.
import type { Draft } from 'immer';
import {
  AREA_DEFAULTS,
  AREA_LABELS,
  SENSOR_DEFAULTS,
  EFFECTOR_DEFAULTS,
  DEFAULT_PK,
  defaultSensorModel,
  archetypeById,
  NODE_DEFAULTS,
} from '../../../domain/catalog';
import type {
  AreaKind,
  EffectorKind,
  NodeKind,
  SensorKind,
  Vignette,
  Waypoint,
} from '../../../domain/types';
import { newKey, nextId } from '../../../domain/ids';
import { bearingTo, posAt, type Pt3 } from '../../../engine/geo';
import type { Derived } from '../../../engine/derived';
import type { Cam } from '../../../board/cameras';
import { bounds as geoBounds } from '../../../board/geo';
import { makeUnits } from '../../../board/format';
import { clamp } from '../../../board/svg';
import type { Ghost, RulerEnd } from '../../../board/layers';
import type { Hit, Scene, Sel } from '../../../board';
import { find } from '../../../commands/select';
import { useDocument } from '../../../state/document';
import { useUi, type ArmedItem } from '../../../state/ui';
import { showToast } from '../../shell/toastStore';
import { addEventAt } from '../palette/pick';
import type { BoardArmed } from '../palette/store';
import { boardDerived, boardScene } from './derived';
import {
  cruiseHeight,
  dragLabel,
  isElev,
  legText,
  snap,
  snapBead,
  snapStep,
  tAtPoint,
  tAtRZ,
  type Modifiers,
  type PlanPt,
  type World,
} from './snap';
import { useBoard, type BoardPlacing } from './store';

const hyp = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const DEG = 180 / Math.PI;
const round1 = (v: number) => Math.round(v * 10) / 10;
const bearing = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  bearingTo(from, to);

function signed(v: number, d = 1): string {
  return (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(d);
}
function signedClock(s: number): string {
  const a = Math.round(Math.abs(s));
  const m = Math.floor(a / 60);
  const ss = a % 60;
  return (s >= 0 ? '+' : '-') + m + ':' + (ss < 10 ? '0' : '') + ss;
}

type Pt = { x: number; y: number; z?: number; hold?: number };
function dedupe<T extends { x: number; y: number }>(pts: readonly T[]): T[] {
  const out: T[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

/** The open document with its scene and derived, or null. */
export function current(): { doc: Vignette; rec: Scene; d: Derived } | null {
  const doc = useDocument.getState().doc;
  if (!doc) return null;
  return { doc, rec: boardScene(doc), d: boardDerived(doc) };
}

function displayIds(doc: Vignette): string[] {
  const out: string[] = [];
  for (const list of [
    doc.threats,
    doc.sensors,
    doc.effectors,
    doc.nodes,
    doc.areas,
    doc.planes,
    doc.events,
  ])
    for (const x of list) out.push(x.id);
  return out;
}

/** Legacy readout(store, text, level): the hint line under the board. */
export function readout(text: string, level: 'info' | 'warn' = 'info'): void {
  useBoard.getState().set({ readout: text ? { text, level } : null });
}

const edit = (label: string, recipe: (d: Draft<Vignette>) => void) =>
  useDocument.getState().edit(label, recipe);
const select = (keys: string[], selIndex: { key: string; i: number } | null = null) => {
  useBoard.getState().set({ selIndex });
  useUi.getState().setSelection(keys);
};

// ---------------------------------------------------------------- selection mapping

/** The key a hit selects, with the index the key cannot carry (an area vertex). */
export function keyOfHit(rec: Scene, hit: Hit): { key: string; i: number | null } | null {
  if (hit.kind === 'path' && hit.i != null) {
    const p = rec.scene.paths.find((x) => x.id === hit.id);
    const w = p && p.pts[hit.i];
    return w ? { key: w.key, i: null } : null;
  }
  if (!hit.key) return null;
  if (hit.kind === 'volume' && hit.i != null) return { key: hit.key, i: hit.i };
  return { key: hit.key, i: null };
}

/** Legacy `Sel {kind, id, i}` for a key. Waypoint keys resolve to their path and index. */
export function selFromKey(
  rec: Scene,
  key: string | null | undefined,
  selIndex: { key: string; i: number } | null = null,
): Sel {
  if (!key) return { kind: null, id: null, i: null };
  const i = selIndex && selIndex.key === key ? selIndex.i : null;
  const sc = rec.scene;
  for (const p of sc.paths) {
    if (p.key === key) return { kind: 'path', id: p.id, i };
    const k = p.pts.findIndex((w) => w.key === key);
    if (k >= 0) return { kind: 'path', id: p.id, i: k };
  }
  const s = sc.systems.find((x) => x.key === key);
  if (s) return { kind: 'system', id: s.id, i: null };
  const v = sc.volumes.find((x) => x.key === key);
  if (v) return { kind: 'volume', id: v.id, i };
  const pl = sc.planes.find((x) => x.key === key);
  if (pl) return { kind: 'plane', id: pl.id, i: null };
  const e = rec.events.find((x) => x.key === key);
  if (e) return { kind: 'event', id: e.id, i: null };
  return { kind: null, id: null, i: null };
}

/** The current legacy selection from `ui.selectedKeys` (first key) and the board index. */
export function currentSel(rec: Scene): Sel {
  const keys = useUi.getState().selectedKeys;
  return selFromKey(rec, keys[0], useBoard.getState().selIndex);
}

/** The key of a path display id. */
export function pathKey(rec: Scene, pathId: string): string | null {
  const p = rec.scene.paths.find((x) => x.id === pathId);
  return p ? p.key : null;
}

// ---------------------------------------------------------------- placement

/** Legacy startPlacing from the MVP armed item (library rail) or the palette's board item. */
export function placingFor(armed: ArmedItem | BoardArmed | null): BoardPlacing | null {
  if (!armed) return null;
  if (armed.group === 'threat') return { kind: 'aircraft', arch: armed.type, pts: [] };
  if (armed.group === 'sensor' || armed.group === 'effector' || armed.group === 'node')
    return { kind: 'system', sysKind: armed.kind, group: armed.group, pts: [] };
  if (armed.group === 'area') return { kind: 'volume', volKind: armed.kind, pts: [] };
  if (armed.group === 'event') return { kind: 'event', evType: armed.type, pts: [] };
  return null;
}

function addSystem(placing: BoardPlacing, world: PlanPt): string | null {
  const cur = current();
  if (!cur) return null;
  const { doc, d } = cur;
  const x = Math.round(world.x);
  const y = Math.round(world.y);
  const ids = displayIds(doc);
  const key = newKey();
  let id = '';
  let range = 0;
  const brgTo = (fov: number) => (fov < 360 ? Math.round(bearing({ x, y }, d.origin)) : 0);
  const el = { minRangeM: 0, elMinDeg: -5, elMaxDeg: 85 };
  if (placing.group === 'sensor') {
    const kind = placing.sysKind as SensorKind;
    const def = SENSOR_DEFAULTS[kind];
    id = nextId(kind, ids);
    range = def.rangeM;
    edit('add ' + id, (c) => {
      c.sensors.push({
        key,
        id,
        kind,
        x,
        y,
        z: 2,
        rangeM: def.rangeM,
        ...el,
        fovDeg: def.fovDeg,
        bearingDeg: brgTo(def.fovDeg),
        model: defaultSensorModel(kind, def.rangeM),
        entered: {},
      });
    });
  } else if (placing.group === 'effector') {
    const kind = placing.sysKind as EffectorKind;
    const def = EFFECTOR_DEFAULTS[kind];
    id = nextId(kind, ids);
    range = def.rangeM;
    edit('add ' + id, (c) => {
      c.effectors.push({
        key,
        id,
        kind,
        x,
        y,
        z: 2,
        rangeM: def.rangeM,
        fovDeg: def.fovDeg,
        bearingDeg: brgTo(def.fovDeg),
        timeToEffectS: def.timeToEffectS,
        pk: DEFAULT_PK,
        entered: {},
      });
    });
  } else {
    const kind = placing.sysKind as NodeKind;
    id = nextId(kind, ids);
    edit('add ' + id, (c) => {
      c.nodes.push({
        key,
        id,
        kind,
        x,
        y,
        z: 0,
        rangeM: 0,
        fovDeg: NODE_DEFAULTS[kind].fovDeg,
        bearingDeg: NODE_DEFAULTS[kind].bearingDeg,
      });
    });
  }
  useBoard.getState().set({ placing: null });
  select([key]);
  readout(range > 0 ? dragLabel('range', { id }, range, useUi.getState().units) : id + ' added.');
  showToast(id + ' added.');
  return key;
}

function addVolume(kind: AreaKind, pts: readonly (readonly [number, number])[]): string | null {
  const cur = current();
  if (!cur) return null;
  const key = newKey();
  const id = nextId(kind, displayIds(cur.doc));
  const rounded = pts.map((q) => [Math.round(q[0]), Math.round(q[1])] as [number, number]);
  edit('add ' + id, (c) => {
    c.areas.push({
      key,
      id,
      kind,
      label: AREA_LABELS[kind],
      pts: rounded,
      zMinM: 0,
      zMaxM: AREA_DEFAULTS[kind].zMaxM,
    });
  });
  useBoard.getState().set({ placing: null });
  select([key]);
  showToast(id + ' added.');
  return key;
}

// nearest path and its time to a board point; plan {x,y} or elev {r,z}
export function nearestPath(
  rec: Scene,
  d: Derived,
  world: World,
  cam: Cam | null | undefined,
  preferId: string | null,
): { pathId: string; t: number } | null {
  let best: { pathId: string; t: number } | null = null;
  let bd = Infinity;
  const o = (cam && cam.origin) || d.origin;
  for (const p of rec.scene.paths) {
    const tm = d.timed[p.id];
    if (!tm || !tm.length) continue;
    let t: number;
    let dist: number;
    if (isElev(world)) {
      t = tAtRZ(tm, world.r, world.z, o);
      const pos = posAt(tm, t);
      dist = Math.hypot(hyp(pos.x, pos.y, o.x, o.y) - world.r, pos.z - world.z);
    } else {
      t = tAtPoint(tm, world.x, world.y);
      const pos = posAt(tm, t);
      dist = hyp(pos.x, pos.y, world.x, world.y);
    }
    if (p.id === preferId && isElev(world)) dist = -1;
    if (dist < bd) {
      bd = dist;
      best = { pathId: p.id, t };
    }
  }
  return best;
}

export type PlaceOpts = { dbl?: boolean; rect?: { a: PlanPt; b: PlanPt } | null; cam?: Cam | null };

/** Legacy tools.placeAt. Returns true when the placement finished. */
export function placeAt(world: World, opts: PlaceOpts = {}): boolean {
  const board = useBoard.getState();
  const p = board.placing;
  const cur = current();
  if (!p || !world || !cur) return false;
  const units = useUi.getState().units;
  if (p.kind === 'aircraft') {
    if (isElev(world)) {
      readout('Press P to add in Plan.');
      return false;
    }
    // Add waypoints on a selected threat (mockup line 438): each click appends one waypoint to that
    // path at its last height, as one undo step; the placement stays armed until it finishes.
    if (p.pathId) return appendTo(p.pathId, world, opts.dbl === true);
    const pts = ((p.pts || []) as Pt[]).concat([
      { x: Math.round(world.x), y: Math.round(world.y), z: cruiseHeight(p.arch), hold: 0 },
    ]);
    board.set({ placing: { ...p, pts } });
    if (opts.dbl && dedupe(pts).length >= 2) return finishPlacing();
    const dp = dedupe(pts);
    if (dp.length >= 2) {
      const a = dp[dp.length - 2]!;
      const b = dp[dp.length - 1]!;
      readout(legText({ kind: 'aircraft', arch: p.arch, pts: [a] }, b, units));
    }
    return false;
  }
  if (p.kind === 'system') {
    if (isElev(world)) {
      readout('Press P to add in Plan.');
      return false;
    }
    addSystem(p, world);
    return true;
  }
  if (p.kind === 'volume') {
    if (isElev(world)) {
      readout('Press P to add in Plan.');
      return false;
    }
    const kind = p.volKind as AreaKind;
    if (opts.rect) {
      const A = opts.rect.a;
      const B = opts.rect.b;
      addVolume(kind, [
        [A.x, A.y],
        [B.x, A.y],
        [B.x, B.y],
        [A.x, B.y],
      ]);
      return true;
    }
    const vp = ((p.pts || []) as Pt[]).concat([
      { x: Math.round(world.x), y: Math.round(world.y), z: 0, hold: 0 },
    ]);
    board.set({ placing: { ...p, pts: vp } });
    if (opts.dbl) return finishPlacing();
    return false;
  }
  if (p.kind === 'event') {
    const sel = currentSel(cur.rec);
    const np = nearestPath(cur.rec, cur.d, world, opts.cam, sel.kind === 'path' ? sel.id : null);
    const tk = np ? pathKey(cur.rec, np.pathId) : null;
    if (!np || !tk) {
      readout('Add a threat first.', 'warn');
      return false;
    }
    board.set({ placing: null });
    addEventAt(tk, np.t, p.evType as Parameters<typeof addEventAt>[2]);
    return true;
  }
  return false;
}

/** One waypoint appended to the threat `pathId` (its display id). A press on the last waypoint adds
 *  nothing, so the two clicks of a double click add one point. */
function appendTo(pathId: string, world: PlanPt, dbl: boolean): boolean {
  const cur = current();
  const threat = cur ? cur.doc.threats.find((t) => t.id === pathId) : undefined;
  if (!threat) {
    useBoard.getState().set({ placing: null });
    return false;
  }
  const x = Math.round(world.x);
  const y = Math.round(world.y);
  const last = threat.path[threat.path.length - 1];
  if (!last || last.x !== x || last.y !== y) {
    const z = last ? last.z : cruiseHeight(threat.type);
    edit('add waypoint to ' + pathId, (c) => {
      const t = c.threats.find((q) => q.key === threat.key);
      if (t) t.path.push({ key: newKey(), x, y, z, holdS: 0 });
    });
    select([threat.key], { key: threat.key, i: threat.path.length });
    if (last) {
      const units = useUi.getState().units;
      const a = { x: last.x, y: last.y, z: last.z, hold: 0 };
      readout(legText({ kind: 'aircraft', arch: threat.type, pts: [a] }, { x, y, z }, units));
    }
  }
  return dbl ? finishPlacing() : false;
}

/** Legacy tools.finishPlacing. */
export function finishPlacing(): boolean {
  const board = useBoard.getState();
  const p = board.placing;
  const cur = current();
  if (!p || !cur) return false;
  if (p.kind === 'aircraft' && p.pathId) {
    // the waypoints went into the path as they were placed: the placement only ends
    board.set({ placing: null });
    readout('');
    return true;
  }
  if (p.kind === 'aircraft') {
    const pts = dedupe((p.pts || []) as Pt[]);
    if (!pts.length) {
      board.set({ placing: null });
      return false;
    }
    const type = p.arch || '';
    const key = newKey();
    const id = nextId('threat', displayIds(cur.doc));
    const path: Waypoint[] = pts.map((q) => ({
      key: newKey(),
      x: q.x,
      y: q.y,
      z: q.z || 0,
      holdS: q.hold || 0,
    }));
    edit('add ' + id, (c) => {
      c.threats.push({ key, id, type, path, group: '' });
    });
    board.set({ placing: null });
    select([key]);
    showToast(id + ' added.');
    // the leg text of the last placement step is transient: clear it when the route ends
    if (pts.length === 1) readout(id + ' needs two waypoints.', 'warn');
    else readout('');
    return true;
  }
  if (p.kind === 'volume') {
    const vp = dedupe((p.pts || []) as Pt[]);
    if (vp.length < 3) {
      readout('Add three or more points.');
      return false;
    }
    addVolume(
      p.volKind as AreaKind,
      vp.map((q) => [q.x, q.y] as [number, number]),
    );
    return true;
  }
  board.set({ placing: null });
  return false;
}

// Escape: a route with two or more points ends; everything else leaves no half object
export function cancelPlacing(): boolean {
  const board = useBoard.getState();
  const p = board.placing;
  if (!p) return false;
  if (p.kind === 'aircraft' && dedupe((p.pts || []) as Pt[]).length >= 2) return finishPlacing();
  board.set({ placing: null });
  return true;
}

// ---------------------------------------------------------------- drags

/** True when the press at `world` lies outside the glyph hit of a system (its radius plus the
 *  touch tolerance), so the press was on the ring. */
function offGlyph(hit: Hit, world: World, cam: Cam): boolean {
  const s = isElev(world)
    ? cam.projectRZ
      ? cam.projectRZ(world.r, world.z)
      : null
    : cam.project(world.x, world.y, 0);
  if (!s) return false;
  return Math.hypot(s[0] - hit.sx, s[1] - hit.sy) > (hit.r || 7) + 14;
}

function affectedPaths(kind: string, id: string, rec: Scene): string[] {
  if (kind === 'path') return [id];
  if (kind === 'event') {
    const e = rec.events.find((x) => x.id === id);
    return e ? [e.path] : [];
  }
  if (kind === 'system' || kind === 'volume') return rec.scene.paths.map((p) => p.id);
  return [];
}

export type Delta = { id: string; lines: string[] };
type DeltaSource = Pick<Derived, 'first' | 'window'>;

/** Legacy deltasOf: per affected path, first-see, window and margin changes; the largest by size. */
export function deltasOf(
  d0: DeltaSource | null,
  d1: DeltaSource | null,
  paths: readonly string[],
  units = useUi.getState().units,
): { deltas: Delta[]; largest: string | null } {
  const out: Delta[] = [];
  let largest: string | null = null;
  let lv = 0;
  if (!d0 || !d1) return { deltas: out, largest: null };
  const U = makeUnits(units);
  for (const pid of paths) {
    const parts: string[] = [];
    const f0 = (d0.first && d0.first[pid]) || {};
    const f1 = (d1.first && d1.first[pid]) || {};
    const ids = Object.keys(f0);
    for (const k of Object.keys(f1)) if (ids.indexOf(k) < 0) ids.push(k);
    for (const sid of ids) {
      const a = f0[sid];
      const b = f1[sid];
      let txt: string | null = null;
      let v = 0;
      if (a && b && Math.abs(b.t - a.t) >= 0.05) {
        v = b.t - a.t;
        txt = 'first see ' + sid + ' ' + signed(v) + ' s';
      } else if (a && !b) {
        v = 9999;
        txt = 'first see ' + sid + ' none';
      } else if (!a && b) {
        v = 9999;
        txt = 'first see ' + sid + ' ' + U.t(b.t);
      }
      if (txt) {
        parts.push(txt);
        if (Math.abs(v) > lv) {
          lv = Math.abs(v);
          largest = pid + ' ' + txt;
        }
      }
    }
    const w0 = d0.window && d0.window[pid];
    const w1 = d1.window && d1.window[pid];
    if (
      w0 &&
      w1 &&
      w0.geometric != null &&
      w1.geometric != null &&
      Math.abs(w1.geometric - w0.geometric) >= 0.05
    ) {
      const dw = w1.geometric - w0.geometric;
      parts.push('window ' + signed(dw) + ' s');
      if (Math.abs(dw) > lv) {
        lv = Math.abs(dw);
        largest = pid + ' window ' + signed(dw) + ' s';
      }
    }
    if (
      w0 &&
      w1 &&
      w0.margin != null &&
      w1.margin != null &&
      Math.abs(w1.margin - w0.margin) >= 0.5
    ) {
      const dm = w1.margin - w0.margin;
      parts.push('margin ' + signedClock(dm));
      if (Math.abs(dm) > lv) {
        lv = Math.abs(dm);
        largest = pid + ' margin ' + signedClock(dm);
      }
    }
    if (parts.length) out.push({ id: pid, lines: parts });
  }
  return { deltas: out, largest };
}

const LABELS: Record<string, string> = {
  range: 'set {id} range',
  arcEnd0: 'set {id} sector',
  arcEnd1: 'set {id} sector',
  arcMid: 'set {id} bearing',
  elRay0: 'set {id} elevation limits',
  elRay1: 'set {id} elevation limits',
  hold: 'set {id} hold',
  insert: 'add point to {id}',
  edge: 'add vertex to {id}',
  top: 'set {id} top',
  line: 'move {id}',
};

export type DragMove = { label: string; deltas: Delta[]; largest: string | null };
export type DragHandle = {
  kind: string;
  id: string;
  role: string;
  label: string;
  /** The index the drag edits (after an insert or edge splice). */
  i: number | null;
  move(w: World | null, mods?: Modifiers): DragMove;
  end(): void;
  cancel(): void;
};

type SysLike = {
  x: number;
  y: number;
  z: number;
  rangeM: number;
  fovDeg?: number;
  bearingDeg?: number;
  elMinDeg?: number;
  elMaxDeg?: number;
  minRangeM?: number;
};
function sysOf(c: Draft<Vignette>, key: string): SysLike | null {
  const f = find(c, key);
  if (!f) return null;
  if (f.kind === 'sensor' || f.kind === 'effector' || f.kind === 'node') return f.value as SysLike;
  return null;
}

// returns null for a hit that has no drag (a path line, a group)
export function beginDrag(hit: Hit | null, world: World | null, cam: Cam): DragHandle | null {
  if (!hit || !world) return null;
  const cur = current();
  if (!cur) return null;
  const { rec } = cur;
  const kind = hit.kind === 'wp' ? 'path' : hit.kind === 'vertex' ? 'volume' : hit.kind;
  const id = hit.id;
  let role = hit.role || 'centre';
  // A press on a system's ring resolves to the system's centre hit (the ring carries data-k but
  // no role). Off the glyph, it is the range drag (principle 2.3: drag a ring to set range), not
  // a centre move that jumps the system to the cursor.
  if (kind === 'system' && role === 'centre' && offGlyph(hit, world, cam)) role = 'range';
  let i: number | null = hit.i == null ? null : Number(hit.i);
  const key = hit.key || '';
  if (!key) return null;
  const sc = rec.scene;
  const obj =
    kind === 'system'
      ? sc.systems.find((x) => x.id === id)
      : kind === 'path'
        ? sc.paths.find((x) => x.id === id)
        : kind === 'volume'
          ? sc.volumes.find((x) => x.id === id)
          : kind === 'plane'
            ? sc.planes.find((x) => x.id === id)
            : kind === 'event'
              ? rec.events.find((x) => x.id === id)
              : null;
  if (!obj) return null;
  if (kind === 'path' && i == null && role !== 'insert') return null;
  if (kind === 'event') role = 'bead';
  if (kind === 'plane' && !isElev(world)) return null;

  const d0 = cur.d;
  // the sticky camera bounds; compute and keep them when none are set yet
  let b0 = useBoard.getState().bounds;
  if (!b0) {
    b0 = geoBounds(sc);
    useBoard.getState().set({ bounds: b0 });
  }
  const ext = b0.ext;
  const step = snapStep(ext);
  const label0 = (LABELS[role] || 'move {id}').replace('{id}', id);
  const units = useUi.getState().units;
  const ref = useBoard.getState().ref || 'asset';
  const start = world;
  const docStore = useDocument.getState();
  const affected = affectedPaths(kind, id, rec);

  docStore.beginDrag(label0);
  const ghost: Ghost = { rec, derived: { timed: d0.timed } };
  useBoard.getState().set({ ghost, ghostLabel: null });
  let done = false;

  // the pre-drag record of the dragged object, for the arc end and volume move roles
  let orig: { bearing: number; fov: number; pts: [number, number][] } = {
    bearing: 0,
    fov: 0,
    pts: [],
  };
  if (kind === 'system') {
    const s = obj as (typeof sc.systems)[number];
    orig = { bearing: s.bearing, fov: s.fov, pts: [] };
  } else if (kind === 'volume') {
    orig = {
      bearing: 0,
      fov: 0,
      pts: (obj as (typeof sc.volumes)[number]).pts.map((q) => [q[0], q[1]]),
    };
  }

  // insert and edge add their point once, at drag start
  if (kind === 'path' && role === 'insert') {
    const p = obj as (typeof sc.paths)[number];
    const a = p.pts[i!];
    const b = p.pts[i! + 1];
    if (!a || !b) {
      docStore.cancelDrag();
      useBoard.getState().set({ ghost: null });
      return null;
    }
    const mid: Waypoint = {
      key: newKey(),
      x: Math.round((a.x + b.x) / 2),
      y: Math.round((a.y + b.y) / 2),
      z: Math.round((a.z + b.z) / 2),
      holdS: 0,
    };
    const at = i! + 1;
    docStore.updateDrag((c) => {
      const f = find(c, key);
      if (f && f.kind === 'threat') f.value.path.splice(at, 0, mid);
    });
    i = at;
    role = 'centre';
  } else if (kind === 'volume' && role === 'edge') {
    const v = obj as (typeof sc.volumes)[number];
    const va = v.pts[i!]!;
    const vb = v.pts[(i! + 1) % v.pts.length]!;
    const vm: [number, number] = [Math.round((va[0] + vb[0]) / 2), Math.round((va[1] + vb[1]) / 2)];
    const at = i! + 1;
    docStore.updateDrag((c) => {
      const f = find(c, key);
      if (f && f.kind === 'area') f.value.pts.splice(at, 0, vm);
    });
    i = at;
    role = 'vertex';
    orig.pts.splice(at, 0, vm);
  }

  const o: Pt3 = d0.origin;
  function sysR(sy: { x: number; y: number }) {
    const oo = (cam && cam.origin) || o;
    return hyp(sy.x, sy.y, oo.x, oo.y);
  }

  function apply(c: Draft<Vignette>, w: World, mods: Modifiers, snapOn: boolean): string {
    const sceneNow = boardScene(c as Vignette);
    const ctx = {
      derived: d0,
      scene: sceneNow.scene,
      cam,
      modifiers: mods,
      exclude: id,
      ext,
      units,
      from: null as PlanPt | null,
    };
    const snP = (pt: PlanPt, from?: PlanPt | null) => {
      if (!snapOn) return { x: pt.x, y: pt.y, label: null as string | null };
      ctx.from = from || null;
      return snap(pt, ctx);
    };
    const snE = (pt: { r: number; z: number }) =>
      snapOn ? snap(pt, ctx) : { r: pt.r, z: pt.z, label: null };
    if (kind === 'system') {
      const sy = sysOf(c, key);
      if (!sy) return '';
      const sid = { id };
      if (role === 'centre') {
        if (isElev(w)) {
          if (ref !== id) return '';
          sy.z = Math.max(0, Math.round(snE(w).z));
          return dragLabel('z', sid, sy.z, units);
        }
        const q = snP(w);
        sy.x = Math.round(q.x);
        sy.y = Math.round(q.y);
        const lbl = dragLabel(
          'centre',
          sid,
          { r: hyp(sy.x, sy.y, o.x, o.y), brg: bearing(o, sy) },
          units,
        );
        return q.label ? lbl + ' ' + q.label : lbl;
      }
      if (role === 'range') {
        const dist = isElev(w)
          ? ref === id
            ? Math.hypot(w.r, w.z - sy.z)
            : Math.abs(w.r - sysR(sy))
          : hyp(w.x, w.y, sy.x, sy.y);
        const rv = snapOn ? Math.max(step, Math.round(dist / step) * step) : Math.round(dist);
        sy.rangeM = Math.max(rv, (sy.minRangeM || 0) + 1);
        return dragLabel('range', sid, sy.rangeM, units);
      }
      if (role === 'arcEnd0' || role === 'arcEnd1' || role === 'arcMid') {
        if (isElev(w) || sy.fovDeg == null) return '';
        const bp = bearing(sy, w);
        if (role === 'arcMid') {
          sy.bearingDeg = Math.round(bp);
          return dragLabel('arcMid', sid, sy.bearingDeg, units);
        }
        const e0 = orig.bearing - orig.fov / 2;
        const e1 = orig.bearing + orig.fov / 2;
        let fov: number;
        if (role === 'arcEnd1') {
          fov = (((bp - e0) % 360) + 360) % 360;
          fov = clamp(Math.round(fov), 1, 359);
          sy.fovDeg = fov;
          sy.bearingDeg = Math.round((((e0 + fov / 2) % 360) + 360) % 360);
        } else {
          fov = (((e1 - bp) % 360) + 360) % 360;
          fov = clamp(Math.round(fov), 1, 359);
          sy.fovDeg = fov;
          sy.bearingDeg = Math.round((((e1 - fov / 2) % 360) + 360) % 360);
        }
        return dragLabel(role, sid, sy.fovDeg, units);
      }
      if (role === 'elRay0' || role === 'elRay1') {
        if (!isElev(w) || sy.elMinDeg == null || sy.elMaxDeg == null) return '';
        const rel = ref === id ? w.r : w.r - sysR(sy);
        const ang = Math.round(Math.atan2(w.z - (sy.z || 0), Math.max(Math.abs(rel), 1e-6)) * DEG);
        if (role === 'elRay0') sy.elMinDeg = clamp(ang, -90, sy.elMaxDeg - 1);
        else sy.elMaxDeg = clamp(ang, sy.elMinDeg + 1, 90);
        return dragLabel(role, sid, role === 'elRay0' ? sy.elMinDeg : sy.elMaxDeg, units);
      }
      return '';
    }
    if (kind === 'path') {
      const f = find(c, key);
      if (!f || f.kind !== 'threat' || i == null) return '';
      const pa = f.value;
      const pt = pa.path[i];
      if (!pt) return '';
      if (role === 'hold') {
        if (mods.sx == null || mods.sy == null) return '';
        const sp = cam.project(pt.x, pt.y, pt.z);
        const dpx = Math.hypot(mods.sx - sp[0], mods.sy - sp[1]);
        pt.holdS = Math.max(0, Math.round((dpx - 9) / 12) * 10);
        return dragLabel('hold', pt as unknown as { id?: string }, pt.holdS, units);
      }
      if (isElev(w)) {
        pt.z = Math.max(0, Math.round(snE(w).z));
        return dragLabel('z', { id: id + ' point ' + (i + 1) }, pt.z, units);
      }
      const prev = i > 0 ? pa.path[i - 1] : null;
      const qq = snP(w, prev ? { x: prev.x, y: prev.y } : null);
      pt.x = Math.round(qq.x);
      pt.y = Math.round(qq.y);
      const lbl = dragLabel(
        'centre',
        { id: id + ' point ' + (i + 1) },
        { r: hyp(pt.x, pt.y, o.x, o.y), brg: bearing(o, pt) },
        units,
      );
      return qq.label ? lbl + ' ' + qq.label : lbl;
    }
    if (kind === 'volume') {
      const f = find(c, key);
      if (!f || f.kind !== 'area') return '';
      const vo = f.value;
      if (role === 'top') {
        if (!isElev(w)) return '';
        vo.zMaxM = Math.max(0, Math.round(snE(w).z));
        return 'top ' + dragLabel('top', { id }, vo.zMaxM, units);
      }
      if (isElev(w)) return '';
      if (role === 'vertex' && i != null) {
        const vq = snP(w);
        vo.pts[i] = [Math.round(vq.x), Math.round(vq.y)];
        return id + ' vertex ' + (i + 1) + (vq.label ? ' ' + vq.label : '');
      }
      const s0 = start as PlanPt;
      let dx = w.x - s0.x;
      let dy = w.y - s0.y;
      if (snapOn) {
        dx = Math.round(dx / step) * step;
        dy = Math.round(dy / step) * step;
      }
      vo.pts = orig.pts.map(
        (q) => [Math.round(q[0] + dx), Math.round(q[1] + dy)] as [number, number],
      );
      return 'move ' + id + ' ' + makeUnits(units).h(Math.hypot(dx, dy));
    }
    if (kind === 'plane') {
      const pl = c.planes.find((x) => x.key === key);
      if (!pl || !isElev(w)) return '';
      pl.zM = Math.max(0, Math.round(snapOn ? Math.round(w.z / 5) * 5 : w.z));
      return dragLabel('line', { id }, pl.zM, units);
    }
    if (kind === 'event') {
      const ev = c.events.find((x) => x.key === key);
      const evRec = rec.events.find((x) => x.id === id);
      const tm = evRec && d0.timed[evRec.path];
      if (!ev || !evRec || !tm) return '';
      const t = isElev(w) ? tAtRZ(tm, w.r, w.z, (cam && cam.origin) || o) : tAtPoint(tm, w.x, w.y);
      const sb = snapOn ? snapBead(evRec.path, t, d0) : { t };
      ev.tS = round1(sb.t);
      if (sb.system) {
        const sys = sc.systems.find((x) => x.id === sb.system);
        if (sys) ev.sensorKey = sys.key;
      }
      return sb.label ? id + ' ' + sb.label : dragLabel('bead', { id }, ev.tS, units);
    }
    return '';
  }

  const finish = () => {
    useBoard.getState().set({ ghost: null, ghostLabel: null, dragLabel: null });
  };

  const drag: DragHandle = {
    kind,
    id,
    role,
    label: label0,
    get i() {
      return i;
    },
    move(w, mods) {
      if (done || !w) return { label: '', deltas: [], largest: null };
      const m = mods || {};
      const snapOn = useBoard.getState().snap !== false && !m.alt;
      let lbl = '';
      useDocument.getState().updateDrag((c) => {
        lbl = apply(c, w, m, snapOn) || '';
      });
      const now = useDocument.getState().doc;
      const dl = deltasOf(d0, now ? boardDerived(now) : null, affected, units);
      useBoard.getState().set({ ghostLabel: lbl });
      return { label: lbl, deltas: dl.deltas, largest: dl.largest };
    },
    end() {
      if (done) return;
      done = true;
      useDocument.getState().endDrag();
      finish();
    },
    cancel() {
      if (done) return;
      done = true;
      useDocument.getState().cancelDrag();
      finish();
    },
  };
  return drag;
}

// ---------------------------------------------------------------- nudge

/** Legacy tools.nudge: move the selection by `dx, dy` snap steps (a plane by 10 m, an event by 1 s). */
export function nudge(dx: number, dy: number): boolean {
  const cur = current();
  if (!cur) return false;
  const sel = currentSel(cur.rec);
  if (!sel.kind || !sel.id) return false;
  const step = snapStep(geoBounds(cur.rec.scene).ext);
  const mx = dx * step;
  const my = dy * step;
  const i = sel.i == null ? null : Number(sel.i);
  const key = useUi.getState().selectedKeys[0]!;
  let ok = false;
  edit('move ' + sel.id, (c) => {
    if (sel.kind === 'system') {
      const o = sysOf(c, key);
      if (o) {
        o.x += mx;
        o.y += my;
        ok = true;
      }
    } else if (sel.kind === 'path') {
      const f = find(c, key);
      const t = f && f.kind === 'threat' ? f.value : f && f.kind === 'waypoint' ? f.threat : null;
      if (t) {
        t.path.forEach((p, k) => {
          if (i == null || i === k) {
            p.x += mx;
            p.y += my;
          }
        });
        ok = true;
      }
    } else if (sel.kind === 'volume') {
      const f = find(c, key);
      if (f && f.kind === 'area') {
        f.value.pts = f.value.pts.map((p, k) =>
          i == null || i === k ? [p[0] + mx, p[1] + my] : p,
        );
        ok = true;
      }
    } else if (sel.kind === 'plane') {
      const o = c.planes.find((x) => x.key === key);
      if (o) {
        o.zM = Math.max(0, o.zM + dy * 10);
        ok = true;
      }
    } else if (sel.kind === 'event') {
      const o = c.events.find((x) => x.key === key);
      if (o) {
        o.tS = Math.max(0, round1(o.tS + dx));
        ok = true;
      }
    }
  });
  return ok;
}

// ---------------------------------------------------------------- ruler

/** Legacy anchor: the path position at t, then a system, then a waypoint, within 14 px. */
export function anchor(world: PlanPt, cam: Cam | null | undefined): RulerEnd {
  const cur = current();
  const out: RulerEnd = { x: world.x, y: world.y };
  if (!cur) return out;
  const { rec, d } = cur;
  const t = useUi.getState().tS;
  const tol = 14 / ((cam && cam.scale) || 1);
  let best: RulerEnd | null = null;
  let bd = tol;
  if (t != null && d.timed) {
    for (const p of rec.scene.paths) {
      const tm = d.timed[p.id];
      if (!tm || !tm.length) continue;
      const pos = posAt(tm, t);
      const dd = hyp(pos.x, pos.y, world.x, world.y);
      if (dd <= bd) {
        bd = dd;
        best = { x: pos.x, y: pos.y, kind: 'path', id: p.id };
      }
    }
  }
  if (best) return best;
  for (const s of rec.scene.systems) {
    const dd = hyp(s.x, s.y, world.x, world.y);
    if (dd <= bd) {
      bd = dd;
      best = { x: s.x, y: s.y, kind: 'system', id: s.id };
    }
  }
  if (best) return best;
  for (const p of rec.scene.paths) {
    p.pts.forEach((q) => {
      const dd = hyp(q.x, q.y, world.x, world.y);
      if (dd <= bd) {
        bd = dd;
        best = { x: q.x, y: q.y, kind: 'wp', id: p.id };
      }
    });
  }
  return best || out;
}

export const ruler = {
  toggle(): boolean {
    const b = useBoard.getState();
    if (b.ruler) {
      b.set({ ruler: null });
      return false;
    }
    b.set({ placing: null, ruler: { a: null, b: null, done: false } });
    return true;
  },
  // press-drag draws a ruler in one gesture; a click with no movement places the first end and the next click the second
  start(world: World | null, cam: Cam | null | undefined): void {
    if (!world || isElev(world)) return;
    const b = useBoard.getState();
    const r = b.ruler;
    if (r && r.a && !r.done) {
      b.set({ ruler: { a: r.a, b: anchor(world, cam), done: false } });
      return;
    }
    const a = anchor(world, cam);
    b.set({ ruler: { a, b: { x: a.x, y: a.y }, done: false } });
  },
  move(world: World | null, cam: Cam | null | undefined): void {
    const b = useBoard.getState();
    const r = b.ruler;
    if (!r || !r.a || r.done || !world || isElev(world)) return;
    b.set({ ruler: { a: r.a, b: anchor(world, cam), done: false } });
  },
  end(world: World | null, cam: Cam | null | undefined): void {
    const b = useBoard.getState();
    const r = b.ruler;
    if (!r || !r.a) return;
    const bb = world && !isElev(world) ? anchor(world, cam) : r.b;
    const tol = 3 / ((cam && cam.scale) || 1);
    if (!bb || hyp(bb.x, bb.y, r.a.x, r.a.y) <= tol) {
      b.set({ ruler: { a: r.a, b: { x: r.a.x, y: r.a.y }, done: false } });
      return;
    }
    b.set({ ruler: { a: r.a, b: bb, done: true } });
  },
  clear(): void {
    useBoard.getState().set({ ruler: null });
  },
};

// ---------------------------------------------------------------- viewer zoom and pan (5.8)

export function zoom(
  factor: number,
  aboutSx?: number | null,
  aboutSy?: number | null,
  cam?: Cam | null,
): void {
  const b = useBoard.getState();
  const z = clamp(b.zoom * factor, 0.5, 8);
  const sx = aboutSx == null ? (cam && cam.W ? cam.W / 2 : 0) : aboutSx;
  const sy = aboutSy == null ? (cam && cam.H ? cam.H / 2 : 0) : aboutSy;
  const k = z / b.zoom;
  b.set({ zoom: z, px: sx - (sx - b.px) * k, py: sy - (sy - b.py) * k });
}

export function pan(dx: number, dy: number): void {
  const b = useBoard.getState();
  b.set({ px: b.px + dx, py: b.py + dy });
}

/** Legacy view.fit: the viewer transform back to identity (the camera fits the scene bounds). */
export function fit(): void {
  useBoard.getState().set({ zoom: 1, px: 0, py: 0, bounds: null });
}

/** The archetype of a placing, for tests and the ghost. */
export const archOf = archetypeById;
