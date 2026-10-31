import { testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { SCHEMA } from '../../domain';
import { exportJson } from '../../state/persist';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { execute } from '../../commands/registry';
import '../../commands/commands';
import { libraryJson } from './exportLibrary';
import { EMPTY_IMPORT, importedText, importText } from './ImportDialog';
import { applyTheme, loadTheme, saveTheme, THEME_KEY } from './theme';
import { hideToast, redidText, TOAST_MS, undidText, useToast } from './toastStore';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    m,
  };
};

beforeEach(() => {
  useUi.setState(UI_DEFAULTS);
  hideToast();
});

describe('theme persistence', () => {
  it('saves and loads the theme under its own key', () => {
    const s = memory();
    expect(loadTheme(s)).toBe('auto');
    saveTheme('dark', s);
    expect(JSON.parse(s.m.get(THEME_KEY)!)).toEqual({ theme: 'dark' });
    expect(loadTheme(s)).toBe('dark');
  });

  it('a bad stored value falls back to auto', () => {
    const s = memory();
    s.setItem(THEME_KEY, '{"theme":"neon"}');
    expect(loadTheme(s)).toBe('auto');
    s.setItem(THEME_KEY, 'not json');
    expect(loadTheme(s)).toBe('auto');
  });

  it('auto removes data-theme, light and dark set it', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyTheme('auto', root);
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('the theme command cycles the ui theme', () => {
    useDocument.getState().open(testVignette());
    execute('view.theme');
    expect(useUi.getState().theme).toBe('light');
    execute('view.theme');
    execute('view.theme');
    expect(useUi.getState().theme).toBe('auto');
  });
});

describe('undo toast', () => {
  it('names the edit undone or redone', () => {
    expect(undidText('Delete')).toBe('Undid: Delete.');
    expect(redidText('Move')).toBe('Redid: Move.');
    expect(undidText(undefined)).toBe('Undid: edit.');
    expect(TOAST_MS).toBe(2400);
  });

  it('undo and redo show the toast with the edit label', () => {
    useDocument.getState().open(testVignette());
    useDocument.getState().edit('Rename profile', (d) => {
      d.name = 'x';
    });
    execute('edit.undo');
    expect(useToast.getState()).toMatchObject({ text: 'Undid: Rename profile.', visible: true });
    execute('edit.redo');
    expect(useToast.getState().text).toBe('Redid: Rename profile.');
  });
});

describe('import and export text', () => {
  it('an empty paste asks for a profile', async () => {
    expect(await importText('   ')).toEqual([EMPTY_IMPORT]);
  });

  it('text that is not JSON shows the importJson problem and stores nothing', async () => {
    expect(await importText('{nope')).toEqual(['This file is not JSON.']);
  });

  it('the import toast counts profiles and replacements', () => {
    expect(importedText(1, 0)).toBe('Imported 1 profile.');
    expect(importedText(3, 2)).toBe('Imported 3 profiles, 2 replaced.');
  });

  it('the library export carries the current schema and round-trips through import', () => {
    const v = testVignette();
    const json = JSON.parse(libraryJson([v]));
    expect(json.schema).toBe(SCHEMA);
    expect(json.library).toHaveLength(1);
    expect(JSON.parse(exportJson(v)).id).toBe(v.id);
  });
});
