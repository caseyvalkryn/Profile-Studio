// The one adapter from the command registry to the UI primitives (spec section 8, Commands).
// Right-click menus, the palette and the map's context menu all build their items here. Each item
// shows its shortcut; a disabled item carries the reason from `when`. `submenu` paths such as
// 'Add here > Sensors' become nested children. A command that needs a number asks for it through
// `onArg` in display units; a command with fixed `options` lists them as children in a menu and
// asks through `onPick` in the palette.
import { registerCommands } from '../../commands/commands';
import {
  currentContext,
  execute,
  forTarget,
  get,
  all,
  shortcutLabel,
} from '../../commands/registry';
import { find } from '../../commands/select';
import type {
  AssetKind,
  Command,
  CommandContext,
  CommandGroup,
  CommandOption,
  Pointer,
} from '../../commands/types';
import type { MenuItem, PaletteItem } from '../../ui/types';
import { fromDisplay, round, toDisplay, unitOf, type Quantity } from '../shared/units';

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

/** A request to pick one of a command's fixed options, such as a threat type. */
export type PickRequest = {
  commandId: string;
  title: string;
  options: readonly CommandOption[];
  submit: (value: string) => true | string;
};

export type MenuOptions = {
  pointer: Pointer | null;
  onArg: (req: ArgRequest) => void;
  /** The palette's picker for option commands. Menus list options as children instead. */
  onPick?: (req: PickRequest) => void;
  mac?: boolean;
};

/** Group names as a test engineer reads them in the palette and the shortcut sheet. */
export const GROUP_LABELS: Record<CommandGroup, string> = {
  run: 'Run',
  edit: 'Edit',
  map: 'Map',
  time: 'Time',
  view: 'View',
  file: 'File',
  help: 'Help',
};

/** Exactly one of each pair shows in a menu: the one that applies to the selection. */
const EITHER: Record<string, string> = {
  'system.makeSector': 'system.makeOmni',
  'system.makeOmni': 'system.makeSector',
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
    value: round(toDisplay(q, currentValue(cmd.id, ctx), units), 2),
    submit: (v) => execute(cmd.id, currentContext(pointer), fromDisplay(q, v, units)),
  };
}

function pickRequest(cmd: Command, pointer: Pointer | null): PickRequest {
  return {
    commandId: cmd.id,
    title: cmd.label,
    options: cmd.options ?? [],
    submit: (value) => execute(cmd.id, currentContext(pointer), value),
  };
}

/** Label inside an "Add here" submenu: "Add 3D radar here" reads "3D radar". */
function shortLabel(cmd: Command): string {
  if (!cmd.submenu?.startsWith('Add here')) return cmd.label;
  const s = cmd.label.replace(/^Add /, '').replace(/ here$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function optionItem(cmd: Command, o: CommandOption, pointer: Pointer | null): MenuItem {
  return {
    id: `${cmd.id}:${o.value}`,
    label: o.label,
    onSelect: () => void execute(cmd.id, currentContext(pointer), o.value),
  };
}

/** Options as menu items, nested by their `group` when they have one. */
function groupedOptions(cmd: Command, pointer: Pointer | null): MenuItem[] {
  const out: MenuItem[] = [];
  const groups = new Map<string, MenuItem>();
  for (const o of cmd.options ?? []) {
    if (!o.group) {
      out.push(optionItem(cmd, o, pointer));
      continue;
    }
    let g = groups.get(o.group);
    if (!g) {
      g = { id: `${cmd.id}:group:${o.group}`, label: o.group, children: [] };
      groups.set(o.group, g);
      out.push(g);
    }
    g.children!.push(optionItem(cmd, o, pointer));
  }
  return out;
}

/** True when this command is the inactive one of an either-or pair, so the menu leaves it out. */
function hidden(cmd: Command, ctx: CommandContext): boolean {
  const other = EITHER[cmd.id];
  if (!other || cmd.when(ctx) === true) return false;
  return get(other)?.when(ctx) === true;
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
  if (cmd.options?.length) {
    item.children = cmd.options.map((o) => optionItem(cmd, o, opts.pointer));
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
    if (hidden(cmd, ctx)) continue;
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
      // "Add threat here" lists its archetypes, by UAS group, straight inside Add here > Threats.
      if (cmd.options?.length && cmd.when(ctx) === true) {
        list.push(...groupedOptions(cmd, opts.pointer));
        continue;
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

/** Palette order of the groups: the common actions first. */
const GROUP_ORDER: CommandGroup[] = ['run', 'edit', 'view', 'time', 'map', 'file', 'help'];

/**
 * Every registered command as a palette item (acceptance 12.10). A command that needs a number
 * opens the number prompt; one with options opens the picker; a "here" command says to
 * right-click, because the palette has no map point.
 */
export function paletteItems(opts: MenuOptions): PaletteItem[] {
  const ctx = currentContext(opts.pointer);
  const rank = (c: Command) => GROUP_ORDER.indexOf(c.group);
  return all()
    .filter((c) => c.id !== 'help.palette')
    .sort((a, b) => rank(a) - rank(b))
    .map((cmd) => {
      const ok = cmd.when(ctx);
      const item: PaletteItem = {
        id: cmd.id,
        label: cmd.label,
        group: GROUP_LABELS[cmd.group],
        onSelect: () => {},
      };
      const sc = shortcutLabel(cmd, opts.mac);
      if (sc) item.shortcut = sc;
      if (ok !== true) {
        item.disabledReason = ok;
      } else if (cmd.options?.length && opts.onPick) {
        const pick = opts.onPick;
        item.onSelect = () => pick(pickRequest(cmd, opts.pointer));
      } else if (cmd.needsArg && ARG_QUANTITY[cmd.id]) {
        item.onSelect = () => opts.onArg(argRequest(cmd, ctx, opts.pointer));
      } else if (cmd.needsArg) {
        item.disabledReason = 'Set this in the inspector';
      } else {
        item.onSelect = () => void execute(cmd.id, currentContext(opts.pointer));
      }
      return item;
    });
}
