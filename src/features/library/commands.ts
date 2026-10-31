// Library commands (lane 9.1.4). Registered by the orchestrator after merge; the Library screen
// calls the same functions, so it works before registration.
import type { Command } from '../../commands/types';
import { exportLibraryFile, pickAndImport } from './io';
import { newFromTemplate, newProfile, templatesBlankLast } from './newProfile';

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
      if (typeof arg === 'string') newFromTemplate(arg);
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
    id: 'library.import',
    label: 'Import',
    group: 'file',
    when: always,
    run: () => void pickAndImport(),
  },
];
