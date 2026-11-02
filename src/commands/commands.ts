// Every command in spec section 8: the keys table and every right-click menu item.
// Map-position commands read ctx.pointer and say so with needsPointer. Commands that need a
// dialog value take `arg` and return without editing when it is missing.
import type { Draft } from 'immer';
import {
  AREA_DEFAULTS,
  AREA_KINDS,
  AREA_LABELS,
  DEFAULT_PK,
  defaultSensorModel,
  EFFECTOR_DEFAULTS,
  EFFECTOR_KINDS,
  NODE_DEFAULTS,
  NODE_KINDS,
  SENSOR_DEFAULTS,
  SENSOR_KINDS,
  SYSTEM_LABELS,
  THREAT_ARCHETYPES,
  archetypeById,
} from '../domain/catalog';
import { newKey, nextId, type IdKind } from '../domain/ids';
import type {
  Area,
  AreaKind,
  Effector,
  EffectorKind,
  Node,
  NodeKind,
  Sensor,
  SensorKind,
  Threat,
  Vignette,
  Waypoint,
} from '../domain/types';
import { nextStop, prevStop, stops } from '../engine';
import { previewOf } from '../state/document';
import { boardDerived } from '../features/build/board/derived';
import { actionSpan } from '../features/timeline/fit';
import type { Clip, MapPoint, Theme, Workspace } from '../state/ui';
import { libraryCommands } from '../features/library/commands';
import { boardCommands } from '../features/build/board/commands';
import { briefCommands } from '../features/brief/commands';
import { timelineCommands } from '../features/timeline/commands';
import { useBoard } from '../features/build/board/store';
import { LAYER_TOGGLES, setToggle, toggleOn } from '../features/build/bar/layers';
import { cardCommands } from '../features/build/cards/commands';
import { menuCommands } from '../features/build/menu/commands';
import { paletteCommands } from '../features/build/palette/commands';
import { railCommands } from '../features/build/rail/commands';
import { redidText, showToast, undidText } from '../features/shell/toastStore';
import { find, selected, type Found } from './select';
import { get, register, setMenuOrder } from './registry';
import type { AssetKind, Command, CommandContext, CommandOption } from './types';

// ---- rules ----

type Rule = (ctx: CommandContext) => true | string;
type FoundKind = Found['kind'];

const docOf = (ctx: CommandContext) => ctx.document.doc;
const selOf = (ctx: CommandContext, kinds?: readonly FoundKind[]) =>
  selected(docOf(ctx), ctx.ui.selectedKeys).filter((f) => !kinds || kinds.includes(f.kind));

const needDoc: Rule = (ctx) => (docOf(ctx) ? true : 'Open a profile first');
/** The reason a deferred command shows (plan phase 10, deferred list). */
const needPointer: Rule = (ctx) => (ctx.pointer ? true : 'Right-click the map first');
const needSel =
  (kinds: readonly FoundKind[] | undefined, what: string): Rule =>
  (ctx) =>
    selOf(ctx, kinds).length > 0 ? true : `Select ${what} first`;

function every(...rules: Rule[]): Rule {
  return (ctx) => {
    for (const r of rules) {
      const ok = r(ctx);
      if (ok !== true) return ok;
    }
    return true;
  };
}

const num = (arg: unknown): number | null =>
  typeof arg === 'number' && Number.isFinite(arg) ? arg : null;

const ASSETS: readonly FoundKind[] = ['threat', 'sensor', 'effector', 'node', 'area'];
const SYSTEMS: readonly FoundKind[] = ['sensor', 'effector'];

/** Delete refuses to leave a flight path with fewer than two waypoints (delete the threat instead). */
const keepsTwoWaypoints: Rule = (ctx) => {
  const sel = selOf(ctx);
  const gone = new Set(sel.map((f) => f.value.key));
  for (const f of sel) {
    if (f.kind !== 'waypoint' || gone.has(f.threat.key)) continue;
    if (f.threat.path.filter((w) => !gone.has(w.key)).length < 2)
      return 'A flight path needs two waypoints';
  }
  return true;
};

// ---- record helpers ----

function displayIds(d: Vignette): string[] {
  return [
    ...d.threats.map((x) => x.id),
    ...d.sensors.map((x) => x.id),
    ...d.effectors.map((x) => x.id),
    ...d.nodes.map((x) => x.id),
    ...d.areas.map((x) => x.id),
  ];
}

function idKindOf(c: Clip): IdKind {
  return c.group === 'threat' ? 'threat' : c.value.kind;
}

function anchorOf(c: Clip): MapPoint {
  if (c.group === 'threat') return { x: c.value.path[0]?.x ?? 0, y: c.value.path[0]?.y ?? 0 };
  if (c.group === 'area') {
    const n = c.value.pts.length || 1;
    return {
      x: c.value.pts.reduce((s, p) => s + p[0], 0) / n,
      y: c.value.pts.reduce((s, p) => s + p[1], 0) / n,
    };
  }
  return { x: c.value.x, y: c.value.y };
}

function toClip(f: Found): Clip | null {
  const value = JSON.parse(JSON.stringify(f.value));
  if (f.kind === 'waypoint') return null;
  return { group: f.kind, value } as Clip;
}

