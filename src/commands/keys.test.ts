import { testVignette } from '../engine/testVignette';
import { useDocument } from '../state/document';
import { UI_DEFAULTS, useUi } from '../state/ui';
import './commands';
import { dispatchKey, shortcutOf } from './keys';

const key = (
  k: string,
  mods: Partial<KeyboardEvent> = {},
  target: EventTarget | null = document.body,
) => ({
  key: k,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  target,
  ...mods,
});

beforeEach(() => {
  useUi.setState(UI_DEFAULTS);
  useDocument.getState().open(testVignette());
});

describe('key dispatch', () => {
  it('Cmd+Z maps to undo on mac, Ctrl+Z elsewhere', () => {
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'x';
    });
    expect(dispatchKey(key('z', { metaKey: true }), undefined, true)).toBe('edit.undo');
    expect(useDocument.getState().doc!.name).toBe('test vignette');
    expect(dispatchKey(key('Z', { metaKey: true, shiftKey: true }), undefined, true)).toBe(
      'edit.redo',
    );
    expect(useDocument.getState().doc!.name).toBe('x');
    expect(dispatchKey(key('z', { ctrlKey: true }), undefined, false)).toBe('edit.undo');
  });

  it('typing in an input does not delete', () => {
    const t = useDocument.getState().doc!.threats[0]!;
    useUi.getState().setSelection([t.key]);
    const input = document.createElement('input');
    expect(dispatchKey(key('Backspace', {}, input), undefined, true)).toBeNull();
    expect(dispatchKey(key('Delete', {}, input), undefined, true)).toBeNull();
    expect(useDocument.getState().doc!.threats).toHaveLength(2);
    expect(dispatchKey(key('Backspace'), undefined, true)).toBe('edit.delete');
    expect(useDocument.getState().doc!.threats).toHaveLength(1);
  });

  it('Cmd+K works inside an input; Escape there only blurs it', () => {
    const t = useDocument.getState().doc!.threats[0]!;
    useUi.getState().setSelection([t.key]);
    const input = document.createElement('textarea');
    document.body.append(input);
    input.focus();
    expect(dispatchKey(key('k', { metaKey: true }, input), undefined, true)).toBe('help.palette');
    expect(useUi.getState().paletteOpen).toBe(true);
    expect(dispatchKey(key('Escape', {}, input), undefined, true)).toBeNull();
    expect(document.activeElement).not.toBe(input);
    expect(useUi.getState().selectedKeys).toEqual([t.key]);
    input.remove();
  });

  it('skips an event a handler already took', () => {
    const t = useDocument.getState().doc!.threats[0]!;
    useUi.getState().setSelection([t.key]);
    expect(dispatchKey(key('Escape', { defaultPrevented: true }), undefined, true)).toBeNull();
    expect(useUi.getState().selectedKeys).toEqual([t.key]);
    expect(dispatchKey(key('Escape'), undefined, true)).toBe('edit.escape');
    expect(useUi.getState().selectedKeys).toEqual([]);
  });

  it('a held key repeats time steps and undo, not toggles', () => {
    expect(dispatchKey(key(' ', { repeat: true }), undefined, true)).toBeNull();
    expect(dispatchKey(key('u', { repeat: true }), undefined, true)).toBeNull();
    expect(dispatchKey(key('k', { metaKey: true, repeat: true }), undefined, true)).toBeNull();
    expect(useUi.getState().paletteOpen).toBe(false);
    expect(dispatchKey(key('ArrowRight', { repeat: true }), undefined, true)).toBe('time.forward1');
    useDocument.getState().edit('Rename', (d) => {
      d.name = 'x';
    });
    expect(dispatchKey(key('z', { metaKey: true, repeat: true }), undefined, true)).toBe(
      'edit.undo',
    );
  });

  it('normalises symbols and space', () => {
    expect(shortcutOf(key('?', { shiftKey: true }), true)).toBe('?');
    expect(shortcutOf(key(' '), true)).toBe('Space');
    expect(shortcutOf(key('ArrowLeft', { shiftKey: true }), true)).toBe('Shift+ArrowLeft');
  });
});
