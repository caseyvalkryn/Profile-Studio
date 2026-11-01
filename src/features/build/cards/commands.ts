// The card commands (spec section 8, Commands; mockup `t-card`). `cardCommands` joins the shell
// registry (Save as card, C, and the reference cycle); `cardMenuCommands` is the card menu.
// Neither imports src/commands/commands.ts, which spreads both.
import type { Command, CommandContext } from '../../../commands/types';
import type { Card, Vignette } from '../../../domain/types';
import { requestRoute } from '../../library/newProfile';
import { useBoard } from '../board/store';
import { applyCard, deleteCard, duplicateCard, moveCard, saveCard } from './cards';

const OPEN_FIRST = 'Open a profile first';
const SELECT_CARD = 'Select a card first';

/** The card a menu command acts on: the menu target key, else the first selected card. */
function cardOf(ctx: CommandContext, arg?: unknown): Card | null {
  const doc = ctx.document.doc;
  if (!doc) return null;
  const keys = typeof arg === 'string' ? [arg] : ctx.ui.selectedKeys;
  for (const k of keys) {
    const c = doc.cards.find((x) => x.key === k);
    if (c) return c;
  }
  return null;
}

const whenCard = (ctx: CommandContext) =>
  !ctx.document.doc ? OPEN_FIRST : cardOf(ctx) ? true : SELECT_CARD;

/** The range references in cycle order: the asset, its edge, then every system display id. */
export function refCycle(doc: Vignette | null): string[] {
  const ids = doc ? [...doc.sensors, ...doc.effectors, ...doc.nodes].map((s) => s.id) : [];
  return ['asset', 'asset-edge', ...ids];
}

const REF_NAMES: Record<string, string> = { asset: 'asset', 'asset-edge': 'asset edge' };

const viewRef: Command = {
  id: 'view.ref',
  get label() {
    const ref = useBoard.getState().ref;
    return `Range reference: ${REF_NAMES[ref] ?? ref}`;
  },
  group: 'view',
  // Explicit, so registerCommands keeps this object and its label getter.
  workspaces: ['build'],
  when: (ctx) => (ctx.document.doc ? true : OPEN_FIRST),
  run: (ctx) => {
    const list = refCycle(ctx.document.doc);
    const b = useBoard.getState();
    const i = list.indexOf(b.ref);
    b.set({ ref: list[(i + 1) % list.length]! });
  },
};

export const cardCommands: Command[] = [
  {
    id: 'card.save',
    label: 'Save as card',
    group: 'view',
    shortcut: 'C',
    workspaces: ['build'],
    when: (ctx) => (ctx.document.doc ? true : OPEN_FIRST),
    run: (ctx) => {
      // After the current card (the Brief's), as the mockup's cardIx does; the new card is current.
      const k = saveCard(ctx.ui.cardKey);
      if (k) ctx.ui.setCardKey(k);
    },
  },
  viewRef,
];

export const cardMenuCommands: Command[] = [
  {
    id: 'card.open',
    label: 'Open',
    group: 'view',
    workspaces: ['build'],
    when: whenCard,
    run: (ctx, arg) => {
      const c = cardOf(ctx, arg);
      if (c) applyCard(c);
    },
  },
  {
    id: 'card.openInBrief',
    label: 'Open in Brief',
    group: 'view',
    workspaces: ['build'],
    when: whenCard,
    run: (ctx, arg) => {
      const c = cardOf(ctx, arg);
      if (!c) return;
      ctx.ui.setSelection([c.key]);
      requestRoute('/brief');
    },
  },
  {
    id: 'card.duplicate',
    label: 'Duplicate',
    group: 'edit',
    workspaces: ['build'],
    when: whenCard,
    run: (ctx, arg) => {
      const c = cardOf(ctx, arg);
      const k = c ? duplicateCard(c.key) : null;
      if (k) ctx.ui.setSelection([k]);
    },
  },
  {
    id: 'card.moveUp',
    label: 'Move up',
    group: 'edit',
    workspaces: ['build'],
    when: (ctx) => {
      const ok = whenCard(ctx);
      if (ok !== true) return ok;
      return ctx.document.doc!.cards[0]?.key === cardOf(ctx)!.key ? 'The card is first' : true;
    },
    run: (ctx, arg) => {
      const c = cardOf(ctx, arg);
      if (c) moveCard(c.key, -1);
    },
  },
  {
    id: 'card.moveDown',
    label: 'Move down',
    group: 'edit',
    workspaces: ['build'],
    when: (ctx) => {
      const ok = whenCard(ctx);
      if (ok !== true) return ok;
      const cards = ctx.document.doc!.cards;
      return cards[cards.length - 1]?.key === cardOf(ctx)!.key ? 'The card is last' : true;
    },
    run: (ctx, arg) => {
      const c = cardOf(ctx, arg);
      if (c) moveCard(c.key, 1);
    },
  },
  {
    id: 'card.delete',
    label: 'Delete card',
    group: 'edit',
    workspaces: ['build'],
    when: whenCard,
    run: (ctx, arg) => {
      const c = cardOf(ctx, arg);
      if (c && deleteCard(c.key)) ctx.ui.setSelection([]);
    },
  },
];