/** Insert a copy of each clip moved by (dx, dy), with new keys and ids. Returns the new keys. */
function insertCopies(
  d: Draft<Vignette>,
  clips: readonly Clip[],
  dx: number,
  dy: number,
): string[] {
  const keys: string[] = [];
  for (const c of clips) {
    const v = JSON.parse(JSON.stringify(c.value));
    v.key = newKey();
    v.id = nextId(idKindOf(c), displayIds(d as Vignette));
    keys.push(v.key);
    if (c.group === 'threat') {
      const t = v as Threat;
      t.path = t.path.map((w) => ({ ...w, key: newKey(), x: w.x + dx, y: w.y + dy }));
      d.threats.push(t);
    } else if (c.group === 'area') {
      const a = v as Area;
      a.pts = a.pts.map(([x, y]) => [x + dx, y + dy]);
      d.areas.push(a);
    } else {
      v.x += dx;
      v.y += dy;
      if (c.group === 'sensor') d.sensors.push(v as Sensor);
      else if (c.group === 'effector') d.effectors.push(v as Effector);
      else d.nodes.push(v as Node);
    }
  }
  return keys;
}

const PASTE_OFFSET_M = 50;

function hypot(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

/** Index to insert p into a ring of points with the least added perimeter. */
function bestRingIndex(pts: readonly (readonly [number, number])[], p: MapPoint): number {
  let best = pts.length;
  let cost = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as readonly [number, number];
    const b = pts[(i + 1) % pts.length] as readonly [number, number];
    const c =
      hypot(a[0], a[1], p.x, p.y) + hypot(p.x, p.y, b[0], b[1]) - hypot(a[0], a[1], b[0], b[1]);
    if (c < cost) {
      cost = c;
      best = i + 1;
    }
  }
  return best;
}

/** Index to insert p into an open path with the least added length (appending counts). */
function bestPathIndex(path: readonly Waypoint[], p: MapPoint): number {
  const last = path[path.length - 1];
  let best = path.length;
  let cost = last ? hypot(last.x, last.y, p.x, p.y) : 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as Waypoint;
    const b = path[i + 1] as Waypoint;
    const c = hypot(a.x, a.y, p.x, p.y) + hypot(p.x, p.y, b.x, b.y) - hypot(a.x, a.y, b.x, b.y);
    if (c < cost) {
      cost = c;
      best = i + 1;
    }
  }
  return best;
}

/** The time a threat is nearest the point, over every flight path. */
function timeNear(v: Vignette, p: MapPoint): number | null {
  const pv = previewOf(v);
  let bestT: number | null = null;
  let bestD = Infinity;
  for (const t of Object.values(pv.threats)) {
    const w = t.timed;
    for (let i = 0; i < w.length; i++) {
      const a = w[i];
      if (!a) continue;
      const b = w[i + 1];
      if (!b) {
        const dd = hypot(a.x, a.y, p.x, p.y);
        if (dd < bestD) [bestD, bestT] = [dd, a.t0];
        continue;
      }
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy;
      const f =
        len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)) : 0;
      const dd = hypot(a.x + f * vx, a.y + f * vy, p.x, p.y);
      if (dd < bestD) [bestD, bestT] = [dd, a.t1 + f * (b.t0 - a.t1)];
    }
  }
  return bestT;
}

function endTime(ctx: CommandContext): number {
  const doc = docOf(ctx);
  return doc ? previewOf(doc).tmaxS : 0;
}

function setTimeTo(ctx: CommandContext, t: number) {
  if (!ctx.ui.timeOn) ctx.ui.setTimeOn(true);
  ctx.ui.setTime(t);
}

function stepTime(ctx: CommandContext, ds: number) {
  setTimeTo(ctx, Math.min(Math.max(0, ctx.ui.tS + ds), Math.max(endTime(ctx), 0)));
}

/** Apply `fn` to each selected record of the given kinds, inside one undo step. */
function editSelected(
  ctx: CommandContext,
  label: string,
  kinds: readonly FoundKind[],
  fn: (f: Found) => void,
) {
  const keys = selOf(ctx, kinds).map((f) => f.value.key);
  ctx.document.edit(label, (d) => {
    for (const k of keys) {
      const f = find(d, k);
      if (f && kinds.includes(f.kind)) fn(f);
    }
  });
}

// ---- add here ----

/** Sentence case inside a label: 'Acoustic' becomes 'acoustic', '3D radar' and 'RF' stay. */
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

/** The default archetype when Add threat here gets no `arg`. */
export const DEFAULT_THREAT_TYPE = 'g1-quad-isr';

/** The 13 archetypes, grouped by UAS group, for the Add threat here submenu. */
export const THREAT_OPTIONS: readonly CommandOption[] = THREAT_ARCHETYPES.map((a) => ({
  value: a.id,
  label: a.name,
  group: `Group ${a.group}`,
}));

const SYSTEM_EL = { minRangeM: 0, elMinDeg: -5, elMaxDeg: 85 };

function addSensor(d: Draft<Vignette>, kind: SensorKind, p: MapPoint): string {
  const def = SENSOR_DEFAULTS[kind];
  const s: Sensor = {
    key: newKey(),
    id: nextId(kind, displayIds(d as Vignette)),
    kind,
    x: p.x,
    y: p.y,
    z: 2,
    rangeM: def.rangeM,
    ...SYSTEM_EL,
    fovDeg: def.fovDeg,
    bearingDeg: 0,
    model: defaultSensorModel(kind, def.rangeM),
    entered: {},
  };
  d.sensors.push(s);
  return s.key;
}

function addEffector(d: Draft<Vignette>, kind: EffectorKind, p: MapPoint): string {
  const def = EFFECTOR_DEFAULTS[kind];
  const e: Effector = {
    key: newKey(),
    id: nextId(kind, displayIds(d as Vignette)),
    kind,
    x: p.x,
    y: p.y,
    z: 2,
    rangeM: def.rangeM,
    fovDeg: def.fovDeg,
    bearingDeg: 0,
    timeToEffectS: def.timeToEffectS,
    pk: DEFAULT_PK,
    entered: {},
  };
  d.effectors.push(e);
  return e.key;
}

