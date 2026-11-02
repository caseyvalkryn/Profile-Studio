// The Brief workspace (spec section 7, Brief; `legacy/mockup-v3.html` drawBrief, line 491):
// the card strip (220 px), the stage with the shared timeline strip under it (src/features/
// timeline), the notes panel (300 px). The strip always shows (lane 12.3): a card whose Timeline
// display is off collapses it to its play bar (`brief-tl-collapsed`, brief.css). Mounting stashes the Build view
// and applies the current card; unmounting restores Build as it was (principle 8.1). The print
// deck is a hidden list, one page per card, shown by the print stylesheet (brief.css): the card
// name, its time (or slice), the render, the caption, the Frame panel's lines as a table, notes.
import '../../board/board.css';
import './brief.css';
import { useEffect, useMemo, useRef } from 'react';
import type { Card, Vignette } from '../../domain/types';
import { render } from '../../board';
import { useDocument } from '../../state/document';
import { useUi, type Units } from '../../state/ui';
import { usePlayback } from '../build/bar/usePlayback';
import { boardDerived, boardScene } from '../build/board/derived';
import { fmtTime, formatAltitude, formatRange, formatSpeed } from '../shared/units';
import Timeline from '../timeline/Timeline';
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
import { mmss } from '../../engine/tokens';
import { cardTime, daText, frameOf, marginText, sliceText } from './frameData';
import { toCardRec } from './toCardRec';

/** The print render: the page width at 96 dpi less margins, 16:9. */
export const PRINT_W = 1000;
export const PRINT_H = 562;

/** The Frame panel's lines of a card at its time, as the print deck's table rows. */
function FrameTable({ v, card, units }: { v: Vignette; card: Card; units: Units }) {
  const t = cardTime(card);
  const ref = toCardRec(v, card).cam.ref;
  const f = frameOf(boardScene(v), boardDerived(v), t, card.focus, ref);
  if (!f.threats.length) return null;
  return (
    <table className="brief-page-frame">
      <thead>
        <tr>
          <th>Threat</th>
          <th>Step</th>
          <th>Next</th>
          <th>Range</th>
          <th>Height</th>
          <th>Speed</th>
          <th>Closing</th>
          <th>Held by</th>
          <th>Margin</th>
          <th>DA</th>
        </tr>
      </thead>
      <tbody>
        {f.threats.map((r) => (
          <tr key={r.key}>
            <td>{r.id}</td>
            <td>{r.reached?.label ?? 'none'}</td>
            <td>{r.next && t != null ? `${r.next.label} in ${mmss(r.next.t - t)}` : ''}</td>
            <td>{r.at ? formatRange(r.at.r, units) : ''}</td>
            <td>{r.at ? formatAltitude(r.at.z, units) : ''}</td>
            <td>{r.at ? formatSpeed(r.at.spd, units) : ''}</td>
            <td>{r.at ? formatSpeed(r.at.vc, units) : ''}</td>
            <td>{r.holders.map((h) => h.id).join(' ')}</td>
            <td>{marginText(r.margin)?.replace('margin ', '') ?? ''}</td>
            <td>{daText(r.daT, t)}</td>
          </tr>
        ))}
        {f.more ? (
          <tr>
            <td colSpan={10}>and {f.more} more</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/**
 * One page per card (spec section 10): the name, the frame time or the slice, the render, the
 * caption, the Frame panel's lines and the presenter notes.
 */
export function PrintDeck({ v }: { v: Vignette }) {
  const units = useUi((s) => s.units);
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
          <p className="brief-page-time">
            {card.clip ? sliceText(card.clip) : card.tS == null ? 'Full run' : fmtTime(card.tS)}
          </p>
          <div className="brief-page-render" dangerouslySetInnerHTML={{ __html: svg }} />
          {card.caption ? <p className="brief-page-caption">{card.caption}</p> : null}
          <FrameTable v={v} card={card} units={units} />
          {card.notes ? <p className="brief-page-notes">{card.notes}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** The fields of a card that applying it reads: a caption or notes edit does not re-apply it. */
const lookOf = (c: Card) => JSON.stringify([c.key, c.view, c.layers, c.focus, c.tS, c.clip]);
const cardKeyOf = (look: string) => (JSON.parse(look) as [string])[0];

export default function BriefWorkspace() {
  // The playback clock runs here too, so P plays while the card hides its timeline.
  usePlayback();
  const v = useDocument((s) => s.doc);
  const cardKey = useUi((s) => s.cardKey);
  const index = v ? currentIndex(v.cards, cardKey) : -1;
  const card = v && index >= 0 ? (v.cards[index] ?? null) : null;
  // The elapsed clock starts when Brief opens (the presenter aid under the stage).
  const startMs = useRef(0);
  useEffect(() => {
    startMs.current = Date.now();
  }, []);

  // Enter: stash the Build view once. Leave: restore it.
  useEffect(() => {
    stashBuild();
    return () => restoreBuild();
  }, []);

  // The current card's view, time (or slice), layers and focus go to the Build stores (so Build
  // and the stage agree), on open and whenever those fields change. A caption, notes or name edit
  // leaves the time, the loop and the playback alone (lane 13.2).
  const look = card ? lookOf(card) : null;
  useEffect(() => {
    const st = useDocument.getState().doc;
    const c = st && look ? st.cards.find((x) => x.key === cardKeyOf(look)) : null;
    if (st && c) applyCard(st, c);
  }, [look]);

  if (!v) return null;
  return (
    <main aria-label="Brief" className="brief flex-1 min-h-0">
      <div className="brief-screen grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)_300px]">
        <CardStrip v={v} current={index} onPick={goTo} onAdd={addCard} />
        <div className="flex min-h-0 min-w-0 flex-col">
          <Stage v={v} card={card} index={index} onStep={step} startMs={startMs} />
          <div
            className={`shrink-0 px-[18px] pb-3${card && !card.displays.timeline ? ' brief-tl-collapsed' : ''}`}
            data-testid="brief-timeline"
          >
            <Timeline mode="brief" />
          </div>
        </div>
        <Notes v={v} card={card} index={index} onMove={moveCard} onDelete={deleteCard} />
      </div>
      <PrintDeck v={v} />
    </main>
  );
}
