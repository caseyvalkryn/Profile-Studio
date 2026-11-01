// Rail commands: hide the scene list, and the add buttons of the groups that have no key of their
// own (Sensors, Areas and Events use build.addSensor, build.addArea and build.addEvent).
import type { Command } from '../../../commands/types';
import { openQuickAdd, type AddGroupId } from '../palette/store';

/** The command each group's add button runs. */
export const RAIL_ADD_COMMAND: Record<AddGroupId, string> = {
  threats: 'rail.addThreat',
  sensors: 'build.addSensor',
  effectors: 'rail.addEffector',
  nodes: 'rail.addNode',
  areas: 'build.addArea',
  planes: 'rail.addPlane',
  events: 'build.addEvent',
};

const add = (id: string, label: string, scope: AddGroupId): Command => ({
  id,
  label,
  group: 'map',
  workspaces: ['build'],
  when: (ctx) => (ctx.document.doc ? true : 'Open a profile first'),
  run: () => openQuickAdd(scope),
});

export const railCommands: Command[] = [
  {
    id: 'rail.hide',
    label: 'Hide the scene list',
    group: 'view',
    workspaces: ['build'],
    when: () => true,
    run: (ctx) => ctx.ui.togglePanel('list', false),
  },
  add('rail.addThreat', 'Add a threat', 'threats'),
  add('rail.addEffector', 'Add an effector', 'effectors'),
  add('rail.addNode', 'Add a C2 or TSPI station', 'nodes'),
  add('rail.addPlane', 'Add a height plane', 'planes'),
];