function addNode(d: Draft<Vignette>, kind: NodeKind, p: MapPoint): string {
  const n: Node = {
    key: newKey(),
    id: nextId(kind, displayIds(d as Vignette)),
    kind,
    x: p.x,
    y: p.y,
    z: 0,
    rangeM: 0,
    fovDeg: NODE_DEFAULTS[kind].fovDeg,
    bearingDeg: NODE_DEFAULTS[kind].bearingDeg,
  };
  d.nodes.push(n);
  return n.key;
}

const AREA_HALF_M = 100;

function addArea(d: Draft<Vignette>, kind: AreaKind, p: MapPoint): string {
  const h = AREA_HALF_M;
  const a: Area = {
    key: newKey(),
    id: nextId(kind, displayIds(d as Vignette)),
    kind,
    label: AREA_LABELS[kind],
    pts: [
      [p.x - h, p.y - h],
      [p.x + h, p.y - h],
      [p.x + h, p.y + h],
      [p.x - h, p.y + h],
    ],
    zMinM: 0,
    zMaxM: AREA_DEFAULTS[kind].zMaxM,
  };
  d.areas.push(a);
  return a.key;
}

function addThreat(d: Draft<Vignette>, type: string, p: MapPoint): string {
  const arch = archetypeById(type);
  const t: Threat = {
    key: newKey(),
    id: nextId('threat', displayIds(d as Vignette)),
    type,
    path: [{ key: newKey(), x: p.x, y: p.y, z: arch ? arch.altM[0] : 100, holdS: 0 }],
    group: '',
  };
  d.threats.push(t);
  return t.key;
}

function addHere(
  id: string,
  label: string,
  submenu: string,
  add: (d: Draft<Vignette>, p: MapPoint, arg?: unknown) => string,
  after?: (ctx: CommandContext) => void,
  options?: readonly CommandOption[],
): Command {
  return {
    ...(options ? { options } : {}),
    id,
    label,
    group: 'map',
    kinds: ['map'],
    submenu: `Add here > ${submenu}`,
    needsPointer: true,
    when: every(needDoc, needPointer),
    run: (ctx, arg) => {
      const p = ctx.pointer;
      if (!p) return;
      let key = '';
      ctx.document.edit(label.replace(' here', ''), (d) => {
        key = add(d, p, arg);
      });
      if (key) ctx.ui.setSelection([key]);
      after?.(ctx);
    },
  };
}

const ADD_HERE: Command[] = [
  addHere(
    'map.add.threat',
    'Add threat here',
    'Threats',
    (d, p, arg) => {
      const type = typeof arg === 'string' && archetypeById(arg) ? arg : DEFAULT_THREAT_TYPE;
      return addThreat(d, type, p);
    },
    (ctx) => ctx.ui.setTool('path'),
    THREAT_OPTIONS,
  ),
  ...SENSOR_KINDS.map((k) =>
    addHere(`map.add.${k}`, `Add ${lower(SYSTEM_LABELS[k])} here`, 'Sensors', (d, p) =>
      addSensor(d, k, p),
    ),
  ),
  ...EFFECTOR_KINDS.map((k) =>
    addHere(`map.add.${k}`, `Add ${lower(SYSTEM_LABELS[k])} here`, 'Effectors', (d, p) =>
      addEffector(d, k, p),
    ),
  ),
  ...NODE_KINDS.map((k) =>
    addHere(`map.add.${k}`, `Add ${lower(SYSTEM_LABELS[k])} here`, 'C2 and TSPI', (d, p) =>
      addNode(d, k, p),
    ),
  ),
  ...AREA_KINDS.map((k) =>
    addHere(`map.add.${k}`, `Add ${AREA_LABELS[k].toLowerCase()} here`, 'Areas', (d, p) =>
      addArea(d, k, p),
    ),
  ),
];

// ---- workspaces and later-lane keys ----

const BUILD: readonly Workspace[] = ['build'];
const BUILD_BRIEF: readonly Workspace[] = ['build', 'brief'];

/**
 * Commands active in every workspace. Every other command without its own `workspaces` is a
 * Build command; `registerCommands` scopes it so.
 */
const EVERYWHERE = new Set([
  'help.palette',
  'edit.undo',
  'edit.redo',
  'edit.escape',
  'view.units',
  'help.shortcuts',
  'view.theme',
  'file.export',
  'file.import',
  'profile.new',
  'profile.newFromTemplate',
  'library.export',
]);

const THEME_NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
/** Legacy theme cycle: auto, light, dark. */
export const nextTheme = (t: Theme): Theme => THEME_NEXT[t];

/**
 * The board's cancel (drag, then placing, then ruler), set by the Build workspace when it loads.
 * Injected so this file does not import the board view (the board's menu imports this file).
 */
let boardCancel: () => boolean = () => false;
export function setBoardCancel(fn: () => boolean): void {
  boardCancel = fn;
}

const needAny: Rule = (ctx) => {
  const d = docOf(ctx);
  return d &&
    d.threats.length + d.sensors.length + d.effectors.length + d.nodes.length + d.areas.length
    ? true
    : 'Add an asset first';
};

/** Tab and Shift+Tab: the next or previous record of the selected kind; the first asset when none. */
function cycleKind(ctx: CommandContext, dir: 1 | -1) {
  const d = docOf(ctx);
  if (!d) return;
  const cur = selOf(ctx)[0];
  const lists: Record<Exclude<FoundKind, 'waypoint'>, readonly { key: string }[]> = {
    threat: d.threats,
    sensor: d.sensors,
    effector: d.effectors,
    node: d.nodes,
    area: d.areas,
  };
  if (!cur) {
    const first = [d.threats, d.sensors, d.effectors, d.nodes, d.areas].find((l) => l.length);
    if (first?.[0]) ctx.ui.setSelection([first[0].key]);
    return;
  }
  const list = cur.kind === 'waypoint' ? cur.threat.path : lists[cur.kind];
  const i = list.findIndex((x) => x.key === cur.value.key);
  const next = list[(i + dir + list.length) % list.length];
  if (next) ctx.ui.setSelection([next.key]);
}

