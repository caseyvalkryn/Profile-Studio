// actionsFor: the right-click items per target kind, in legacy/js/51-panel-menu.js order with the
// spec section 8 items added. Each item resolves to a command id: this lane's commands first
// (they replace the registry stubs), then the registry.
import { registerCommands } from '../../../commands/commands';
import { forTarget, get, menuShortcutLabel } from '../../../commands/registry';
import type { Command, CommandContext, CommandOption } from '../../../commands/types';
import type { ArgRequest } from '../../commands/adapter';
import type { Quantity } from '../../shared/units';
import { fromDisplay, round, toDisplay, unitOf } from '../../shared/units';
import { paletteCommands } from '../palette/commands';
import { railCommands } from '../rail/commands';
import { MENU_ARG_QUANTITY, menuCommands, type MenuKind } from './commands';
import type { MenuItem } from '../../../ui/types';
import { find } from '../../../commands/select';

registerCommands();

/** What was right-clicked: a record key, or a group letter. */
export type MenuTarget = { key?: string; letter?: string };

export type MenuAction = {
  /** The command id. */
  id: string;
  label: string;
  shortcut?: string;
  /** Set when disabled: why, for the tooltip. */
  disabledReason?: string;
  /** Passed to the command's run. */
  arg?: unknown;
  /** Set when the command needs a number first. */
  quantity?: Quantity;
  options?: readonly CommandOption[];
  separatorBefore?: boolean;
};

const LOCAL = new Map<string, Command>(
  [...menuCommands, ...paletteCommands, ...railCommands].map((c) => [c.id, c]),
);

/** This lane's command for an id, else the registry's. */
export function resolveCommand(id: string): Command | undefined {
  return LOCAL.get(id) ?? get(id);
}

const ARG_Q: Record<string, Quantity> = {
  'threat.setSpeed': 'speed',
  'threat.setAltitudeAll': 'altitude',
  'waypoint.setAltitude': 'altitude',
  'system.setRange': 'range',
  'area.setTop': 'altitude',
  ...MENU_ARG_QUANTITY,
};

type Spec = readonly [id: string, label?: string];

const SYSTEM: Spec[] = [
  ['system.makeSector'],
  ['system.makeOmni'],
  ['system.setRange'],
  ['edit.duplicate'],
  ['edit.delete'],
];
const AREA: Spec[] = [
  ['area.setTop'],
  ['area.setBottom'],
  ['area.addVertexHere'],
  ['edit.duplicate'],
  ['edit.delete'],
];

/** The order per kind. The map's "Add here" submenus come from the registry. */
export const MENU_ORDER: Record<MenuKind, readonly Spec[]> = {
  threat: [
    ['threat.addEventHere'],
    ['build.formation'],
    ['group.split'],
    ['group.merge'],
    ['threat.addWaypointHere'],
    ['threat.changeType', 'Change type'],
    ['threat.setSpeed'],
    ['threat.setAltitudeAll'],
    ['threat.reverse'],
    ['edit.duplicate'],
    ['edit.delete'],
  ],
  waypoint: [
    ['waypoint.hold30'],
    ['waypoint.insertAfter'],
    ['waypoint.setAltitude'],
    ['edit.delete'],
  ],
  sensor: SYSTEM,
  effector: SYSTEM,
  node: [['edit.duplicate'], ['edit.delete']],
  area: AREA,
  vertex: AREA,
  plane: [['plane.setHeight'], ['plane.delete']],
  event: [['event.changeType'], ['event.moveToGeometry'], ['event.delete']],
  group: [['group.split'], ['group.merge'], ['group.delete']],
  card: [
    ['card.open'],
    ['card.openInBrief'],
    ['card.duplicate'],
    ['card.moveUp'],
    ['card.moveDown'],
    ['card.delete'],
  ],
  timeline: [['time.setHere'], ['time.loopFrom'], ['time.clearLoop'], ['threat.addEventHere']],
  map: [
    ['build.quickAdd', 'Add'],
    ['map.addHeightPlane'],
    ['map.pasteHere'],
    ['map.measureFrom'],
    ['time.setHere'],
    ['view.fit'],
    ['card.save', 'Save card'],
  ],
};

/** Items shown only when enabled (legacy shows Move to geometry only with a warning). */
const ONLY_WHEN_ENABLED = new Set(['event.moveToGeometry']);
/** Either-or pairs: the menu shows the one that applies. */
const EITHER: Record<string, string> = {
  'system.makeSector': 'system.makeOmni',
  'system.makeOmni': 'system.makeSector',
};
/** Kinds whose menu ends with Copy and Paste (legacy). */
const CLIPBOARD = new Set<MenuKind>([
  'threat',
  'waypoint',
  'sensor',
  'effector',
  'node',
  'area',
  'vertex',
  'plane',
  'event',
  'group',
  'card',
]);

/** The context with the target as the selection, as the menu sees it on open. */
export function targetContext(
  kind: MenuKind,
  target: MenuTarget,
  ctx: CommandContext,
): CommandContext {
  const doc = ctx.document.doc;
  let keys = ctx.ui.selectedKeys;
  if (target.key && !keys.includes(target.key)) keys = [target.key];
  if (kind === 'group' && target.letter && doc) {
    const first = doc.threats.find((t) => t.group === target.letter);
    const inGroup = keys.some((k) => {
      const f = find(doc, k);
      return f?.kind === 'threat' && f.value.group === target.letter;
    });
    if (first && !inGroup) keys = [first.key];
  }
  return keys === ctx.ui.selectedKeys ? ctx : { ...ctx, ui: { ...ctx.ui, selectedKeys: keys } };
}

