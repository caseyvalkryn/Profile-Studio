// The one command registry. Commands register once at import of commands.ts.
import { useDocument } from '../state/document';
import { useUi, type Workspace } from '../state/ui';
import type { AssetKind, Command, CommandContext, Pointer } from './types';

const commands = new Map<string, Command>();
/** Command ids in right-click menu order, per target (spec section 8 table). */
let menuOrder: Partial<Record<AssetKind, readonly string[]>> = {};

export function register(cmd: Command): Command {
  if (commands.has(cmd.id)) throw new Error(`Command ${cmd.id} is already registered`);
  if (cmd.shortcut) {
    const clash = all().find((c) => c.shortcut === cmd.shortcut && overlaps(c, cmd));
    if (clash) throw new Error(`Shortcut ${cmd.shortcut} is taken by ${clash.id}`);
  }
  commands.set(cmd.id, cmd);
  return cmd;
}

export function get(id: string): Command | undefined {
  return commands.get(id);
}

export function all(): Command[] {
  return [...commands.values()];
}

/** Set the right-click order per target. Commands not listed follow, in registration order. */
export function setMenuOrder(order: Partial<Record<AssetKind, readonly string[]>>): void {
  menuOrder = order;
}

/** Commands for a right-click on this kind of target, in the spec table order. */
export function forTarget(kind: AssetKind): Command[] {
  const order = menuOrder[kind] ?? [];
  const rank = (c: Command) => {
    const i = order.indexOf(c.id);
    return i < 0 ? order.length : i;
  };
  // Array.prototype.sort is stable, so ties keep registration order.
  return all()
    .filter((c) => c.kinds?.includes(kind))
    .sort((a, b) => rank(a) - rank(b));
}

/** True when the command is active in the workspace. A command with no `workspaces` is active everywhere. */
export function activeIn(cmd: Pick<Command, 'workspaces'>, workspace: Workspace): boolean {
  return !cmd.workspaces || cmd.workspaces.includes(workspace);
}

function overlaps(a: Pick<Command, 'workspaces'>, b: Pick<Command, 'workspaces'>): boolean {
  if (!a.workspaces || !b.workspaces) return true;
  return a.workspaces.some((w) => b.workspaces!.includes(w));
}

/** The command bound to the shortcut in the workspace; any workspace when it is omitted. */
export function byShortcut(shortcut: string, workspace?: Workspace): Command | undefined {
  for (const c of commands.values())
    if (c.shortcut === shortcut && (!workspace || activeIn(c, workspace))) return c;
  return undefined;
}

/** Every command active in the workspace, in registration order. */
export function inWorkspace(workspace: Workspace): Command[] {
  return all().filter((c) => activeIn(c, workspace));
}

/** Remove every command, for tests. */
export function clearRegistry(): void {
  commands.clear();
  menuOrder = {};
}

export function isMac(): boolean {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (!nav) return false;
  const p =
    (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    nav.platform ??
    '';
  return /mac|iphone|ipad/i.test(p);
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Escape: 'Esc',
};

/**
 * The shortcut as shown to the user: Cmd on mac, Ctrl elsewhere. Empty when the command has no
 * key of its own. The palette, the shortcut sheet, buttons and tooltips use this, so a key is
 * shown only on the command it runs (review 7.R F-07).
 */
export function shortcutLabel(cmd: Pick<Command, 'shortcut'>, mac = isMac()): string {
  return keyLabel(cmd.shortcut, mac);
}

/**
 * The shortcut a context-menu item shows: its own key, else the key of its `shortcutFrom`
 * command, the tool the item starts (review 7 1a). Context menu only (review 7.R F-07).
 */
export function menuShortcutLabel(
  cmd: Pick<Command, 'shortcut'> & Partial<Pick<Command, 'id' | 'shortcutFrom'>>,
  mac = isMac(),
): string {
  // A copy that kept only id and shortcut still finds its hint through the registered command.
  const from = cmd.shortcutFrom ?? (cmd.id ? get(cmd.id)?.shortcutFrom : undefined);
  return keyLabel(cmd.shortcut ?? (from ? get(from)?.shortcut : undefined), mac);
}

function keyLabel(shortcut: string | undefined, mac: boolean): string {
  if (!shortcut) return '';
  return shortcut
    .split('+')
    .map((part) => {
      if (part === 'Mod') return mac ? 'Cmd' : 'Ctrl';
      if (part === 'Alt') return mac ? 'Option' : 'Alt';
      return KEY_LABELS[part] ?? part;
    })
    .join('+');
}

/** A context from the live stores. */
export function currentContext(pointer: Pointer | null = null): CommandContext {
  return {
    document: useDocument.getState(),
    ui: useUi.getState(),
    pointer,
  };
}

/** Run a command if it is enabled. Returns true when it ran, else the reason. */
export function execute(
  id: string,
  ctx: CommandContext = currentContext(),
  arg?: unknown,
): true | string {
  const cmd = get(id);
  if (!cmd) return `No command ${id}`;
  const ok = cmd.when(ctx);
  if (ok !== true) return ok;
  cmd.run(ctx, arg);
  return true;
}
