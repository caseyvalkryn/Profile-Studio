import { testVignette } from '../engine/testVignette';
import { useDocument } from '../state/document';
import { UI_DEFAULTS, useUi, type Workspace } from '../state/ui';
import { sheetRows } from '../features/commands/sheet';
import { useToast } from '../features/shell/toastStore';
import { nextTheme } from './commands';
import { dispatchKey } from './keys';
import { byShortcut, get, inWorkspace, register } from './registry';

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
  key: k,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  target: document.body,
  ...mods,
});

const inWs = (w: Workspace) => useUi.setState({ workspace: w });

beforeEach(() => {
  useUi.setState(UI_DEFAULTS);
  useDocument.getState().open(testVignette());
});

describe('workspace scoping', () => {
  it('1 is the Plan view in Build and nothing in Brief or the Library', () => {
    expect(byShortcut('1', 'build')?.id).toBe('view.plan');
    // The card jumps (1 to 9) left with the Brief stubs (plan, Deferred from phase 10).
    expect(byShortcut('1', 'brief')).toBeUndefined();
    expect(byShortcut('1', 'library')).toBeUndefined();
  });

  it('the arrows step time in Build and move between cards in Brief', () => {
    expect(byShortcut('ArrowRight', 'build')?.id).toBe('time.forward1');
    expect(byShortcut('ArrowRight', 'brief')?.id).toBe('brief.next');
    expect(byShortcut('Space', 'brief')?.id).toBe('brief.space');
    expect(byShortcut('Delete', 'brief')?.id).toBe('brief.delete');
    expect(byShortcut('Delete', 'build')?.id).toBe('edit.delete');
  });

  it('dispatchKey runs the command of the current workspace only', () => {
    inWs('build');
    useUi.getState().setView('elevation');
    expect(dispatchKey(key('1'), undefined, true)).toBe('view.plan');
    expect(useUi.getState().view).toBe('plan');
    inWs('library');
    useUi.getState().setView('elevation');
    expect(dispatchKey(key('1'), undefined, true)).toBeNull();
    expect(useUi.getState().view).toBe('elevation');
  });

  it('undo, help and theme run in every workspace', () => {
    for (const w of ['library', 'build', 'brief'] as const) {
      const ids = inWorkspace(w).map((c) => c.id);
      for (const id of ['edit.undo', 'edit.redo', 'help.shortcuts', 'view.theme', 'file.export'])
        expect(ids, `${w}: ${id}`).toContain(id);
    }
  });

  it('a command that is live reports true', () => {
    const ctx = { doc: useDocument.getState().doc, ui: useUi.getState() } as never;
    expect(get('profile.new')!.when(ctx)).toBe(true); // live since the 9.1.4 merge
  });

  it('the Brief keys need cards; with none, Right does nothing', () => {
    inWs('brief');
    expect(dispatchKey(key('ArrowRight'), undefined, true)).toBeNull();
    expect(useToast.getState().text).toBe('No cards yet.');
  });

  it('two commands may share a shortcut only in disjoint workspaces', () => {
    const cmd = (id: string, workspaces: Workspace[]) => ({
      id,
      label: id,
      group: 'help' as const,
      shortcut: 'Alt+F12',
      workspaces,
      when: () => true as const,
      run: () => {},
    });
    register(cmd('test.a', ['build']));
    expect(() => register(cmd('test.b', ['brief']))).not.toThrow();
    expect(() => register(cmd('test.c', ['library', 'build']))).toThrow();
  });

  it('the panel keys flip the ui panel fields', () => {
    inWs('build');
    expect(useUi.getState().panels.inspector).toBe(true);
    dispatchKey(key('i'), undefined, true);
    expect(useUi.getState().panels.inspector).toBe(false);
    dispatchKey(key('\\'), undefined, true);
    expect(useUi.getState().panels.list).toBe(false);
  });

  it('R waits for lane 9.3.2 and a disabled key toasts its reason', () => {
    inWs('build');
    expect(dispatchKey(key('r'), undefined, true)).toBeNull();
    expect(useUi.getState().stripTab).toBe(UI_DEFAULTS.stripTab);
    expect(useToast.getState()).toMatchObject({
      text: 'The chart and readout strips arrive in lane 9.3.2.',
      visible: true,
    });
  });

  it('/ focuses the Library search in the Library only', () => {
    expect(byShortcut('/', 'library')?.id).toBe('library.search');
    expect(byShortcut('/', 'build')?.id).not.toBe('library.search');
  });
});

describe('theme cycle', () => {
  it('cycles auto, light, dark, auto', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
});

describe('shortcut sheet rows', () => {
  const labels = (w: Workspace) => sheetRows(w, true).map((r) => r.label);

  it('Build lists the view keys before play and Escape last of the legacy rows', () => {
    const rows = sheetRows('build', true);
    const l = rows.map((r) => r.label);
    expect(l.indexOf('Plan, Elevation, 3D')).toBeLessThan(l.indexOf(get('time.playPause')!.label));
    expect(l.indexOf('Cancel, close or go back')).toBeGreaterThan(
      l.indexOf('Copy the selected object'),
    );
    expect(rows.find((r) => r.label === 'Plan, Elevation, 3D')!.keys).toBe('1, 2, 3');
    expect(rows.find((r) => r.label === 'Layer toggle by number')!.keys).toBe('Shift+1 to 5');
  });

  it('Brief shows card keys and no Build-only keys', () => {
    const l = labels('brief');
    const rows = sheetRows('brief', true);
    expect(rows.find((r) => r.ids.includes('brief.next'))!.keys).toBe('Right');
    expect(rows.find((r) => r.label === 'First card or last card')!.keys).toBe('Home, End');
    expect(rows.find((r) => r.ids.includes('brief.delete'))!.keys).toBe('Delete');
    expect(l).not.toContain('Plan, Elevation, 3D');
    expect(l).toContain('Cancel, close or go back');
  });

  it('Library shows only the global keys', () => {
    const ids = sheetRows('library', true).flatMap((r) => r.ids);
    expect(ids).toContain('edit.undo');
    expect(ids).toContain('help.shortcuts');
    expect(ids).not.toContain('time.playPause');
    expect(ids).not.toContain('brief.next');
  });
});