function action(id: string, label: string | undefined, ctx: CommandContext, arg?: unknown) {
  const cmd = resolveCommand(id);
  if (!cmd) return null;
  const ok = cmd.when(ctx);
  const a: MenuAction = { id, label: label ?? cmd.label };
  const sc = menuShortcutLabel(cmd);
  if (sc) a.shortcut = sc;
  if (ok !== true) a.disabledReason = ok;
  if (arg !== undefined) a.arg = arg;
  if (cmd.needsArg) a.quantity = ARG_Q[id] ?? 'range';
  if (cmd.options?.length) a.options = cmd.options;
  return { a, cmd, ok };
}

/** The right-click items for a target, in order, with the reason on each disabled one. */
export function actionsFor(
  kind: MenuKind,
  target: MenuTarget,
  ctx: CommandContext,
): MenuAction[] {
  if (!ctx.document.doc) return [];
  const c = targetContext(kind, target, ctx);
  const arg = kind === 'group' ? target.letter : undefined;
  const out: MenuAction[] = [];
  if (kind === 'map') {
    for (const cmd of forTarget('map'))
      if (cmd.submenu?.startsWith('Add here')) {
        const r = action(cmd.id, undefined, c);
        if (r) out.push(r.a);
      }
  }
  for (const [id, label] of MENU_ORDER[kind]) {
    const r = action(id, label, c, arg);
    if (!r) continue;
    if (ONLY_WHEN_ENABLED.has(id) && r.ok !== true) continue;
    const other = EITHER[id];
    if (other && r.ok !== true && resolveCommand(other)?.when(c) === true) continue;
    out.push(r.a);
  }
  if (CLIPBOARD.has(kind)) {
    const copy = action('edit.copy', 'Copy', c);
    const paste = action('edit.paste', 'Paste', c);
    if (copy) out.push({ ...copy.a, separatorBefore: true });
    if (paste) out.push(paste.a);
  }
  return out;
}

/** Run an action's command if it is enabled. Returns true when it ran, else the reason. */
export function runAction(id: string, ctx: CommandContext, arg?: unknown): true | string {
  const cmd = resolveCommand(id);
  if (!cmd) return `No command ${id}`;
  const ok = cmd.when(ctx);
  if (ok !== true) return ok;
  cmd.run(ctx, arg);
  return true;
}

/** The value a number prompt starts from: the selected record's current value. */
export function currentValue(id: string, ctx: CommandContext): number {
  const doc = ctx.document.doc;
  const key = ctx.ui.selectedKeys[0];
  if (!doc || !key) return 0;
  const plane = doc.planes.find((p) => p.key === key);
  if (plane) return id === 'plane.setHeight' ? plane.zM : 0;
  const f = find(doc, key);
  if (!f) return 0;
  if (id === 'threat.setSpeed' && f.kind === 'threat') return f.value.speedMs ?? 0;
  if (id === 'threat.setAltitudeAll' && f.kind === 'threat') return f.value.path[0]?.z ?? 0;
  if (id === 'waypoint.setAltitude' && f.kind === 'waypoint') return f.value.z;
  if (id === 'system.setRange' && (f.kind === 'sensor' || f.kind === 'effector'))
    return f.value.rangeM;
  if (id === 'area.setTop' && f.kind === 'area') return f.value.zMaxM;
  if (id === 'area.setBottom' && f.kind === 'area') return f.value.zMinM;
  return 0;
}

export type ActionItemOptions = {
  /** A fresh context when an item runs (currentContext with the menu's pointer). */
  context: () => CommandContext;
  /** Ask for a number in display units; the request converts back and runs the command. */
  onArg: (req: ArgRequest) => void;
};

/** Menu actions as ContextMenu items: options become children, a number asks through onArg. */
export function toMenuItems(actions: MenuAction[], opts: ActionItemOptions): MenuItem[] {
  const items: MenuItem[] = [];
  for (const a of actions) {
    if (a.separatorBefore && items.length) items[items.length - 1]!.separatorAfter = true;
    const item: MenuItem = { id: a.id, label: a.label };
    if (a.shortcut) item.shortcut = a.shortcut;
    if (a.disabledReason) item.disabledReason = a.disabledReason;
    else if (a.options) {
      item.children = a.options.map((o) => ({
        id: `${a.id}:${o.value}`,
        label: o.label,
        onSelect: () => void runAction(a.id, opts.context(), o.value),
      }));
    } else if (a.quantity) {
      const q = a.quantity;
      item.onSelect = () => {
        const ctx = opts.context();
        const units = ctx.ui.units;
        opts.onArg({
          commandId: a.id,
          title: a.label,
          label: q === 'speed' ? 'Speed' : q === 'range' ? 'Range' : 'Height',
          unit: unitOf(q, units),
          value: round(toDisplay(q, currentValue(a.id, ctx), units), 2),
          submit: (v) => runAction(a.id, opts.context(), fromDisplay(q, v, units)),
        });
      };
    } else {
      item.onSelect = () => void runAction(a.id, opts.context(), a.arg);
    }
    items.push(item);
  }
  return items;
}