/** Shift+1 to Shift+5: the Build bar's five layer toggles by number (spec section 8, Keys). */
const LAYER_CHIPS: Command[] = LAYER_TOGGLES.map((t, i) => ({
  id: `layer.chip${i + 1}`,
  label: `${t.label} layer on or off`,
  group: 'view',
  shortcut: `Shift+${i + 1}`,
  workspaces: BUILD_BRIEF,
  when: () => true,
  run: () => setToggle(t, !toggleOn(useBoard.getState().layers, t)),
}));

const COMMANDS: Command[] = [
  // keys table
  {
    id: 'help.palette',
    label: 'Command palette',
    group: 'help',
    shortcut: 'Mod+K',
    when: () => true,
    run: (ctx) => ctx.ui.setPaletteOpen(!ctx.ui.paletteOpen),
  },
  {
    id: 'edit.undo',
    label: 'Undo',
    group: 'edit',
    shortcut: 'Mod+Z',
    when: (ctx) => (ctx.document.canUndo ? true : 'Nothing to undo'),
    run: (ctx) => {
      const label = ctx.document.past[ctx.document.past.length - 1]?.label;
      ctx.document.undo();
      showToast(undidText(label));
    },
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    group: 'edit',
    shortcut: 'Shift+Mod+Z',
    when: (ctx) => (ctx.document.canRedo ? true : 'Nothing to redo'),
    run: (ctx) => {
      const label = ctx.document.future[0]?.label;
      ctx.document.redo();
      showToast(redidText(label));
    },
  },
  {
    id: 'edit.delete',
    label: 'Delete',
    group: 'edit',
    shortcut: 'Delete',
    kinds: ['threat', 'waypoint', 'sensor', 'effector', 'node', 'area'],
    when: every(needDoc, needSel(undefined, 'something'), keepsTwoWaypoints),
    run: (ctx) => {
      const keys = new Set(selOf(ctx).map((f) => f.value.key));
      // Hypotheses cite a measure ID, not an asset key, so a delete cannot leave one dangling.
      ctx.document.edit('Delete', (d) => {
        d.threats = d.threats.filter((t) => !keys.has(t.key));
        for (const t of d.threats) t.path = t.path.filter((w) => !keys.has(w.key));
        d.sensors = d.sensors.filter((x) => !keys.has(x.key));
        d.effectors = d.effectors.filter((x) => !keys.has(x.key));
        d.nodes = d.nodes.filter((x) => !keys.has(x.key));
        d.areas = d.areas.filter((x) => !keys.has(x.key));
        const truth = d.report.truth;
        if (truth.stationKeys.some((k) => keys.has(k)))
          truth.stationKeys = truth.stationKeys.filter((k) => !keys.has(k));
      });
      ctx.ui.setSelection([]);
    },
  },
  {
    id: 'edit.escape',
    label: 'Cancel or clear selection',
    group: 'edit',
    shortcut: 'Escape',
    when: () => true,
    // The one Escape owner (legacy 90-app.js order). Each press undoes one layer: an open dialog,
    // the palette or the sheet; then the board's drag, placing or ruler (`cancel()` from the
    // board view); a document drag; an armed item or a tool; the selection; last the loop range.
    // The board stage handles Escape itself while it has focus and a gesture to cancel; it calls
    // preventDefault, so this binding does not fire a second time.
    run: (ctx) => {
      const ui = ctx.ui;
      if (ui.dialog) ui.setDialog(null);
      else if (ui.paletteOpen) ui.setPaletteOpen(false);
      else if (ui.shortcutsOpen) ui.setShortcutsOpen(false);
      else if (boardCancel()) return;
      else if (ctx.document.drag) ctx.document.cancelDrag();
      else if (ui.drawing) ui.signalPath('cancel');
      else if (ui.tool !== 'select' || ui.armed || ui.measureFrom) {
        ui.setTool('select');
        ui.setArmed(null);
        ui.setMeasureFrom(null);
      } else if (ui.selectedKeys.length) ui.setSelection([]);
      else if (ui.loop) ui.setLoop(null);
    },
  },
  {
    id: 'map.finishPath',
    label: 'Finish flight path',
    group: 'map',
    shortcut: 'Enter',
    when: (ctx) => (ctx.ui.drawing ? true : 'Draw a flight path first'),
    run: (ctx) => ctx.ui.signalPath('finish'),
  },
  {
    id: 'time.playPause',
    label: 'Play or pause',
    group: 'time',
    shortcut: 'Space',
    when: needDoc,
    run: (ctx) => ctx.ui.setPlaying(!ctx.ui.playing),
  },
  {
    id: 'time.back1',
    label: 'Step back 1 s',
    group: 'time',
    shortcut: 'ArrowLeft',
    when: needDoc,
    run: (ctx) => stepTime(ctx, -1),
  },
  {
    id: 'time.forward1',
    label: 'Step forward 1 s',
    group: 'time',
    shortcut: 'ArrowRight',
    when: needDoc,
    run: (ctx) => stepTime(ctx, 1),
  },
  {
    id: 'time.back10',
    label: 'Step back 10 s',
    group: 'time',
    shortcut: 'Shift+ArrowLeft',
    when: needDoc,
    run: (ctx) => stepTime(ctx, -10),
  },
  {
    id: 'time.forward10',
    label: 'Step forward 10 s',
    group: 'time',
    shortcut: 'Shift+ArrowRight',
    when: needDoc,
    run: (ctx) => stepTime(ctx, 10),
  },
  {
    id: 'edit.duplicate',
    label: 'Duplicate',
    group: 'edit',
    shortcut: 'Mod+D',
    kinds: ['threat', 'sensor', 'effector', 'node', 'area'],
    when: every(needDoc, needSel(ASSETS, 'an asset')),
    run: (ctx) => {
      const clips = selOf(ctx, ASSETS)
        .map(toClip)
        .filter((c): c is Clip => c !== null);
      let keys: string[] = [];
      ctx.document.edit('Duplicate', (d) => {
        keys = insertCopies(d, clips, PASTE_OFFSET_M, -PASTE_OFFSET_M);
      });
      ctx.ui.setSelection(keys);
    },
  },
  {
    id: 'edit.copy',
    label: 'Copy',
    group: 'edit',
    shortcut: 'Mod+C',
    when: every(needDoc, needSel(ASSETS, 'an asset')),
    run: (ctx) =>
      ctx.ui.setClipboard(
        selOf(ctx, ASSETS)
          .map(toClip)
          .filter((c): c is Clip => c !== null),
      ),
  },
  {
    id: 'edit.paste',
    label: 'Paste',
    group: 'edit',
    shortcut: 'Mod+V',
    when: every(needDoc, (ctx) => (ctx.ui.clipboard.length ? true : 'Copy something first')),
    run: (ctx) => {
      let keys: string[] = [];
      ctx.document.edit('Paste', (d) => {
        keys = insertCopies(d, ctx.ui.clipboard, PASTE_OFFSET_M, -PASTE_OFFSET_M);
      });
      ctx.ui.setSelection(keys);
    },
  },
  {
    id: 'view.fit',
    label: 'Fit view',
    group: 'view',
    shortcut: 'F',
    kinds: ['map'],
    when: needDoc,
    run: (ctx) => ctx.ui.requestFit(),
  },
  {
    id: 'map.measure',
    label: 'Measure tool',
    group: 'map',
    shortcut: 'M',
    when: needDoc,
    run: (ctx) => {
      ctx.ui.setMeasureFrom(null);
      ctx.ui.setTool(ctx.ui.tool === 'measure' ? 'select' : 'measure');
    },
  },
  {
    id: 'view.units',
    label: 'Toggle units',
    group: 'view',
    shortcut: 'U',
    when: () => true,
    run: (ctx) => ctx.ui.setUnits(ctx.ui.units === 'nav' ? 'si' : 'nav'),
  },
  {
    id: 'view.plan',
    label: 'Plan view',
    group: 'view',
    shortcut: '1',
    when: needDoc,
    run: (ctx) => ctx.ui.setView('plan'),
  },
  {
    id: 'view.elevation',
    label: 'Elevation view',
    group: 'view',
    shortcut: '2',
    // The board's Elevation defaults to From asset (legacy), which needs no selected path.
    when: needDoc,
    run: (ctx) => ctx.ui.setView('elevation'),
  },
  {
    id: 'view.elevationMode',
    label: 'Elevation mode',
    group: 'view',
    workspaces: BUILD,
    when: needDoc,
    run: (ctx) => {
      const mode = ctx.ui.elevationMode === 'fromAsset' ? 'alongPath' : 'fromAsset';
      ctx.ui.setElevationMode(mode);
      showToast(mode === 'fromAsset' ? 'Elevation from asset' : 'Elevation along path');
    },
  },
  {
    id: 'help.shortcuts',
    label: 'Shortcut sheet',
    group: 'help',
    shortcut: '?',
    when: () => true,
    run: (ctx) => ctx.ui.setShortcutsOpen(!ctx.ui.shortcutsOpen),
  },
  {
    id: 'view.3d',
    label: '3D view',
    group: 'view',
    shortcut: '3',
    when: needDoc,
    run: (ctx) => ctx.ui.setView('3d'),
  },
  {
    id: 'time.start',
    label: 'Time to start',
    group: 'time',
    shortcut: 'Home',
    when: needDoc,
    run: (ctx) => {
      if (!ctx.ui.timeOn) ctx.ui.setTimeOn(true);
      ctx.ui.setTime(0);
    },
  },
  {
    id: 'time.end',
    label: 'Time to end',
    group: 'time',
    shortcut: 'End',
    when: needDoc,
    run: (ctx) => {
      if (!ctx.ui.timeOn) ctx.ui.setTimeOn(true);
      ctx.ui.setTime(Math.max(endTime(ctx), 0));
    },
  },
  {
    id: 'time.cursor',
    label: 'Time cursor',
    group: 'time',
    shortcut: 'T',
    workspaces: BUILD_BRIEF,
    when: needDoc,
    run: (ctx) => {
      const on = !ctx.ui.timeOn;
      ctx.ui.setTimeOn(on);
      showToast(on ? 'Time cursor on' : 'Time cursor off');
    },
  },
  {
    id: 'time.prevEvent',
    label: 'Previous key point',
    group: 'time',
    shortcut: '[',
    workspaces: BUILD_BRIEF,
    when: needDoc,
    run: (ctx) => {
      const doc = docOf(ctx)!;
      setTimeTo(ctx, prevStop(stops(doc, boardDerived(doc)), ctx.ui.tS));
    },
  },
  {
    id: 'time.nextEvent',
    label: 'Next key point',
    group: 'time',
    shortcut: ']',
    workspaces: BUILD_BRIEF,
    when: needDoc,
    run: (ctx) => {
      const doc = docOf(ctx)!;
      const d = boardDerived(doc);
      setTimeTo(ctx, nextStop(stops(doc, d), ctx.ui.tS, d.tmax));
    },
  },
  {
    id: 'edit.nextOfKind',
    label: 'Next object of the same kind',
    group: 'edit',
    shortcut: 'Tab',
    when: every(needDoc, needAny),
    run: (ctx) => cycleKind(ctx, 1),
  },
  {
    id: 'edit.prevOfKind',
    label: 'Previous object of the same kind',
    group: 'edit',
    shortcut: 'Shift+Tab',
    when: every(needDoc, needAny),
    run: (ctx) => cycleKind(ctx, -1),
  },
  {
    id: 'panel.inspector',
    label: 'Inspector open or closed',
    group: 'view',
    shortcut: 'I',
    when: () => true,
    run: (ctx) => ctx.ui.togglePanel('inspector'),
  },
  {
    // Legacy `90-app.js` panel.sides: both open unless either is, then both closed.
    id: 'panel.sides',
    label: 'Both side panels open or closed',
    group: 'view',
    shortcut: '\\',
    when: () => true,
    run: (ctx) => {
      const open = !(ctx.ui.panels.list || ctx.ui.panels.inspector);
      ctx.ui.setPanels({ list: open, inspector: open });
    },
  },
  ...LAYER_CHIPS,
  // Lanes 9.2.3 to 9.2.5: the rail adds, quick-add, the right-click items and the board keys.
  // They replace the stubs build.quickAdd, build.addSensor, build.addArea, build.addEvent,
  // build.formation, map.gridSnap, view.zoomIn and view.zoomOut (the card.* commands come from cards/).
  ...railCommands,
  ...paletteCommands,
  ...menuCommands,
  ...boardCommands,
  // Lane 10.3: Save as card (C) and the range reference cycle (view.ref).
  ...cardCommands,

  // file. New, New from template, Export library and the Library's `/` search come from the
  // Library (lane 9.1.4, review 9.1 F-19, F-20). `file.export` is "Export" (the dialog);
  // `library.export` is "Export library" (the file). Import is `file.import` only.
  ...libraryCommands,
  {
    id: 'file.export',
    label: 'Export',
    group: 'file',
    when: () => true,
    run: (ctx) => ctx.ui.setDialog('export'),
  },
  {
    id: 'file.import',
    label: 'Import',
    group: 'file',
    when: () => true,
    run: (ctx) => ctx.ui.setDialog('import'),
  },
  {
    id: 'view.theme',
    label: 'Theme: auto, light or dark',
    group: 'view',
    when: () => true,
    run: (ctx) => ctx.ui.setTheme(nextTheme(ctx.ui.theme)),
  },

  // Brief keys and commands (spec section 8), scoped to the Brief workspace (lane 10.4)
  ...briefCommands,
  // The strip's own menu items, in Build and Brief (lane 13.1; registered in lane 13.W).
  ...timelineCommands,

  // empty map
  ...ADD_HERE,
  {
    id: 'map.pasteHere',
    label: 'Paste here',
    group: 'map',
    kinds: ['map'],
    needsPointer: true,
    when: every(needDoc, needPointer, (ctx) =>
      ctx.ui.clipboard.length ? true : 'Copy something first',
    ),
    run: (ctx) => {
      const p = ctx.pointer;
      const first = ctx.ui.clipboard[0];
      if (!p || !first) return;
      const a = anchorOf(first);
      let keys: string[] = [];
      ctx.document.edit('Paste', (d) => {
        keys = insertCopies(d, ctx.ui.clipboard, p.x - a.x, p.y - a.y);
      });
      ctx.ui.setSelection(keys);
    },
  },
  {
    id: 'map.measureFrom',
    label: 'Measure from here',
    group: 'map',
    // The Measure tool with its start set here, so the menu shows the tool's key (review 7 1a).
    shortcutFrom: 'map.measure',
    kinds: ['map'],
    needsPointer: true,
    when: every(needDoc, needPointer),
    run: (ctx) => {
      if (!ctx.pointer) return;
      ctx.ui.setTool('measure');
      ctx.ui.setMeasureFrom({ x: ctx.pointer.x, y: ctx.pointer.y });
    },
  },
  {
    id: 'time.setHere',
    label: 'Set time here',
    group: 'time',
    kinds: ['map', 'timeline'],
    needsPointer: true,
    // On the timeline the pointer carries its time; on the board, the nearest threat time.
    when: every(
      needDoc,
      (ctx) => (ctx.pointer ? true : 'Right-click the timeline first'),
      (ctx) =>
        ctx.pointer?.tS != null || docOf(ctx)?.threats.length ? true : 'Add a threat first',
    ),
    run: (ctx) => {
      const p = ctx.pointer;
      const doc = docOf(ctx);
      if (!p || !doc) return;
      const t = p.tS != null ? p.tS : timeNear(doc, p);
      if (t == null) return;
      ctx.ui.setTime(t);
      ctx.ui.setTimeOn(true);
    },
  },
  {
    id: 'time.loopFrom',
    label: 'Loop from here',
    group: 'time',
    kinds: ['timeline'],
    needsPointer: true,
    when: every(needDoc, (ctx) =>
      ctx.pointer?.tS != null ? true : 'Right-click the timeline first',
    ),
    run: (ctx) => {
      const t = ctx.pointer?.tS;
      if (t == null) return;
      const end = ctx.ui.loop && ctx.ui.loop.endS > t ? ctx.ui.loop.endS : endTime(ctx);
      ctx.ui.setLoop({ startS: t, endS: Math.max(t, end) });
    },
  },
  {
    id: 'time.clearLoop',
    label: 'Clear loop',
    group: 'time',
    kinds: ['timeline'],
    when: (ctx) => (ctx.ui.loop ? true : 'No loop is set'),
    run: (ctx) => ctx.ui.setLoop(null),
  },
  // The timeline's span (lane 12.4): the whole run, or the action span (fit.ts).
  {
    id: 'timeline.fitRun',
    label: 'Fit run',
    group: 'time',
    kinds: ['timeline'],
    when: needDoc,
    run: (ctx) => ctx.ui.setTview(null),
  },
  {
    id: 'timeline.fitAction',
    label: 'Fit action',
    group: 'time',
    kinds: ['timeline'],
    when: every(needDoc, (ctx) => {
      const doc = docOf(ctx);
      return doc && actionSpan(boardDerived(doc)) ? true : 'No coverage window yet';
    }),
    run: (ctx) => {
      const doc = docOf(ctx);
      const span = doc ? actionSpan(boardDerived(doc)) : null;
      if (span) ctx.ui.setTview(span);
    },
  },

  // threat or path
  {
    id: 'threat.addWaypointHere',
    label: 'Add waypoint here',
    group: 'map',
    kinds: ['threat'],
    needsPointer: true,
    when: every(needDoc, needSel(['threat', 'waypoint'], 'a flight path'), needPointer),
    run: (ctx) => {
      const p = ctx.pointer;
      const f = selOf(ctx, ['threat', 'waypoint'])[0];
      if (!p || !f) return;
      const tKey = f.kind === 'waypoint' ? f.threat.key : f.value.key;
      const key = newKey();
      ctx.document.edit('Add waypoint', (d) => {
        const t = d.threats.find((x) => x.key === tKey);
        if (!t) return;
        const i = bestPathIndex(t.path, p);
        const prev = t.path[i - 1] ?? t.path[0];
        t.path.splice(i, 0, { key, x: p.x, y: p.y, z: prev ? prev.z : 100, holdS: 0 });
      });
      ctx.ui.setSelection([key]);
    },
  },
  {
    id: 'threat.changeType',
    label: 'Change threat type',
    group: 'map',
    kinds: ['threat'],
    needsArg: true,
    options: THREAT_OPTIONS,
    when: every(needDoc, needSel(['threat'], 'a threat')),
    run: (ctx, arg) => {
      if (typeof arg !== 'string' || !archetypeById(arg)) return;
      editSelected(ctx, 'Change threat type', ['threat'], (f) => {
        (f.value as Threat).type = arg;
      });
    },
  },
  {
    id: 'threat.setSpeed',
    label: 'Set speed',
    group: 'map',
    kinds: ['threat'],
    needsArg: true,
    when: every(needDoc, needSel(['threat'], 'a threat')),
    run: (ctx, arg) => {
      const v = num(arg);
      if (v == null || v <= 0) return;
      editSelected(ctx, 'Set speed', ['threat'], (f) => {
        (f.value as Threat).speedMs = v;
      });
    },
  },
  {
    id: 'threat.setAltitudeAll',
    label: 'Set altitude for all',
    group: 'map',
    kinds: ['threat'],
    needsArg: true,
    when: every(needDoc, needSel(['threat'], 'a threat')),
    run: (ctx, arg) => {
      const v = num(arg);
      if (v == null || v < 0) return;
      editSelected(ctx, 'Set altitude for all', ['threat'], (f) => {
        for (const w of (f.value as Threat).path) w.z = v;
      });
    },
  },
  {
    id: 'threat.reverse',
    label: 'Reverse',
    group: 'map',
    kinds: ['threat'],
    when: every(needDoc, needSel(['threat'], 'a threat')),
    run: (ctx) =>
      editSelected(ctx, 'Reverse', ['threat'], (f) => {
        (f.value as Threat).path.reverse();
      }),
  },

  // waypoint
  {
    id: 'waypoint.hold30',
    label: 'Hold +30 s',
    group: 'map',
    kinds: ['waypoint'],
    when: every(needDoc, needSel(['waypoint'], 'a waypoint')),
    run: (ctx) =>
      editSelected(ctx, 'Hold +30 s', ['waypoint'], (f) => {
        (f.value as Waypoint).holdS += 30;
      }),
  },
  {
    id: 'waypoint.insertAfter',
    label: 'Insert after',
    group: 'map',
    kinds: ['waypoint'],
    when: every(needDoc, needSel(['waypoint'], 'a waypoint')),
    run: (ctx) => {
      const f = selOf(ctx, ['waypoint'])[0];
      if (!f || f.kind !== 'waypoint') return;
      const key = newKey();
      ctx.document.edit('Insert waypoint', (d) => {
        const found = find(d, f.value.key);
        if (!found || found.kind !== 'waypoint') return;
        const path = found.threat.path;
        const a = path[found.index] as Waypoint;
        const b = path[found.index + 1];
        const before = path[found.index - 1];
        let x: number;
        let y: number;
        if (b) {
          x = (a.x + b.x) / 2;
          y = (a.y + b.y) / 2;
        } else if (before) {
          const dx = a.x - before.x;
          const dy = a.y - before.y;
          const len = Math.hypot(dx, dy) || 1;
          x = a.x + (dx / len) * 100;
          y = a.y + (dy / len) * 100;
        } else {
          x = a.x + 100;
          y = a.y;
        }
        path.splice(found.index + 1, 0, { key, x, y, z: b ? (a.z + b.z) / 2 : a.z, holdS: 0 });
      });
      ctx.ui.setSelection([key]);
    },
  },
  {
    id: 'waypoint.setAltitude',
    label: 'Set altitude',
    group: 'map',
    kinds: ['waypoint'],
    needsArg: true,
    when: every(needDoc, needSel(['waypoint'], 'a waypoint')),
    run: (ctx, arg) => {
      const v = num(arg);
      if (v == null || v < 0) return;
      editSelected(ctx, 'Set altitude', ['waypoint'], (f) => {
        (f.value as Waypoint).z = v;
      });
    },
  },

  // sensor or effector
  {
    id: 'system.makeSector',
    label: 'Make sector',
    group: 'map',
    kinds: ['sensor', 'effector'],
    when: every(needDoc, needSel(SYSTEMS, 'a sensor or effector'), (ctx) =>
      selOf(ctx, SYSTEMS).some((f) => (f.value as Sensor).fovDeg >= 360)
        ? true
        : 'Already a sector',
    ),
    run: (ctx) =>
      editSelected(ctx, 'Make sector', SYSTEMS, (f) => {
        const s = f.value as Sensor | Effector;
        if (s.fovDeg < 360) return;
        const def =
          f.kind === 'sensor'
            ? SENSOR_DEFAULTS[(s as Sensor).kind].fovDeg
            : EFFECTOR_DEFAULTS[(s as Effector).kind].fovDeg;
        s.fovDeg = def < 360 ? def : 90;
      }),
  },
  {
    id: 'system.makeOmni',
    label: 'Make omni',
    group: 'map',
    kinds: ['sensor', 'effector'],
    when: every(needDoc, needSel(SYSTEMS, 'a sensor or effector'), (ctx) =>
      selOf(ctx, SYSTEMS).some((f) => (f.value as Sensor).fovDeg < 360) ? true : 'Already omni',
    ),
    run: (ctx) =>
      editSelected(ctx, 'Make omni', SYSTEMS, (f) => {
        (f.value as Sensor | Effector).fovDeg = 360;
      }),
  },
  {
    id: 'system.setRange',
    label: 'Set range',
    group: 'map',
    kinds: ['sensor', 'effector'],
    needsArg: true,
    when: every(needDoc, needSel(SYSTEMS, 'a sensor or effector')),
    run: (ctx, arg) => {
      const v = num(arg);
      if (v == null || v <= 0) return;
      editSelected(ctx, 'Set range', SYSTEMS, (f) => {
        (f.value as Sensor | Effector).rangeM = v;
      });
    },
  },

  // area
  {
    id: 'area.setTop',
    label: 'Set top',
    group: 'map',
    kinds: ['area'],
    needsArg: true,
    when: every(needDoc, needSel(['area'], 'an area')),
    run: (ctx, arg) => {
      const v = num(arg);
      if (v == null || v < 0) return;
      editSelected(ctx, 'Set top', ['area'], (f) => {
        const a = f.value as Area;
        a.zMaxM = Math.max(v, a.zMinM);
      });
    },
  },
  {
    id: 'area.addVertexHere',
    label: 'Add vertex here',
    group: 'map',
    kinds: ['area'],
    needsPointer: true,
    when: every(needDoc, needSel(['area'], 'an area'), needPointer),
    run: (ctx) => {
      const p = ctx.pointer;
      const f = selOf(ctx, ['area'])[0];
      if (!p || !f) return;
      ctx.document.edit('Add vertex', (d) => {
        const a = d.areas.find((x) => x.key === f.value.key);
        if (!a) return;
        a.pts.splice(bestRingIndex(a.pts, p), 0, [p.x, p.y]);
      });
    },
  },
];

