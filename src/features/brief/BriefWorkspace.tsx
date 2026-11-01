// The Brief workspace (spec section 7, Brief; `legacy/mockup-v3.html` drawBrief, line 491):
// the card strip (220 px), the stage, the notes panel (300 px). Mounting stashes the Build view
// and applies the current card; unmounting restores Build as it was (principle 8.1). The print
// deck is a hidden list, one page per card, shown by the print stylesheet (brief.css).
import '../../board/board.css';
import './brief.css';
import { useEffect, useMemo } from 'react';
import type { Vignette } from '../../domain/types';
import { render } from '../../board';
import { useDocument } from '../../state/document';
import { useUi } from '../../state/ui';
import { boardDerived, boardScene } from '../build/board/derived';
import CardStrip from './CardStrip';
import Notes from './Notes';
import Stage from './Stage';
import {
  addCard,
  applyCard,
  currentIndex,
  deleteCard,
  goTo,
  moveCard,
  restoreBuild,
  stashBuild,
  step,
} from './cards';
import { toCardRec } from './toCardRec';

/** The print render: the page width at 96 dpi less margins, 16:9. */
export const PRINT_W = 1000;
export const PRINT_H = 562;

/** One page per card: the render, the caption and the presenter notes (spec section 10). */
export function PrintDeck({ v }: { v: Vignette }) {
  const pages = useMemo(
    () =>
      v.cards.map((c) => ({
        card: c,
        svg: render.card(boardScene(v), boardDerived(v), toCardRec(v, c), {
          W: PRINT_W,
          H: PRINT_H,
        }),
      })),
    [v],
  );
  return (
    <ol className="brief-print" aria-hidden="true">
      {pages.map(({ card, svg }, i) => (
        <li key={card.key} className="brief-page" data-testid="brief-page">
          <h2>
            {i + 1}. {card.name}
          </h2>
          <div className="brief-page-render" dangerouslySetInnerHTML={{ __html: svg }} />
          {card.caption ? <p className="brief-page-caption">{card.caption}</p> : null}
          {card.notes ? <p className="brief-page-notes">{card.notes}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export default function BriefWorkspace() {
  const v = useDocument((s) => s.doc);
  const cardKey = useUi((s) => s.cardKey);
  const index = v ? currentIndex(v.cards, cardKey) : -1;
  const card = v && index >= 0 ? (v.cards[index] ?? null) : null;

  // Enter: stash the Build view once. Leave: restore it.
  useEffect(() => {
    stashBuild();
    return () => restoreBuild();
  }, []);

  // The current card's view, time, layers and focus go to the Build stores (so Build and the
  // stage agree), on open and whenever the card changes.
  useEffect(() => {
    if (v && card) applyCard(v, card);
  }, [v, card]);

  if (!v) return null;
  return (
    <main aria-label="Brief" className="brief flex-1 min-h-0">
      <div className="brief-screen grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)_300px]">
        <CardStrip v={v} current={index} onPick={goTo} onAdd={addCard} />
        <Stage v={v} card={card} index={index} onStep={step} />
        <Notes v={v} card={card} index={index} onMove={moveCard} onDelete={deleteCard} />
      </div>
      <PrintDeck v={v} />
    </main>
  );
}
