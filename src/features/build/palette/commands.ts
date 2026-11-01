// Quick-add and formation commands. Same ids, labels and keys as the stubs in
// src/commands/commands.ts; lane 9.2.6 registers these in their place.
import type { Command, CommandContext } from '../../../commands/types';
import { selectedThreatKey } from './pick';
import { openQuickAdd, useQuickAdd } from './store';

const OPEN_FIRST = 'Open a profile first';

const always = (ctx: CommandContext): true | string => (ctx.document.doc ? true : OPEN_FIRST);

/** The selected threat's key when it has two or more waypoints, else why formation is off. */
export function formationSource(ctx: CommandContext): string {
  const doc = ctx.document.doc;
  if (!doc) return OPEN_FIRST;
  const key = selectedThreatKey(doc, ctx.ui.selectedKeys);
  const t = key ? doc.threats.find((x) => x.key === key) : null;
  if (!t || t.path.length < 2) return 'Select a threat with two or more waypoints';
  return t.key;
}

const isKey = (doc: CommandContext['document']['doc'], s: string) =>
  Boolean(doc?.threats.some((t) => t.key === s));

export const paletteCommands: Command[] = [
  {
    id: 'build.quickAdd',
    label: 'Quick-add palette',
    group: 'map',
    shortcut: 'A',
    workspaces: ['build'],
    when: always,
    run: () => openQuickAdd('add'),
  },
  {
    id: 'build.addSensor',
    label: 'Add a sensor',
    group: 'map',
    shortcut: 'S',
    workspaces: ['build'],
    when: always,
    run: () => openQuickAdd('sensors'),
  },
  {
    id: 'build.addArea',
    label: 'Add an area',
    group: 'map',
    shortcut: 'V',
    workspaces: ['build'],
    when: always,
    run: () => openQuickAdd('areas'),
  },
  {
    id: 'build.addEvent',
    label: 'Add an event',
    group: 'map',
    shortcut: 'E',
    workspaces: ['build'],
    when: (ctx) => {
      if (!ctx.document.doc) return OPEN_FIRST;
      return ctx.document.doc.threats.length ? true : 'Add a threat first';
    },
    run: () => openQuickAdd('events'),
  },
  {
    id: 'build.formation',
    label: 'Formation',
    group: 'map',
    shortcut: 'Shift+F',
    workspaces: ['build'],
    when: (ctx) => {
      const s = formationSource(ctx);
      return isKey(ctx.document.doc, s) ? true : s;
    },
    run: () => useQuickAdd.getState().setFormationOpen(true),
  },
];