/** Right-click order per target: the rows of the spec section 8 table, left to right. */
export const MENU_ORDER: Readonly<Partial<Record<AssetKind, readonly string[]>>> = {
  map: [
    ...ADD_HERE.map((c) => c.id),
    'map.addHeightPlane',
    'map.pasteHere',
    'map.measureFrom',
    'time.setHere',
    'view.fit',
  ],
  threat: [
    'threat.addWaypointHere',
    'threat.changeType',
    'threat.setSpeed',
    'threat.setAltitudeAll',
    'threat.reverse',
    'edit.duplicate',
    'edit.delete',
  ],
  waypoint: ['waypoint.hold30', 'waypoint.insertAfter', 'waypoint.setAltitude', 'edit.delete'],
  sensor: [
    'system.makeSector',
    'system.makeOmni',
    'system.setRange',
    'edit.duplicate',
    'edit.delete',
  ],
  effector: [
    'system.makeSector',
    'system.makeOmni',
    'system.setRange',
    'edit.duplicate',
    'edit.delete',
  ],
  area: ['area.setTop', 'area.addVertexHere', 'edit.duplicate', 'edit.delete'],
  // The spec table has no row for C2 and TSPI nodes. Duplicate and Delete give a right-click on
  // one a menu, in the order the other asset rows use.
  node: ['edit.duplicate', 'edit.delete'],
  timeline: [
    'time.setHere',
    'time.loopFrom',
    'time.clearLoop',
    'timeline.fitRun',
    'timeline.fitAction',
    'timeline.saveFrameHere',
    'timeline.saveSliceFromLoop',
  ],
};

/** Register every command once. Safe to call again. */
export function registerCommands(): void {
  if (get('help.palette')) return;
  for (const c of COMMANDS)
    register(c.workspaces || EVERYWHERE.has(c.id) ? c : { ...c, workspaces: BUILD });
  setMenuOrder(MENU_ORDER);
}

/** The target kinds of spec section 8's right-click table. */
export const MENU_TARGETS: readonly AssetKind[] = [
  'map',
  'threat',
  'waypoint',
  'sensor',
  'effector',
  'area',
  'timeline',
];

registerCommands();
