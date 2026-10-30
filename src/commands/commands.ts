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
import { previewOf } from '../state/document';
import type { Clip, MapPoint } from '../state/ui';
import { find, selected, type Found } from './select';
import { get, register } from './registry';
import type { AssetKind, Command, CommandContext } from './types';

// ---- rules ----

type Rule = (ctx: CommandContext) => true | string;
type FoundKind = Found['kind'];

const docOf = (ctx: CommandContext) => ctx.document.doc;
const selOf = (ctx: CommandContext, kinds?: readonly FoundKind[]) =>
  selected(docOf(ctx), ctx.ui.selectedKeys).filter((f) => !kinds || kinds.includes(f.kind));

const needDoc: Rule = (ctx) => (docOf(ctx) ? true : 'Open a vignette first');
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

function stepTime(ctx: CommandContext, ds: number) {
  const t = Math.min(Math.max(0, ctx.ui.tS + ds), Math.max(endTime(ctx), 0));
  ctx.ui.setTime(t);
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
): Command {
  return {
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
      const type =
        typeof arg === 'string' && archetypeById(arg) ? arg : (THREAT_ARCHETYPES[0]?.id ?? '');
      return addThreat(d, type, p);
    },
    (ctx) => ctx.ui.setTool('path'),
  ),
  ...SENSOR_KINDS.map((k) =>
    addHere(`map.add.${k}`, `Add ${SYSTEM_LABELS[k]} here`, 'Sensors', (d, p) =>
      addSensor(d, k, p),
    ),
  ),
  ...EFFECTOR_KINDS.map((k) =>
    addHere(`map.add.${k}`, `Add ${SYSTEM_LABELS[k]} here`, 'Effectors', (d, p) =>
      addEffector(d, k, p),
    ),
  ),
  ...NODE_KINDS.map((k) =>
    addHere(`map.add.${k}`, `Add ${SYSTEM_LABELS[k]} here`, 'C2 and TSPI', (d, p) =>
      addNode(d, k, p),
    ),
  ),
  ...AREA_KINDS.map((k) =>
    addHere(`map.add.${k}`, `Add ${AREA_LABELS[k].toLowerCase()} here`, 'Areas', (d, p) =>
      addArea(d, k, p),
    ),
  ),
];

// ---- the command list ----

/** Default replicates and seed for a run started from a key or the palette. */
export const DEFAULT_RUN_N = 100;

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
    run: (ctx) => ctx.document.undo(),
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    group: 'edit',
    shortcut: 'Shift+Mod+Z',
    when: (ctx) => (ctx.document.canRedo ? true : 'Nothing to redo'),
    run: (ctx) => ctx.document.redo(),
  },
  {
    id: 'edit.delete',
    label: 'Delete',
    group: 'edit',
    shortcut: 'Delete',
    kinds: ['threat', 'waypoint', 'sensor', 'effector', 'area'],
    when: every(needDoc, needSel(undefined, 'something')),
    run: (ctx) => {
      const keys = new Set(selOf(ctx).map((f) => f.value.key));
      ctx.document.edit('Delete', (d) => {
        d.threats = d.threats.filter((t) => !keys.has(t.key));
        for (const t of d.threats) t.path = t.path.filter((w) => !keys.has(w.key));
        d.sensors = d.sensors.filter((x) => !keys.has(x.key));
        d.effectors = d.effectors.filter((x) => !keys.has(x.key));
        d.nodes = d.nodes.filter((x) => !keys.has(x.key));
        d.areas = d.areas.filter((x) => !keys.has(x.key));
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
    run: (ctx) => {
      const ui = ctx.ui;
      if (ctx.document.drag) ctx.document.cancelDrag();
      else if (ui.paletteOpen) ui.setPaletteOpen(false);
      else if (ui.shortcutsOpen) ui.setShortcutsOpen(false);
      else if (ui.tool !== 'select' || ui.armed || ui.measureFrom) {
        ui.setTool('select');
        ui.setArmed(null);
        ui.setMeasureFrom(null);
      } else ui.setSelection([]);
    },
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
    kinds: ['threat', 'sensor', 'effector', 'area'],
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
    id: 'run.start',
    label: 'Run',
    group: 'run',
    shortcut: 'Mod+Enter',
    when: every(
      needDoc,
      (ctx) => (docOf(ctx)?.threats.length ? true : 'Add a threat first'),
      (ctx) => (docOf(ctx)?.sensors.length ? true : 'Add a sensor first'),
      (ctx) => {
        const k = ctx.runs.activeKey;
        return k && ctx.runs.results[k]?.status === 'running' ? 'A run is in progress' : true;
      },
    ),
    run: (ctx, arg) => {
      const doc = docOf(ctx);
      if (!doc) return;
      const a = (arg ?? {}) as { n?: unknown; seed?: unknown };
      const n = num(a.n) ?? DEFAULT_RUN_N;
      const seed = num(a.seed) ?? doc.runs.length + 1;
      void ctx.runs.startRun(n, seed);
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
    id: 'view.profile',
    label: 'Profile view',
    group: 'view',
    shortcut: '2',
    when: every(needDoc, needSel(['threat', 'waypoint'], 'a flight path')),
    run: (ctx) => ctx.ui.setView('profile'),
  },
  {
    id: 'help.shortcuts',
    label: 'Shortcut sheet',
    group: 'help',
    shortcut: '?',
    when: () => true,
    run: (ctx) => ctx.ui.setShortcutsOpen(!ctx.ui.shortcutsOpen),
  },

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
    when: every(needDoc, needPointer, (ctx) =>
      ctx.pointer?.tS != null || docOf(ctx)?.threats.length ? true : 'Add a threat first',
    ),
    run: (ctx) => {
      const p = ctx.pointer;
      const doc = docOf(ctx);
      if (!p || !doc) return;
      const t = p.tS ?? timeNear(doc, p);
      if (t != null) ctx.ui.setTime(t);
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

/** Register every command once. Safe to call again. */
export function registerCommands(): void {
  if (get('help.palette')) return;
  for (const c of COMMANDS) register(c);
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
