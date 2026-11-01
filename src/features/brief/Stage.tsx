// The stage (`legacy/mockup-v3.html` drawBrief line 493 and drawBriefStage line 500): the head
// (the card name, "n of m · profile id", Previous and Next), the card's render through the
// board at the measured size (focus strong, the rest dim: the renderer's `focus`), and the
// caption. With no cards: the profile name as head and the question as caption.
import type { Card, Vignette } from '../../domain/types';
import { render } from '../../board';
import { useSize } from '../shared/useSize';
import { boardDerived, boardScene } from '../build/board/derived';
import { toCardRec } from './toCardRec';

/** The mockup's stage floor: at least 320 by 300 render units. */
export const stageSize = (w: number, h: number) => ({
  W: Math.max(320, Math.round(w)),
  H: Math.max(300, Math.round(h)),
});

export default function Stage({
  v,
  card,
  index,
  onStep,
}: {
  v: Vignette;
  card: Card | null;
  index: number;
  onStep: (d: number) => void;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const n = v.cards.length;
  const sz = stageSize(size.width, size.height);
  const svg =
    card && sz.W > 0
      ? render.card(boardScene(v), boardDerived(v), toCardRec(v, card), sz, false)
      : '';
  const question = v.questions[0]?.text ?? '';
  return (
    <section
      aria-label="Stage"
      className="brief-show flex min-h-0 min-w-0 flex-col px-[18px] pt-3.5 pb-4"
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 text-[15px] leading-5 font-medium text-text">
          {card ? card.name : v.name}
        </h2>
        <span className="font-mono text-xs text-muted" data-testid="brief-head">
          {card ? `${index + 1} of ${n} · ${v.id}` : ''}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            className="ps-btn quiet"
            aria-label="Previous card"
            disabled={!n}
            onClick={() => onStep(-1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="ps-btn quiet"
            aria-label="Next card"
            disabled={!n}
            onClick={() => onStep(1)}
          >
            Next
          </button>
        </span>
      </div>
      <div
        ref={ref}
        className="brief-stage min-h-[360px] flex-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        data-testid="brief-stage"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="m-0 min-h-[30px] max-w-[72ch] px-0.5 pt-2.5 text-[15px] leading-[1.5] text-text">
        {card ? card.caption : question}
      </p>
    </section>
  );
}
