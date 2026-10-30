// The one command registry. Commands register once at import of commands.ts.
import { useDocument } from '../state/document';
import { useRuns } from '../state/runs';
import { useUi } from '../state/ui';
import type { AssetKind, Command, CommandContext, Pointer } from './types';

const commands = new Map<string, Command>();
/** Command ids in right-click menu order, per target (spec section 8 table). */
let menuOrder: Partial<Record<AssetKind, readonly string[]>> = {};

export function register(cmd: Command): Command {
  if (commands.has(cmd.id)) throw new Error(`Command ${cmd.id} is already registered`);
  if (cmd.shortcut) {
    const clash = byShortcut(cmd.shortcut);
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

export function byShortcut(shortcut: string): Command | undefined {
  for (const c of commands.values()) if (c.shortcut === shortcut) return c;
  return undefined;
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
 * The shortcut as shown to the user: Cmd on mac, Ctrl elsewhere. A command without its own key
 * shows the key of its `shortcutFrom` command. Empty when there is none.
 */
export function shortcutLabel(
  cmd: Pick<Command, 'shortcut'> & Partial<Pick<Command, 'id' | 'shortcutFrom'>>,
  mac = isMac(),
): string {
  // A copy that kept only id and shortcut still finds its hint through the registered command.
  const from = cmd.shortcutFrom ?? (cmd.id ? get(cmd.id)?.shortcutFrom : undefined);
  const shortcut = cmd.shortcut ?? (from ? get(from)?.shortcut : undefined);
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
    runs: useRuns.getState(),
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
