// Library commands (lane 9.1.4, review 9.1 F-19, F-20). New and New from template run in every
// workspace. Export library downloads the library file; the palette has no other row of that
// name (`file.export` is "Export", the dialog). There is no library Import command: `file.import`
// opens the one Import dialog. `/` focuses the Library search; spec section 8 has no N key, and
// Cmd+N covers New.
import type { Command } from '../../commands/types';
import { exportLibraryFile } from './io';
import { newFromTemplate, newProfile, templatesBlankLast } from './newProfile';

/** The Library search field's id, for the `/` key. */
export const SEARCH_ID = 'lib-search';

const always = () => true as const;

export const libraryCommands: Command[] = [
  {
    id: 'profile.new',
    label: 'New profile',
    group: 'file',
    shortcut: 'Mod+N',
    when: always,
    run: () => void newProfile(),
  },
  {
    id: 'profile.newFromTemplate',
    label: 'New from template',
    group: 'file',
    needsArg: true,
    options: templatesBlankLast().map((t) => ({ value: t.id, label: t.name })),
    when: always,
    run: (_ctx, arg) => {
      if (typeof arg === 'string') void newFromTemplate(arg);
    },
  },
  {
    id: 'library.export',
    label: 'Export library',
    group: 'file',
    when: always,
    run: () => void exportLibraryFile(),
  },
  {
    id: 'library.search',
    label: 'Search the library',
    group: 'edit',
    shortcut: '/',
    workspaces: ['library'],
    when: always,
    run: () => document.getElementById(SEARCH_ID)?.focus(),
  },
];
