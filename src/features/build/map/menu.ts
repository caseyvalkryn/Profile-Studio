// Right-click menus from the command registry (spec section 8, Right-click menus). Each item
// shows its shortcut; a disabled item carries the reason from `when`. `submenu` paths such as
// 'Add here > Sensors' become nested children. Commands that need a value ask for it through
// `onArg`; "Change threat type" lists the archetypes as a submenu. The palette can reuse this.
import { registerCommands } from '../../../commands/commands';
import { currentContext, execute, forTarget, shortcutLabel } from '../../../commands/registry';
import { find } from '../../../commands/select';
import type { AssetKind, Command, CommandContext, Pointer } from '../../../commands/types';
import { THREAT_ARCHETYPES } from '../../../domain/catalog';
import type { MenuItem } from '../../../ui/types';
import { fromDisplay, toDisplay, unitOf, type Quantity } from './units';

registerCommands();

/** The quantity each numeric command asks for, so the prompt shows display units. */
export const ARG_QUANTITY: Record<string, Quantity> = {
  'threat.setSpeed': 'speed',
  'threat.setAltitudeAll': 'altitude',
  'waypoint.setAltitude': 'altitude',
  'system.setRange': 'range',
  'area.setTop': 'altitude',
};

/** A request for one number, in display units. `submit` converts back and runs the command. */
export type ArgRequest = {
  commandId: string;
  title: string;
  label: string;
  unit: string;
  value: number;
  submit: (displayValue: number) => true | string;
};

export type MenuOptions = {
  pointer: Pointer | null;
  onArg: (req: ArgRequest) => void;
  mac?: boolean;
};

/** The current value a numeric command starts from: the first selected record's value. */
function currentValue(id: string, ctx: CommandContext): number {
  const doc = ctx.document.doc;
  const key = ctx.ui.selectedKeys[0];
  const f = doc && key ? find(doc, key) : null;
  if (!f) return 0;
  if (id === 'threat.setSpeed' && f.kind === 'threat') return f.value.speedMs ?? 0;
  if (id === 'threat.setAltitudeAll' && f.kind === 'threat') return f.value.path[0]?.z ?? 0;
  if (id === 'waypoint.setAltitude' && f.kind === 'waypoint') return f.value.z;
  if (id === 'system.setRange' && (f.kind === 'sensor' || f.kind === 'effector'))
    return f.value.rangeM;
  if (id === 'area.setTop' && f.kind === 'area') return f.value.zMaxM;
  return 0;
}

function argRequest(cmd: Command, ctx: CommandContext, pointer: Pointer | null): ArgRequest {
  const q = ARG_QUANTITY[cmd.id] ?? 'range';
  const units = ctx.ui.units;
  return {
    commandId: cmd.id,
    title: cmd.label,
    label: q === 'speed' ? 'Speed' : q === 'range' ? 'Range' : 'Altitude',
    unit: unitOf(q, units),
    value: Number(toDisplay(q, currentValue(cmd.id, ctx), units).toFixed(2)),
    submit: (v) => execute(cmd.id, currentContext(pointer), fromDisplay(q, v, units)),
  };
}

/** Label inside an "Add here" submenu: "Add 3D radar here" reads "3D radar". */
function shortLabel(cmd: Command): string {
  if (!cmd.submenu?.startsWith('Add here')) return cmd.label;
  const s = cmd.label.replace(/^Add /, '').replace(/ here$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One registry command as a menu item. */
export function toMenuItem(cmd: Command, ctx: CommandContext, opts: MenuOptions): MenuItem {
  const ok = cmd.when(ctx);
  const item: MenuItem = { id: cmd.id, label: shortLabel(cmd) };
  const sc = shortcutLabel(cmd, opts.mac);
  if (sc) item.shortcut = sc;
  if (ok !== true) {
    item.disabledReason = ok;
    return item;
  }
  if (cmd.id === 'threat.changeType') {
    item.children = THREAT_ARCHETYPES.map((a) => ({
      id: `${cmd.id}:${a.id}`,
      label: a.name,
      onSelect: () => void execute(cmd.id, currentContext(opts.pointer), a.id),
    }));
  } else if (cmd.needsArg) {
    item.onSelect = () => opts.onArg(argRequest(cmd, ctx, opts.pointer));
  } else {
    item.onSelect = () => void execute(cmd.id, currentContext(opts.pointer));
  }
  return item;
}

/** Commands to menu items, grouping `submenu` paths ('A > B') into nested children. */
export function toMenuItems(cmds: Command[], ctx: CommandContext, opts: MenuOptions): MenuItem[] {
  const root: MenuItem[] = [];
  const groups = new Map<string, MenuItem>();
  for (const cmd of cmds) {
    let list = root;
    if (cmd.submenu) {
      let path = '';
      for (const name of cmd.submenu.split('>').map((s) => s.trim())) {
        path = path ? `${path} > ${name}` : name;
        let g = groups.get(path);
        if (!g) {
          g = { id: `submenu:${path}`, label: name, children: [] };
          groups.set(path, g);
          list.push(g);
        }
        list = g.children!;
      }
    }
    list.push(toMenuItem(cmd, ctx, opts));
  }
  return root;
}

/** The right-click menu for a target kind, with the pointer for "here" commands. */
export function menuItemsFor(kind: AssetKind, opts: MenuOptions): MenuItem[] {
  return toMenuItems(forTarget(kind), currentContext(opts.pointer), opts);
}
