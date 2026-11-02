// The strip's own commands (lane 13.1, spec section 8 Timeline menu): Save a frame here and Save
// the loop as a slice, registered with the rest (src/commands/commands.ts).
import { currentContext, execute } from '../../commands/registry';
import type { Command, CommandContext } from '../../commands/types';
import { useUi } from '../../state/ui';
import { NO_LOOP_REASON, round1 } from './layout';

const OPEN_FIRST = 'Open a profile first';

/**
 * Set the time to t, then save a frame through the registry: the C command of the workspace
 * (`card.save` in Build, `brief.snapshot` in Brief, which keeps the current card's view).
 */
export function saveFrameAt(t: number): true | string {
  const u = useUi.getState();
  u.setTime(round1(Math.max(0, t)));
  if (!u.timeOn) u.setTimeOn(true);
  return execute(u.workspace === 'brief' ? 'brief.snapshot' : 'card.save', currentContext());
}

/**
 * Take the loop into a slice: the current card's in Brief, a new frame card's in Build, through
 * `sliceFromLoop` in `src/features/brief/cards.ts`, loaded on demand so the Brief chunk stays lazy
 * (as `brief/commands.ts` does). Resolves true when it ran.
 */
export async function sliceFromLoop(): Promise<boolean> {
  const m = await import('../brief/cards');
  m.sliceFromLoop();
  return true;
}

const needDoc = (ctx: CommandContext) => (ctx.document.doc ? true : OPEN_FIRST);

export const timelineCommands: Command[] = [
  {
    id: 'timeline.saveFrameHere',
    label: 'Save a frame here',
    group: 'edit',
    kinds: ['timeline'],
    needsPointer: true,
    workspaces: ['build', 'brief'],
    when: (ctx) => {
      const ok = needDoc(ctx);
      if (ok !== true) return ok;
      return ctx.pointer?.tS != null ? true : 'Right-click the timeline first';
    },
    run: (ctx) => {
      const t = ctx.pointer?.tS;
      if (t != null) saveFrameAt(t);
    },
  },
  {
    id: 'timeline.saveSliceFromLoop',
    label: 'Save the loop as a slice',
    group: 'edit',
    kinds: ['timeline'],
    workspaces: ['build', 'brief'],
    when: (ctx) => {
      const ok = needDoc(ctx);
      if (ok !== true) return ok;
      return ctx.ui.loop ? true : NO_LOOP_REASON;
    },
    run: () => void sliceFromLoop(),
  },
];
