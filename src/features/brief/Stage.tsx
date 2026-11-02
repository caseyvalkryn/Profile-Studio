// The stage (`legacy/mockup-v3.html` drawBrief line 493 and drawBriefStage line 500): the head
// (the card name, "n of m · profile id", the live time, the Timeline, Readout and Frame buttons,
// Previous and Next), the card's render through the board at the measured size (focus strong,
// the rest dim: the renderer's `focus`) at the live time (the card's time on open; the timeline
// and the keys move it), and the caption. Under the caption, when the card shows them: the
// readout line of the threat in focus at the time cursor (reference `#st-readout`) and the
// presenter aids (the next card and the elapsed clock, reference `#st-next` and `#st-elapsed`).
// With no current card (lane 12.3): the live scene at the stashed Build view, through the same
// render with a transient card that is never saved; the head reads the profile name and "Build
// view · id", the caption is the question and the readout line always shows. Save a screenshot
// downloads the stage as a PNG (./screenshot); Save a frame as a card keeps the view. Lane 13.2:
// a card with a slice reads "t+0:10 to t+0:40 · x2" in the head beside the live time; Set the
// slice from the loop (Scissors) takes the strip's loop into the card; an empty caption shows
// what to write; the aids name the step of the threat in focus and the next card's time.
import { Camera, ChartNoAxesGantt, Gauge, ImageIcon, Scissors } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type RefObject } from 'react';
import type { Card, Vignette } from '../../domain/types';
import { render, type CardRec } from '../../board';
import { useUi, type Units } from '../../state/ui';
import { Tooltip } from '../../ui/Tooltip';
import { focusRing } from '../../ui/focus';
import { useSize } from '../shared/useSize';
import { fmtTime, formatAltitude, formatRange, formatSpeed } from '../shared/units';
import { boardDerived, boardScene } from '../build/board/derived';
import { CardThumb } from './CardStrip';
import { NO_LOOP_REASON, stepAt } from '../timeline/layout';
import { keyPoints } from '../timeline/stages';
import { cardFromBuild, sliceFromLoop, snapshotBuild, snapshotCard, toggleDisplay } from './cards';
import { Glyph } from './Frame';
import { captionPlaceholder, sliceText } from './frameData';
import { captureStage, screenshotName } from './screenshot';
import { toCardRec } from './toCardRec';

/** The mockup's stage floor: at least 320 by 300 render units. */
export const stageSize = (w: number, h: number) => ({
  W: Math.max(320, Math.round(w)),
  H: Math.max(300, Math.round(h)),
});

/**
 * The readout line: the threat in focus (the selected one, else the card's first focus threat,
 * else the first threat) at the time cursor, in the display units, with the systems that hold it.
 */
/** The threat in focus: the selected one, else the card's first focus threat, else the first. */
function threatInFocus(v: Vignette, rec: CardRec, selectedKeys: readonly string[]) {
  const paths = boardScene(v).scene.paths;
  return (
    paths.find((p) => selectedKeys.includes(p.key)) ??
    paths.find((p) => rec.focus.includes(p.id)) ??
    paths[0]
  );
}

export function readoutText(
  v: Vignette,
  rec: CardRec,
  selectedKeys: readonly string[],
  units: Units,
): string {
  const path = threatInFocus(v, rec, selectedKeys);
  if (!path) return 'Add a threat to see its track.';
  if (rec.t == null) return `${path.id} · time is off. Press T to show the time.`;
  const a = boardDerived(v).at(path.id, rec.t, rec.cam.ref);
  if (!a) return `${path.id} · no sample at ${fmtTime(rec.t)}.`;
  const cov = a.covering.length ? a.covering.join(' ') : 'no cover';
  return `${path.id} · ${formatRange(a.r, units)} · ${formatAltitude(a.z, units)} · ${formatSpeed(a.spd, units)} · closing ${formatSpeed(a.vc, units)} · ${cov}`;
}

/** The next card's time in the aids: "at t+1:40", "t+0:10 to t+0:40" for a slice, "full run". */
function nextWhen(card: Card): string {
  if (card.clip) return sliceText(card.clip).replace(/ · x[\d.]+$/, '');
  return card.tS == null ? 'full run' : `at ${fmtTime(card.tS)}`;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
}

/** The elapsed clock since Brief opened (`startMs`, set when Brief mounts), to the second. */
function Elapsed({ startMs }: { startMs: RefObject<number> }) {
  const [text, setText] = useState('0:00');
  useEffect(() => {
    const tick = () => setText(clock(startMs.current ? Date.now() - startMs.current : 0));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startMs]);
  return (
    <span className="ml-auto whitespace-nowrap text-xs text-muted" data-testid="brief-elapsed">
      Elapsed <span className="font-mono text-text">{text}</span>
    </span>
  );
}

