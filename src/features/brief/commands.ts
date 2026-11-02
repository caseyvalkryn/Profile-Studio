// The Brief commands (spec section 8, Brief keys): Right or Space next card, Left previous,
// Home and End, Up and Down move the current card, Delete removes it with undo; P plays or
// pauses the time, C saves a frame as a card, L shows or hides the card's timeline, = and -
// zoom the card about the stage middle. Plus the
// palette commands: the readout toggle, Add card from current scene and Print brief. All are active in Brief only;
// the registry scopes the shortcuts, so the Build keys they share (Space, the arrows, Home, End,
// Delete) stay off here. The mockup's keydown handler is at `legacy/mockup-v3.html` line 509.
// The card logic (`./cards`) loads with the Brief chunk: each `run` imports it on demand, so the
// entry chunk carries only these definitions. In Brief the chunk is already loaded, so the
// import resolves in a microtask.
import type { Command, CommandContext } from '../../commands/types';

type Cards = typeof import('./cards');
const cards = () => import('./cards');
const run = (f: (m: Cards) => void) => () => void cards().then(f);

const BRIEF = ['brief'] as const;

/** The current card's index: the keyed card, else the first (cards.ts `currentIndex`, inlined). */
const currentIndex = (list: readonly { key: string }[], key: string | null) => {
  if (!list.length) return -1;
  const i = key ? list.findIndex((c) => c.key === key) : -1;
  return i < 0 ? 0 : i;
};

const needDoc = (ctx: CommandContext) => (ctx.document.doc ? true : 'Open a profile first');
const needCards = (ctx: CommandContext): true | string => {
  const ok = needDoc(ctx);
  if (ok !== true) return ok;
  return ctx.document.doc!.cards.length ? true : 'No cards yet';
};
const atIndex = (ctx: CommandContext) =>
  currentIndex(ctx.document.doc?.cards ?? [], ctx.ui.cardKey);

export const briefCommands: Command[] = [
  {
    id: 'brief.next',
    label: 'Next card',
    group: 'view',
    shortcut: 'ArrowRight',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.step(1)),
  },
  {
    id: 'brief.space',
    label: 'Next card',
    group: 'view',
    shortcut: 'Space',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.step(1)),
  },
  {
    id: 'brief.back',
    label: 'Previous card',
    group: 'view',
    shortcut: 'ArrowLeft',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.step(-1)),
  },
  {
    id: 'brief.first',
    label: 'First card',
    group: 'view',
    shortcut: 'Home',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.goTo(0)),
  },
  {
    id: 'brief.last',
    label: 'Last card',
    group: 'view',
    shortcut: 'End',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.goTo(-1)),
  },
  {
    id: 'brief.moveUp',
    label: 'Move the card up',
    group: 'edit',
    shortcut: 'ArrowUp',
    workspaces: BRIEF,
    when: (ctx) => {
      const ok = needCards(ctx);
      if (ok !== true) return ok;
      return atIndex(ctx) > 0 ? true : 'The card is first';
    },
    run: run((m) => m.moveCard(-1)),
  },
  {
    id: 'brief.moveDown',
    label: 'Move the card down',
    group: 'edit',
    shortcut: 'ArrowDown',
    workspaces: BRIEF,
    when: (ctx) => {
      const ok = needCards(ctx);
      if (ok !== true) return ok;
      return atIndex(ctx) < ctx.document.doc!.cards.length - 1 ? true : 'The card is last';
    },
    run: run((m) => m.moveCard(1)),
  },
  {
    id: 'brief.delete',
    label: 'Delete the card',
    group: 'edit',
    shortcut: 'Delete',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.deleteCard()),
  },
  {
    id: 'brief.play',
    label: 'Play or pause',
    group: 'time',
    shortcut: 'P',
    workspaces: BRIEF,
    when: needDoc,
    // A card with a slice plays the slice: from its start when the cursor is outside it (lane
    // 13.2), with the slice as the loop at its rate.
    run: (ctx) => {
      const ui = ctx.ui;
      if (!ui.playing) {
        const list = ctx.document.doc?.cards ?? [];
        const clip = list[currentIndex(list, ui.cardKey)]?.clip;
        if (clip) {
          ui.setLoop({ startS: clip.t0S, endS: clip.t1S });
          ui.setRate(clip.rate);
          if (!ui.timeOn || ui.tS < clip.t0S || ui.tS >= clip.t1S) {
            ui.setTimeOn(true);
            ui.setTime(clip.t0S);
          }
        }
      }
      ui.setPlaying(!ui.playing);
    },
  },
  {
    id: 'brief.snapshot',
    label: 'Save a frame as a card',
    group: 'edit',
    shortcut: 'C',
    workspaces: BRIEF,
    when: needDoc,
    run: run((m) => m.snapshotCard()),
  },
  {
    id: 'brief.timeline',
    label: 'Show or hide the timeline',
    group: 'view',
    shortcut: 'L',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.toggleDisplay('timeline')),
  },
  {
    id: 'brief.zoomIn',
    label: 'Zoom the card in',
    group: 'view',
    shortcut: '=',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.zoomCard(m.ZOOM_STEP)),
  },
  {
    id: 'brief.zoomOut',
    label: 'Zoom the card out',
    group: 'view',
    shortcut: '-',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.zoomCard(1 / m.ZOOM_STEP)),
  },
  {
    id: 'brief.fit',
    label: 'Fit the card',
    group: 'view',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => {
      const key = m.currentCard(m.docNow(), m.cardKeyNow())?.key;
      if (key) m.fitCard(key);
    }),
  },
  {
    id: 'brief.readout',
    label: 'Show or hide the readout',
    group: 'view',
    workspaces: BRIEF,
    when: needCards,
    run: run((m) => m.toggleDisplay('readout')),
  },
  {
    id: 'brief.add',
    label: 'Add card from current scene',
    group: 'edit',
    workspaces: BRIEF,
    when: needDoc,
    run: run((m) => m.addCard()),
  },
  {
    id: 'brief.print',
    label: 'Print brief',
    group: 'file',
    workspaces: BRIEF,
    when: needCards,
    run: () => window.print(),
  },
];
