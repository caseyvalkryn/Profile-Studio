// Board key commands (legacy 46-keys.js board keys), exported for lane 9.2.6 to register. The
// stub ids map.gridSnap (G), view.zoomIn (=) and view.zoomOut (-) keep their ids and shortcuts;
// the nudge commands carry no shortcut: the arrows belong to time.back1/forward1 in every
// workspace, so the board binds them itself while it has focus and a selection (gestures.ts).
import type { Command, CommandContext } from '../../../commands/types';
import { useBoard } from './store';
import { nudge, zoom } from './tools';

const needDoc = (ctx: CommandContext) => (ctx.document.doc ? true : 'Open a vignette first');
const needSel = (ctx: CommandContext) =>
  ctx.document.doc
    ? ctx.ui.selectedKeys.length
      ? true
      : 'Select an object first'
    : 'Open a vignette first';

export const boardCommands: Command[] = [
  {
    id: 'map.gridSnap',
    label: 'Grid snap',
    group: 'map',
    shortcut: 'G',
    workspaces: ['build'],
    when: needDoc,
    run: () => {
      const b = useBoard.getState();
      b.set({ snap: !b.snap });
    },
  },
  {
    id: 'view.zoomIn',
    label: 'Zoom in',
    group: 'view',
    shortcut: '=',
    workspaces: ['build'],
    when: needDoc,
    run: () => zoom(1.25, 0, 0),
  },
  {
    id: 'view.zoomOut',
    label: 'Zoom out',
    group: 'view',
    shortcut: '-',
    workspaces: ['build'],
    when: needDoc,
    run: () => zoom(1 / 1.25, 0, 0),
  },
  {
    id: 'map.nudgeLeft',
    label: 'Nudge left',
    group: 'map',
    workspaces: ['build'],
    when: needSel,
    run: (_ctx, arg) => nudge(arg === 'large' ? -5 : -1, 0),
  },
  {
    id: 'map.nudgeRight',
    label: 'Nudge right',
    group: 'map',
    workspaces: ['build'],
    when: needSel,
    run: (_ctx, arg) => nudge(arg === 'large' ? 5 : 1, 0),
  },
  {
    id: 'map.nudgeUp',
    label: 'Nudge up',
    group: 'map',
    workspaces: ['build'],
    when: needSel,
    run: (_ctx, arg) => nudge(0, arg === 'large' ? 5 : 1),
  },
  {
    id: 'map.nudgeDown',
    label: 'Nudge down',
    group: 'map',
    workspaces: ['build'],
    when: needSel,
    run: (_ctx, arg) => nudge(0, arg === 'large' ? -5 : -1),
  },
];

/** The arrow keys the board handles itself while focused with a selection. */
export const NUDGE_KEYS: Record<string, string> = {
  ArrowLeft: 'map.nudgeLeft',
  ArrowRight: 'map.nudgeRight',
  ArrowUp: 'map.nudgeUp',
  ArrowDown: 'map.nudgeDown',
};
