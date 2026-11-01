// The card strip (`legacy/mockup-v3.html` drawCardStrip, line 498): one button per card with its
// thumbnail (render.card in thumb mode, 300 by 170), "n. name" and the small line "view · t+200 s
// · focus ids"; aria-current marks the current card. Under the deck, "Add card from current
// scene"; with no cards, the hint and that button are the whole strip.
import type { Card, Vignette } from '../../domain/types';
import { render } from '../../board';
import { boardDerived, boardScene } from '../build/board/derived';
import { cardLine, toCardRec } from './toCardRec';

export const THUMB_W = 300;
export const THUMB_H = 170;

export function CardThumb({ v, card }: { v: Vignette; card: Card }) {
  const svg = render.card(
    boardScene(v),
    boardDerived(v),
    toCardRec(v, card),
    { W: THUMB_W, H: THUMB_H },
    true,
  );
  return (
    <span
      className="block bg-surface-0 [&>svg]:pointer-events-none [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg aria-hidden="true" ') }}
    />
  );
}

export default function CardStrip({
  v,
  current,
  onPick,
  onAdd,
}: {
  v: Vignette;
  current: number;
  onPick: (i: number) => void;
  onAdd: () => void;
}) {
  const cards = v.cards;
  return (
    <aside
      aria-label="Cards"
      className="brief-cards flex flex-col gap-2 overflow-auto px-2.5 pt-3 pb-6"
    >
      {cards.length ? (
        cards.map((c, i) => (
          <button
            key={c.key}
            type="button"
            className="brief-card block w-full overflow-hidden rounded-sm border border-surface-3 bg-surface-0 p-0 text-left"
            aria-current={i === current ? 'true' : undefined}
            aria-label={`Card ${i + 1}: ${c.name}`}
            onClick={() => onPick(i)}
          >
            <CardThumb v={v} card={c} />
            <span className="block border-t border-surface-3 bg-surface-1 px-2 py-1 text-xs font-medium text-text">
              {i + 1}. {c.name}
              <small className="block font-mono text-[10.5px] font-normal text-muted">
                {cardLine(toCardRec(v, c))}
              </small>
            </span>
          </button>
        ))
      ) : (
        <p className="ps-hint">
          No cards yet. In Build, set the camera, layers, time and selection, then Save as card.
        </p>
      )}
      <button type="button" className="ps-btn mt-1.5 self-start" onClick={onAdd}>
        Add card from current scene
      </button>
    </aside>
  );
}
