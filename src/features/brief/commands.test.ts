import { registerCommands } from '../../commands/commands';
import { dispatchKey } from '../../commands/keys';
import { activeIn, byShortcut, get, inWorkspace } from '../../commands/registry';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { briefCommands } from './commands';
import { testDeck } from './testDeck';

registerCommands();

const key = (k: string) => ({
  key: k,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  target: document.body,
});

beforeEach(() => {
  useUi.setState({ ...UI_DEFAULTS, workspace: 'brief' });
  useDocument.getState().open(testDeck());
});

const ids = () => useDocument.getState().doc!.cards.map((c) => c.id);
/** A key, then the command's deferred card module (one microtask). */
const press = async (k: string) => {
  const id = dispatchKey(key(k), undefined, true);
  await import('./cards');
  await Promise.resolve();
  return id;
};

describe('Brief commands', () => {
  it('are registered in Brief only', () => {
    for (const c of briefCommands) {
      expect(get(c.id), c.id).toBe(c);
      expect(activeIn(c, 'brief'), c.id).toBe(true);
      expect(activeIn(c, 'build'), c.id).toBe(false);
    }
    expect(byShortcut('ArrowRight', 'brief')?.id).toBe('brief.next');
    expect(byShortcut('Space', 'brief')?.id).toBe('brief.space');
    expect(byShortcut('ArrowLeft', 'brief')?.id).toBe('brief.back');
    expect(byShortcut('Home', 'brief')?.id).toBe('brief.first');
    expect(byShortcut('End', 'brief')?.id).toBe('brief.last');
    expect(byShortcut('ArrowUp', 'brief')?.id).toBe('brief.moveUp');
    expect(byShortcut('ArrowDown', 'brief')?.id).toBe('brief.moveDown');
    expect(byShortcut('Delete', 'brief')?.id).toBe('brief.delete');
  });

  it('Right, Space, Left, Home and End move the current card', async () => {
    expect(await press('ArrowRight')).toBe('brief.next');
    expect(useUi.getState().cardKey).toBe('k-c2');
    expect(await press(' ')).toBe('brief.space');
    expect(useUi.getState().cardKey).toBe('k-c1');
    expect(await press('ArrowLeft')).toBe('brief.back');
    expect(useUi.getState().cardKey).toBe('k-c2');
    expect(await press('Home')).toBe('brief.first');
    expect(useUi.getState().cardKey).toBe('k-c1');
    expect(await press('End')).toBe('brief.last');
    expect(useUi.getState().cardKey).toBe('k-c2');
  });

  it('Up and Down move the card in the deck; Delete removes it with undo', async () => {
    expect(await press('ArrowUp')).toBeNull(); // first: nothing to do
    expect(await press('ArrowDown')).toBe('brief.moveDown');
    expect(ids()).toEqual(['c2', 'c1']);
    expect(await press('ArrowUp')).toBe('brief.moveUp');
    expect(ids()).toEqual(['c1', 'c2']);
    expect(await press('Delete')).toBe('brief.delete');
    expect(ids()).toEqual(['c2']);
    useDocument.getState().undo();
    expect(ids()).toEqual(['c1', 'c2']);
  });

  it('Build keys that edit are off in Brief', () => {
    const brief = new Set(inWorkspace('brief').map((c) => c.id));
    for (const id of ['edit.delete', 'edit.duplicate', 'edit.paste', 'card.save', 'time.playPause'])
      expect(brief.has(id), id).toBe(false);
    expect(byShortcut('Mod+D', 'brief')).toBeUndefined();
  });

  it('Print brief and Add card are in the palette set, Print needing cards', () => {
    const ctx = { document: useDocument.getState(), ui: useUi.getState(), pointer: null };
    expect(get('brief.print')!.when(ctx)).toBe(true);
    expect(get('brief.add')!.when(ctx)).toBe(true);
    useDocument.getState().open({ ...testDeck(), cards: [] });
    const empty = { document: useDocument.getState(), ui: useUi.getState(), pointer: null };
    expect(get('brief.print')!.when(empty)).toBe('No cards yet');
    expect(get('brief.add')!.when(empty)).toBe(true);
  });
});
