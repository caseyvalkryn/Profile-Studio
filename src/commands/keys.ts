// Key events to commands. While a text input has focus only Cmd+K passes; Escape there blurs the
// input and does nothing else. An event a handler already took (defaultPrevented) is skipped, so
// one Escape closes one layer. Held keys repeat only the time steps, undo and redo. A key binds
// only to the command active in the current workspace (Command.workspaces). A key on a command that
// cannot run shows the reason in the toast, as the legacy status line did (review 9.1 F-08).
import { showToast } from '../features/shell/toastStore';
import { byShortcut, currentContext, isMac } from './registry';
import type { CommandContext } from './types';

type KeyLike = Pick<
  KeyboardEvent,
  'key' | 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey' | 'target'
> & {
  code?: string;
  preventDefault?: () => void;
  defaultPrevented?: boolean;
  repeat?: boolean;
};

/** Commands a held key may repeat. Every other command fires once per press. */
export const REPEATABLE = new Set([
  'time.back1',
  'time.forward1',
  'time.back10',
  'time.forward10',
  'edit.undo',
  'edit.redo',
]);

function keyName(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key === 'Backspace' || key === 'Del') return 'Delete';
  if (key === 'Esc') return 'Escape';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** The canonical shortcut string for an event, such as 'Shift+Mod+Z'. */
export function shortcutOf(e: KeyLike, mac: boolean): string {
  // Shift+1 types '!' on a US layout; the layer chip keys read the physical digit (legacy).
  const digit = e.shiftKey ? /^Digit(\d)$/.exec(e.code ?? '') : null;
  const key = digit ? digit[1]! : keyName(e.key);
  const mod = mac ? e.metaKey : e.ctrlKey;
  // A printable symbol such as '?' already carries its Shift.
  const symbol = key.length === 1 && !/[A-Z0-9]/.test(key);
  const parts: string[] = [];
  if (e.shiftKey && !symbol) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (mod) parts.push('Mod');
  parts.push(key);
  return parts.join('+');
}

/** True when the event target is the page itself, not a control. */
function onPage(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return true;
  const tag = el.tagName.toLowerCase();
  return tag === 'body' || tag === 'html';
}

export function isTextInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color'].includes(type);
  }
  return el.isContentEditable === true;
}

/** A disabled command's reason as toast text: one sentence with a full stop. */
export const reasonText = (reason: string) => (/[.!?]$/.test(reason) ? reason : `${reason}.`);

/**
 * Dispatch one key event. Returns the id of the command that ran, or null. A matched but disabled
 * command does not run: it shows its reason in the toast and returns null.
 */
export function dispatchKey(
  e: KeyLike,
  ctx: () => CommandContext = () => currentContext(),
  mac = isMac(),
): string | null {
  if (e.defaultPrevented) return null;
  const shortcut = shortcutOf(e, mac);
  if (isTextInput(e.target) && shortcut !== 'Mod+K') {
    if (shortcut === 'Escape') (e.target as HTMLElement).blur?.();
    return null;
  }
  const c = ctx();
  const cmd = byShortcut(shortcut, c.ui.workspace);
  if (!cmd) return null;
  // Tab cycles objects only from the page itself; on a control it moves focus (legacy tabFree).
  if ((shortcut === 'Tab' || shortcut === 'Shift+Tab') && !onPage(e.target)) return null;
  if (e.repeat && !REPEATABLE.has(cmd.id)) return null;
  const ok = cmd.when(c);
  if (ok !== true) {
    showToast(reasonText(ok));
    return null;
  }
  e.preventDefault?.();
  cmd.run(c);
  return cmd.id;
}

/** Listen on a target (default window). Returns the function that stops listening. */
export function bindKeys(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onKey = (e: Event) => {
    dispatchKey(e as KeyboardEvent);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