function HeadButton({
  label,
  shortcut,
  pressed,
  disabledReason,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  /** Disabled, with the tooltip saying why (the Build bar's pattern: aria-disabled). */
  disabledReason?: string | null;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reasonId = useId();
  const disabled = !!disabledReason;
  return (
    <Tooltip content={disabledReason || label} shortcut={disabled ? undefined : shortcut}>
      <button
        type="button"
        className={`ps-btn mini quiet [&>svg]:size-3.5 ${disabled ? 'cursor-default opacity-50' : ''} ${focusRing}`}
        aria-label={label}
        aria-pressed={pressed}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        onClick={() => {
          if (!disabled) onClick();
        }}
      >
        {children}
        {disabled ? (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}

export default function Stage({
  v,
  card,
  index,
  onStep,
  startMs,
}: {
  v: Vignette;
  card: Card | null;
  index: number;
  onStep: (d: number) => void;
  /** When Brief opened, for the elapsed clock; omitted hides the presenter aids. */
  startMs?: RefObject<number>;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const tS = useUi((s) => s.tS);
  const timeOn = useUi((s) => s.timeOn);
  const units = useUi((s) => s.units);
  const selectedKeys = useUi((s) => s.selectedKeys);
  const stash = useUi((s) => s.buildStash);
  const hasLoop = useUi((s) => s.loop != null);
  const n = v.cards.length;
  const sz = stageSize(size.width, size.height);
  // No current card: a transient card of the Build view (the stash, else the stores now), its
  // focus the selection. It is drawn, never saved.
  const buildCard = useMemo(
    () =>
      card ? null : { ...cardFromBuild(v, stash ?? snapshotBuild()), focus: selectedKeys.slice() },
    [card, v, stash, selectedKeys],
  );
  const shown = card ?? buildCard;
  const t = timeOn ? tS : null;
  const rec = shown ? { ...toCardRec(v, shown), t } : null;
  const svg = rec && sz.W > 0 ? render.card(boardScene(v), boardDerived(v), rec, sz, false) : '';
  const question = v.questions[0]?.text ?? '';
  const next = card && index + 1 < n ? v.cards[index + 1]! : null;
  const showReadout = card ? card.displays.readout : true;
  const focusPath = rec ? threatInFocus(v, rec, selectedKeys) : undefined;
  const step = focusPath && t != null ? stepAt(keyPoints(boardDerived(v), focusPath.id), t) : null;
  const screenshot = () => {
    const live = ref.current?.querySelector<SVGSVGElement>('svg.board');
    if (live) void captureStage(live, sz.W, sz.H, screenshotName(v.id, card?.id ?? null, t));
  };
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
          {card ? `${index + 1} of ${n} · ${v.id}` : `Build view · ${v.id}`}
        </span>
        {card?.clip ? (
          <span className="font-mono text-xs text-text" data-testid="brief-slice-head">
            {sliceText(card.clip)}
          </span>
        ) : null}
        <span className="font-mono text-xs text-muted" data-testid="brief-time">
          {timeOn ? fmtTime(tS) : 'full run'}
        </span>
        <span className="flex items-center gap-1">
          {card ? (
            <>
              <HeadButton
                label="Timeline"
                shortcut="L"
                pressed={card.displays.timeline}
                onClick={() => toggleDisplay('timeline')}
              >
                <ChartNoAxesGantt aria-hidden="true" />
              </HeadButton>
              <HeadButton
                label="Readout"
                pressed={card.displays.readout}
                onClick={() => toggleDisplay('readout')}
              >
                <Gauge aria-hidden="true" />
              </HeadButton>
            </>
          ) : null}
          <HeadButton
            label="Set the slice from the loop"
            disabledReason={hasLoop ? null : NO_LOOP_REASON}
            onClick={() => sliceFromLoop()}
          >
            <Scissors aria-hidden="true" />
          </HeadButton>
          <HeadButton label="Save a screenshot" onClick={screenshot}>
            <ImageIcon aria-hidden="true" />
          </HeadButton>
          <HeadButton label="Save a frame as a card" shortcut="C" onClick={() => snapshotCard()}>
            <Camera aria-hidden="true" />
          </HeadButton>
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
      <p
        className="m-0 min-h-[30px] max-w-[72ch] shrink-0 px-0.5 pt-2.5 text-[15px] leading-[1.5] text-text"
        data-testid="brief-caption"
      >
        {card
          ? card.caption || <span className="text-subtle">{captionPlaceholder(card)}</span>
          : question}
      </p>
      {rec && showReadout ? (
        <p
          className="m-0 mt-1.5 min-h-[18px] shrink-0 overflow-x-auto border-t border-surface-3 pt-1.5 font-mono text-xs whitespace-nowrap text-muted"
          aria-live="polite"
          data-testid="brief-readout"
        >
          {readoutText(v, rec, selectedKeys, units)}
        </p>
      ) : null}
      {card && startMs ? (
        <div
          className="mt-1.5 flex shrink-0 items-center gap-2.5 border-t border-surface-3 pt-1.5"
          data-testid="brief-aids"
        >
          {focusPath && t != null ? (
            <span
              className="flex shrink-0 items-center gap-1.5 text-xs text-text"
              data-testid="brief-aids-step"
            >
              <Glyph stage={step?.stage ?? 'find'} className={step ? 'tl-current' : 'tl-future'} />
              <span className="font-mono">{focusPath.id}</span> {step ? step.label : 'no step yet'}
            </span>
          ) : null}
          {next ? (
            <>
              <span className="w-24 shrink-0 overflow-hidden rounded-sm border border-surface-3">
                <CardThumb v={v} card={next} />
              </span>
              <span className="text-xs text-muted">
                Next: {index + 2} {next.name}{' '}
                <span className="font-mono text-text">{nextWhen(next)}</span>
              </span>
            </>
          ) : (
            <span className="text-xs text-muted">Last card</span>
          )}
          <Elapsed startMs={startMs} />
        </div>
      ) : null}
    </section>
  );
}
