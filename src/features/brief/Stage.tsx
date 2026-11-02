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
// The frame (2026-11-02, user request): the wheel zooms the card about the cursor and a drag
// pans it (in 3D a drag orbits), each burst one undo step (./stageFrame, cards.ts beginFrame); the
// head prints the zoom. The Readout display is the frame panel floating at the stage's top
// right: "Frame at t+2:06", then each threat in focus as the notes' Frame block (at most three).
import { Camera, ChartNoAxesGantt, Gauge, ImageIcon, Scissors } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { Card, Vignette } from '../../domain/types';
import { render, type CardRec } from '../../board';
import { useUi } from '../../state/ui';
import { Tooltip } from '../../ui/Tooltip';
import { focusRing } from '../../ui/focus';
import { useSize } from '../shared/useSize';
import { fmtTime } from '../shared/units';
import { boardDerived, boardScene } from '../build/board/derived';
import { CardThumb } from './CardStrip';
import { NO_LOOP_REASON, stepAt } from '../timeline/layout';
import { keyPoints } from '../timeline/stages';
import {
  beginFrame,
  cardFromBuild,
  endFrame,
  sliceFromLoop,
  snapshotBuild,
  snapshotCard,
  toggleDisplay,
  updateFrame,
  updateOrbit,
} from './cards';
import { Glyph, ThreatBlock } from './Frame';
import { WHEEL_RATE, orbitBy, panBy, zoomAt, zoomText } from './stageFrame';
import { captionPlaceholder, frameOf, sliceText } from './frameData';
import { captureStage, screenshotName } from './screenshot';
import { idMaps, toCardRec } from './toCardRec';

/** The mockup's stage floor: at least 320 by 300 render units. */
export const stageSize = (w: number, h: number) => ({
  W: Math.max(320, Math.round(w)),
  H: Math.max(300, Math.round(h)),
});

/** The threat in focus: the selected one, else the card's first focus threat, else the first. */
function threatInFocus(v: Vignette, rec: CardRec, selectedKeys: readonly string[]) {
  const paths = boardScene(v).scene.paths;
  return (
    paths.find((p) => selectedKeys.includes(p.key)) ??
    paths.find((p) => rec.focus.includes(p.id)) ??
    paths[0]
  );
}

/** The floating frame panel shows at most this many threats; the notes panel shows six. */
export const FLOAT_MAX = 3;

/**
 * The frame panel on the stage (the Readout display): what is true for the threats in focus at
 * the time cursor, as the notes' Frame blocks, at the stage's top right.
 */
function FrameFloat({ v, rec, t }: { v: Vignette; rec: CardRec; t: number | null }) {
  const focus = useMemo(() => {
    const { keyOfId } = idMaps(boardScene(v));
    return rec.focus.map((id) => keyOfId.get(id)).filter((k): k is string => k !== undefined);
  }, [v, rec.focus]);
  const frame = frameOf(boardScene(v), boardDerived(v), t, focus, rec.cam.ref);
  const shown = frame.threats.slice(0, FLOAT_MAX);
  const more = frame.more + frame.threats.length - shown.length;
  return (
    <aside className="brief-float" aria-label="Frame" data-testid="brief-readout">
      <h3 className="m-0 mb-2 text-xs font-medium text-muted" data-testid="brief-float-head">
        {t == null ? 'Full run' : `Frame at ${fmtTime(t)}`}
      </h3>
      {shown.length ? (
        <div className="flex flex-col gap-2.5">
          {shown.map((f) => (
            <ThreatBlock key={f.key} f={f} t={t} />
          ))}
        </div>
      ) : (
        <p className="ps-hint m-0">Add a threat to see what is true in the frame.</p>
      )}
      {more ? <p className="ps-hint m-0 mt-2">and {more} more</p> : null}
    </aside>
  );
}

/** A pan or orbit in progress: the pointer's last position and whether the edit has begun. */
type Drag = { id: number; x: number; y: number; begun: boolean };

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

  // The frame gestures. The wheel zooms the card about the cursor; a burst (wheel events less
  // than 250 ms apart) is one undo step. The listener is added by hand: React's onWheel is
  // passive, so it cannot keep the page from scrolling.
  const latest = useRef({ v, card, sz });
  useEffect(() => {
    latest.current = { v, card, sz };
  });
  const wheelEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelOpen = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { v, card, sz } = latest.current;
      if (!card || card.view.kind === '3d') return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const k = sz.W / Math.max(1, r.width);
      const next = zoomAt(
        v,
        card,
        sz,
        Math.exp(-dy * WHEEL_RATE),
        (e.clientX - r.left) * k,
        (e.clientY - r.top) * k,
      );
      if (!next) return;
      if (!wheelOpen.current) {
        beginFrame(card, 'zoom');
        wheelOpen.current = true;
      }
      updateFrame(card.key, next);
      if (wheelEnd.current) clearTimeout(wheelEnd.current);
      wheelEnd.current = setTimeout(() => {
        wheelOpen.current = false;
        endFrame();
      }, 250);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelEnd.current) clearTimeout(wheelEnd.current);
      if (wheelOpen.current) {
        wheelOpen.current = false;
        endFrame();
      }
    };
  }, [ref]);

  // A drag pans a Plan or Elevation card and orbits a 3D card; the edit begins at the first
  // move, so a plain click records nothing.
  const drag = useRef<Drag | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!card || e.button !== 0 || (e.target as Element).closest('.brief-float')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, begun: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !card) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.begun && Math.hypot(dx, dy) < 3) return;
    const r = e.currentTarget.getBoundingClientRect();
    const k = sz.W / Math.max(1, r.width);
    if (card.view.kind === '3d') {
      if (!d.begun) beginFrame(card, 'orbit');
      updateOrbit(card.key, orbitBy(card.view, dx, dy));
    } else {
      const next = panBy(v, card, sz, dx * k, dy * k);
      if (!next) return;
      if (!d.begun) beginFrame(card, 'pan');
      updateFrame(card.key, next);
    }
    d.begun = true;
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.begun) endFrame();
  };
  return (
    <section
      aria-label="Stage"
      className="brief-show flex min-h-0 min-w-0 flex-1 flex-col px-[18px] pt-3.5 pb-4"
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
        {card && card.view.kind !== '3d' && card.view.zoom !== 1 ? (
          <span className="font-mono text-xs text-muted" data-testid="brief-zoom-head">
            {zoomText(card.view.zoom)}
          </span>
        ) : null}
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
        className={`relative min-h-[360px] flex-1${card ? ' brief-stage-grab' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          ref={ref}
          className="brief-stage absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          data-testid="brief-stage"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {rec && showReadout ? <FrameFloat v={v} rec={rec} t={t} /> : null}
      </div>
      <p
        className="m-0 min-h-[30px] max-w-[72ch] shrink-0 px-0.5 pt-2.5 text-[15px] leading-[1.5] text-text"
        data-testid="brief-caption"
      >
        {card
          ? card.caption || <span className="text-subtle">{captionPlaceholder(card)}</span>
          : question}
      </p>
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
