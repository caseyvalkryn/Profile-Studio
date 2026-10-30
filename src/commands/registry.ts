// The one command registry. Commands register once at import of commands.ts.
import { useDocument } from '../state/document';
import { useRuns } from '../state/runs';
import { useUi } from '../state/ui';
import type { AssetKind, Command, CommandContext, Pointer } from './types';

const commands = new Map<string, Command>();

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

/** Commands for a right-click on this kind of target, in registration order. */
export function forTarget(kind: AssetKind): Command[] {
  return all().filter((c) => c.kinds?.includes(kind));
}

export function byShortcut(shortcut: string): Command | undefined {
  for (const c of commands.values()) if (c.shortcut === shortcut) return c;
  return undefined;
}

/** Remove every command, for tests. */
export function clearRegistry(): void {
  commands.clear();
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

/** The shortcut as shown to the user: Cmd on mac, Ctrl elsewhere. Empty when there is none. */
export function shortcutLabel(cmd: Pick<Command, 'shortcut'>, mac = isMac()): string {
  if (!cmd.shortcut) return '';
  return cmd.shortcut
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
