// Key events to commands. While an input has focus only Escape and Cmd+K pass.
import { byShortcut, currentContext, isMac } from './registry';
import type { CommandContext } from './types';

type KeyLike = Pick<
  KeyboardEvent,
  'key' | 'shiftKey' | 'altKey' | 'metaKey' | 'ctrlKey' | 'target'
> & { preventDefault?: () => void };

const ALWAYS = new Set(['Escape', 'Mod+K']);

function keyName(key: string): string {
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key === 'Backspace' || key === 'Del') return 'Delete';
  if (key === 'Esc') return 'Escape';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** The canonical shortcut string for an event, such as 'Shift+Mod+Z'. */
export function shortcutOf(e: KeyLike, mac: boolean): string {
  const key = keyName(e.key);
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

/**
 * Dispatch one key event. Returns the id of the command that ran, or null. A matched but disabled
 * command does nothing and returns null.
 */
export function dispatchKey(
  e: KeyLike,
  ctx: () => CommandContext = () => currentContext(),
  mac = isMac(),
): string | null {
  const shortcut = shortcutOf(e, mac);
  if (isTextInput(e.target) && !ALWAYS.has(shortcut)) return null;
  const cmd = byShortcut(shortcut);
  if (!cmd) return null;
  const c = ctx();
  if (cmd.when(c) !== true) return null;
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
