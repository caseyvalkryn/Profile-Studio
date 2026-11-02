// The timeline strip (reference artifact `js/51-panel-timeline.js`, ported onto the React stores):
// one strip that Build hosts under the board and Brief hosts under the stage, over the one time
// state in `useUi` (tS, timeOn, playing, loop, rate, tview; kept per profile by
// `state/timePersist.ts`). The axis (Axis.tsx): ticks, the loop range and the time cursor; a
// press scrubs, Shift and drag set the loop range, a double click clears it, Ctrl or Cmd and the
// wheel zoom the span (the overview bar above the axis pans it; a double click there fits the
// run; the context menu fits the run or the action span, fit.ts). A run that is mostly empty
// ingress opens on its action span until the user zooms by hand (review of 2026-11-01). The lane
// area (LaneSvg.tsx, geometry in layout.ts): the DA row, the Cards row (each card at its time; a
// press opens it in Brief, sets its time and slice in Build), then one lane per threat: a header
// with the threat id, the step reached at the cursor and the F2T2EA key points as glyphs at their
// times in their state at the cursor (glyphs.tsx; the legend names them), the coverage rows of
// each sensor and effector that sees it, the authored events as beads, and the group splits.
// The strip shares the selection and the hover with the board and the inspector (lane 13.1): a
// row press selects its system, a glyph press sets the time and selects the system that gives
// the step, and a selected or hovered system lights its rows. `ui.tlH` caps the lane area, which
// scrolls past it (the grip on the strip's top edge drags it). A bead press sets the time and
// selects the event; in Build a bead drags to move the event (one undo step). Every other
// control works in Build and Brief. The play bar is PlayBar.tsx. The strip mounts the playback
// clock.
import './timeline.css';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { stops } from '../../engine';
import { currentContext, get } from '../../commands/registry';
import { useDocument } from '../../state/document';
import { TL_H_DEFAULT, TL_H_MAX, TL_H_MIN, useUi } from '../../state/ui';
import { ContextMenu, type MenuItem } from '../../ui';
import { focusRing } from '../../ui/focus';
import { menuItemsFor } from '../commands/adapter';
import { usePlayback } from '../build/bar/usePlayback';
import { boardDerived, boardScene } from '../build/board/derived';
import { useSize } from '../shared/useSize';
import { fmtTime } from '../shared/units';
import { axisMarks } from './Axis';
import { timelineCommands } from './commands';
import { actionSpan, actionStart, runEnd, wantsFit } from './fit';
import { GLYPH_ORDER, HATCH_EW, HATCH_S, kindPill, stageGlyph } from './glyphs';
import { cardMarksSvg, daMarks, laneMarks, splitMarks, type Geo, type Live } from './LaneSvg';
import {
  AXIS_H,
  BEAD_R,
  CH,
  GUT_R,
  buildLanes,
  cardMarks,
  clamp,
  gutterFor,
  round1,
  stepAt,
} from './layout';
import PlayBar from './PlayBar';
import { STAGE_LABEL } from './stages';

export { MIN_RUN_S, runEnd } from './fit';
export { tickSteps } from './Axis';
export { GUT_L, GUT_WIDE, buildLanes, parseTime } from './layout';
export { RATES } from './PlayBar';

const MIN_SPAN_S = 10;
const STEP_PX = 16;
/** The legend's hover title on each glyph: the three states at the cursor (lane 13.1 item 4). */
const STATE_TITLE =
  'With time on: reached in the text ink, the current key point in the accent with a ring, a later one dim.';

type Drag =
  | { kind: 'scrub' }
  | { kind: 'range'; t0: number }
  | { kind: 'bead'; key: string; id: string; x0: number; moved: boolean }
  | {
      kind: 'press';
      x0: number;
      /** A Cards row marker, a key to select (a row or a glyph, with its time) or a lane. */
      card: string | null;
      key: string | null;
      t: number | null;
      lane: string | null;
    }
  | { kind: 'pan'; x0: number; t0: number; span: number };

export default function Timeline({ mode }: { mode: 'build' | 'brief' }) {
  usePlayback();
  const doc = useDocument((s) => s.doc);
  const tS = useUi((s) => s.tS);
  const timeOn = useUi((s) => s.timeOn);
  const loop = useUi((s) => s.loop);
  const tview = useUi((s) => s.tview);
  const tlH = useUi((s) => s.tlH);
  const selectedKeys = useUi((s) => s.selectedKeys);
  const hoverKey = useUi((s) => s.hoverKey);
  const cardKey = useUi((s) => s.cardKey);
  const [plotRef, size] = useSize<HTMLDivElement>();
  const drag = useRef<Drag | null>(null);
  // the loop range being dragged: the ref for the pointer handlers, the state for the axis
  const rangeRef = useRef<{ t0: number; t1: number } | null>(null);
  const [rangeTmp, setRangeTmp] = useState<{ t0: number; t1: number } | null>(null);
  const setRange = (r: { t0: number; t1: number } | null) => {
    rangeRef.current = r;
    setRangeTmp(r);
  };
  const [menuT, setMenuT] = useState(0);

  const scene = doc ? boardScene(doc) : null;
  const d = doc ? boardDerived(doc) : null;
  const tmax = d ? d.tmax : 0;
  const end = runEnd(tmax);
  const marks = doc ? cardMarks(doc.cards) : [];
  const { lanes, height, daRow, cardsTop } =
    scene && d
      ? buildLanes(scene, d, tlH, marks.length > 0)
      : { lanes: [], height: 20, daRow: false, cardsTop: null };
  const gut = gutterFor(lanes);
  const W = Math.max(240, Math.round(size.width) || 800);
  const tv0 = tview ? clamp(tview.t0S, 0, end) : 0;
  const tv1 = tview ? clamp(tview.t1S, tv0 + 1, Math.max(end, tv0 + 1)) : end;
  const span = tv1 - tv0;
  const plotW = W - gut - GUT_R;
  const xOf = (t: number) => gut + ((t - tv0) / span) * plotW;
  const cx = (t: number) => clamp(xOf(t), gut, W - GUT_R);
  const geo: Geo = { W, gut, tv0, tv1, end, xOf, cx };
  const live: Live = { selectedKeys, hoverKey, tS, timeOn };

  const tAt = (clientX: number): number => {
    const el = plotRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return clamp(tv0 + ((clientX - r.left - gut) / plotW) * span, 0, end);
  };

  const ui = useUi.getState;
  const setTimeHere = (t: number) => {
    const u = ui();
    u.setTime(round1(clamp(t, 0, end)));
    if (!u.timeOn) u.setTimeOn(true);
  };

  const warned = new Set<string>();
  for (const w of d?.warnings ?? []) if (w.eventId) warned.add(w.eventId);
  const sysKey = new Map((scene?.scene.systems ?? []).map((s) => [s.id, s.key] as const));

  // The auto fit (lane 12.4): a run over three times its action span opens on the span, and
  // follows the span while the document changes, until a zoom by hand (the wheel, the overview
  // pan, the fit commands: any tview this effect did not set). A new document resets that, unless
  // it opens on a zoom of its own (one restored by timePersist).
  const docId = doc?.id ?? null;
  const aStart = d ? actionStart(d) : 0;
  const fit = useRef<{ docId: string | null; hand: boolean; set: typeof tview }>({
    docId,
    hand: false,
    set: null,
  });
  useEffect(() => {
    if (tview !== fit.current.set) fit.current.hand = true;
  }, [tview]);
  useEffect(() => {
    const f = fit.current;
    if (f.docId !== docId) {
      const tv = ui().tview;
      f.hand = tv != null && tv !== f.set;
      f.docId = docId;
      f.set = null;
    }
    if (!d || f.hand || !wantsFit(d)) return;
    const span = actionSpan(d);
    f.set = span;
    ui().setTview(span);
    // Keyed on the run's end and the action start: the two numbers the span is made of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, tmax, aStart, ui]);

  const menuItems: MenuItem[] = useMemo(
    () => {
      const pointer = { x: 0, y: 0, tS: menuT };
      const items = menuItemsFor('timeline', { pointer, onArg: () => {} });
      // The strip's own commands until 13.W registers them (then menuItemsFor lists them).
      const ctx = currentContext(pointer);
      for (const cmd of timelineCommands) {
        if (get(cmd.id)) continue;
        const ok = cmd.when(ctx);
        items.push(
          ok === true
            ? { id: cmd.id, label: cmd.label, onSelect: () => cmd.run(currentContext(pointer)) }
            : { id: cmd.id, label: cmd.label, disabledReason: ok },
        );
      }
      return items;
    },
    // Rebuilt for each right-click; the stores are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuT, doc, loop],
  );

  // Ctrl or Cmd and the wheel zoom the span about the pointer. React's wheel is passive, so the
  // listener is attached by hand to call preventDefault.
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const u = ui();
      const r = el.getBoundingClientRect();
      const a0 = u.tview ? u.tview.t0S : 0;
      const a1 = u.tview ? u.tview.t1S : end;
      const sp = a1 - a0;
      const tp = clamp(a0 + ((e.clientX - r.left - gut) / plotW) * sp, 0, end);
      const ns = clamp(sp * Math.exp(e.deltaY * 0.0025), MIN_SPAN_S, end);
      if (ns >= end - 1e-6) {
        u.setTview(null);
        return;
      }
      const t0 = clamp(tp - ((tp - a0) / sp) * ns, 0, end - ns);
      u.setTview({ t0S: round1(t0), t1S: round1(t0 + ns) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [plotRef, end, plotW, gut, ui]);

  // ---------------------------------------------------------------- pointer

  const capture = (e: RPointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    const bead = t.closest('[data-event-key]');
    const onAxis = !!t.closest('.tl-axis, .tl-grip');
    if (bead) {
      drag.current = {
        kind: 'bead',
        key: bead.getAttribute('data-event-key')!,
        id: bead.getAttribute('data-event-id') ?? '',
        x0: e.clientX,
        moved: false,
      };
    } else if (onAxis && e.shiftKey) {
      drag.current = { kind: 'range', t0: tAt(e.clientX) };
    } else if (onAxis) {
      drag.current = { kind: 'scrub' };
      setTimeHere(tAt(e.clientX));
    } else {
      const target = t.closest('[data-select-key]');
      const time = target?.getAttribute('data-time');
      drag.current = {
        kind: 'press',
        x0: e.clientX,
        card: t.closest('[data-card-key]')?.getAttribute('data-card-key') ?? null,
        key: target?.getAttribute('data-select-key') ?? null,
        t: time != null ? Number(time) : null,
        lane: t.closest('[data-path-key]')?.getAttribute('data-path-key') ?? null,
      };
      return;
    }
    capture(e);
    e.preventDefault();
  };

  /** A Cards row press: Brief opens the card; Build sets its time, and its slice as the loop. */
  const onCardPress = (key: string) => {
    const c = doc?.cards.find((x) => x.key === key);
    if (!c) return;
    if (mode === 'brief') {
      ui().setCardKey(c.key);
      return;
    }
    const t = c.tS ?? c.clip?.t0S;
    if (t != null) setTimeHere(t);
    if (c.clip) ui().setLoop({ startS: c.clip.t0S, endS: c.clip.t1S });
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    if (!dr || dr.kind === 'press') {
      // the hover: a system row or glyph lights its system, the rest of a lane its threat
      const el = e.target as Element;
      const hk =
        el.closest('[data-select-key]')?.getAttribute('data-select-key') ??
        el.closest('[data-path-key]')?.getAttribute('data-path-key') ??
        null;
      if (ui().hoverKey !== hk) ui().setHover(hk);
      return;
    }
    const t = tAt(e.clientX);
    if (dr.kind === 'scrub') setTimeHere(t);
    else if (dr.kind === 'range') setRange({ t0: Math.min(dr.t0, t), t1: Math.max(dr.t0, t) });
    else if (dr.kind === 'bead' && mode === 'build') {
      if (!dr.moved && Math.abs(e.clientX - dr.x0) < 3) return;
      const st = useDocument.getState();
      if (!dr.moved) {
        dr.moved = true;
        st.beginDrag(`move event ${dr.id}`);
      }
      const tt = round1(t);
      st.updateDrag((dd) => {
        const ev = dd.events.find((x) => x.key === dr.key);
        if (ev) ev.tS = tt;
      });
    }
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    drag.current = null;
    if (!dr) return;
    if (dr.kind === 'bead') {
      if (dr.moved) useDocument.getState().endDrag();
      else {
        const ev = scene?.events.find((x) => x.key === dr.key);
        if (ev) setTimeHere(ev.t);
        ui().setSelection([dr.key]);
      }
    } else if (dr.kind === 'range') {
      const rg = rangeRef.current;
      if (rg && rg.t1 - rg.t0 >= 0.5) ui().setLoop({ startS: round1(rg.t0), endS: round1(rg.t1) });
      setRange(null);
    } else if (dr.kind === 'press' && Math.abs(e.clientX - dr.x0) < 3) {
      if (dr.card) onCardPress(dr.card);
      else if (dr.key) {
        if (dr.t != null) setTimeHere(dr.t);
        ui().setSelection([dr.key]);
      } else if (dr.lane) ui().setSelection([dr.lane]);
    }
  };

  const onCancel = () => {
    const dr = drag.current;
    drag.current = null;
    if (dr?.kind === 'bead' && dr.moved) useDocument.getState().endDrag();
    setRange(null);
  };

  const onLeave = () => {
    if (!drag.current && ui().hoverKey) ui().setHover(null);
  };

  const onDbl = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('.tl-axis')) ui().setLoop(null);
  };

  // overview pan
  const onOvDown = (e: RPointerEvent<HTMLDivElement>) => {
    const tv = ui().tview;
    if (!tv) return;
    drag.current = { kind: 'pan', x0: e.clientX, t0: tv.t0S, span: tv.t1S - tv.t0S };
    capture(e);
    e.preventDefault();
  };
  const onOvMove = (e: RPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    if (!dr || dr.kind !== 'pan') return;
    const w = e.currentTarget.getBoundingClientRect().width || 1;
    const t0 = clamp(dr.t0 + ((e.clientX - dr.x0) / w) * end, 0, end - dr.span);
    ui().setTview({ t0S: round1(t0), t1S: round1(t0 + dr.span) });
  };
  const onOvUp = () => {
    if (drag.current?.kind === 'pan') drag.current = null;
  };

  // the resize grip on the strip's top edge: a drag up grows the lane area
  const resize = useRef<{ y0: number; h0: number } | null>(null);
  const onGripDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    resize.current = { y0: e.clientY, h0: ui().tlH };
    capture(e);
    e.preventDefault();
  };
  const onGripMove = (e: RPointerEvent<HTMLDivElement>) => {
    const r = resize.current;
    if (r) ui().setTlH(r.h0 - (e.clientY - r.y0));
  };
  const onGripUp = () => {
    resize.current = null;
  };
  const onGripKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      ui().setTlH(ui().tlH + (e.key === 'ArrowUp' ? STEP_PX : -STEP_PX));
    } else if (e.key === 'Home') {
      e.preventDefault();
      ui().setTlH(TL_H_DEFAULT);
    }
  };

  const stopList = () => (doc && d ? stops(doc, d) : [0]);

  // ---------------------------------------------------------------- marks

  const axis = axisMarks({
    W,
    gut,
    gutR: GUT_R,
    tv0,
    tv1,
    xOf,
    range: rangeTmp ?? (loop ? { t0: loop.startS, t1: loop.endS } : null),
  });
  const laneSvg = lanes.map((L) => laneMarks(L, geo, live, d, warned, sysKey));
  const daSvg = daRow && d ? daMarks(lanes, geo, d) : null;
  // the current card: the Brief's (ui.cardKey, else the first); in Build only a keyed one
  const deck = doc?.cards ?? [];
  const curCard = deck.some((c) => c.key === cardKey)
    ? cardKey
    : mode === 'brief'
      ? (deck[0]?.key ?? null)
      : null;
  const cardsSvg = cardsTop != null ? cardMarksSvg(marks, cardsTop, geo, curCard) : null;
  const splitSvg = splitMarks(d, geo, height);

  // the cursor chip: the time, and the step the selected threat has reached ("t+0:10 · Track")
  const selLane = lanes.find((L) => selectedKeys.includes(L.path.key));
  const chipStep = selLane ? stepAt(selLane.points, tS) : null;
  const chip = `${fmtTime(tS)}${chipStep ? ` · ${chipStep.label}` : ''}`;
  const chipW = chip.length * CH + 16;
  const cursorOn = timeOn && tS >= tv0 - 1e-6 && tS <= tv1 + 1e-6;

  return (
    <div
      role="group"
      aria-label="Timeline"
      className={`tl tl-${mode} mt-2 shrink-0`}
      data-testid="timeline"
      style={{ '--tl-gut': `${gut}px` } as React.CSSProperties}
    >
      <div
        className={`tl-resize ${focusRing}`}
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize timeline"
        aria-valuemin={TL_H_MIN}
        aria-valuemax={TL_H_MAX}
        aria-valuenow={tlH}
        title="Drag to resize the timeline"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        onDoubleClick={() => ui().setTlH(TL_H_DEFAULT)}
        onKeyDown={onGripKey}
      >
        <div className="tl-resize-pill" />
      </div>
      {/* the coverage textures (lane 12.4, from the reference strip): sensor windows hatched in
          the friend ink at 45 degrees, EW windows in the ew ink at the opposite angle, both at
          a 3 px pitch with 1 px lines; effector windows are a solid band (timeline.css) */}
      <svg className="tl-defs" width={0} height={0} aria-hidden="true">
        <defs>
          {(
            [
              [HATCH_S, 'tl-hatch-s', 45],
              [HATCH_EW, 'tl-hatch-ew', -45],
            ] as const
          ).map(([id, cls, deg]) => (
            <pattern
              key={id}
              id={id}
              width={3}
              height={3}
              patternUnits="userSpaceOnUse"
              patternTransform={`rotate(${deg})`}
            >
              <line className={cls} x1={0.5} x2={0.5} y1={0} y2={3} />
            </pattern>
          ))}
        </defs>
      </svg>
      {tview ? (
        <div
          className="tl-ov"
          role="slider"
          tabIndex={0}
          aria-label="Time zoom span"
          aria-valuemin={0}
          aria-valuemax={Math.round(end)}
          aria-valuenow={Math.round(tv0)}
          aria-valuetext={`${fmtTime(tv0)} to ${fmtTime(tv1)}`}
          onPointerDown={onOvDown}
          onPointerMove={onOvMove}
          onPointerUp={onOvUp}
          onDoubleClick={() => ui().setTview(null)}
        >
          <div
            className="tl-ov-span"
            style={{ left: `${(tv0 / end) * 100}%`, width: `${(span / end) * 100}%` }}
          />
        </div>
      ) : null}
      <ContextMenu items={menuItems}>
        <div
          ref={plotRef}
          className="tl-plot"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onPointerLeave={onLeave}
          onDoubleClick={onDbl}
          onContextMenu={(e) => setMenuT(round1(tAt(e.clientX)))}
        >
          <svg
            className="tl-axis"
            width={W}
            height={AXIS_H}
            viewBox={`0 0 ${W} ${AXIS_H}`}
            aria-hidden="true"
          >
            {axis}
          </svg>
          {/* the area takes its lanes' height up to ui.tlH, then scrolls; with no lane it takes
              the hint's height (review of 2026-11-01) */}
          <div className="tl-lanes" style={lanes.length ? { maxHeight: tlH } : undefined}>
            {lanes.length ? (
              <svg
                width={W}
                height={height}
                viewBox={`0 0 ${W} ${height}`}
                role="img"
                aria-label="Coverage and key points by threat"
              >
                {daSvg}
                {cardsSvg}
                {laneSvg}
                {splitSvg}
              </svg>
            ) : (
              <p className="tl-empty ps-hint">Add a threat to see its coverage and key points.</p>
            )}
          </div>
          <div
            className="tl-cursor"
            hidden={!cursorOn}
            style={{ transform: `translateX(${xOf(tS).toFixed(1)}px)` }}
            data-testid="tl-cursor"
          >
            <div className="tl-cursor-l" />
            <svg className="tl-grip" viewBox="0 0 12 9" aria-hidden="true">
              <polygon points="0,0 12,0 6,9" />
            </svg>
            {/* the chip flips to the cursor's left near the right edge, so it never clips */}
            <span
              className={`tl-cursor-time${xOf(tS) > W - GUT_R - chipW ? ' tl-cursor-time-l' : ''}`}
              data-testid="tl-cursor-time"
            >
              {chip}
            </span>
          </div>
        </div>
      </ContextMenu>
      <div className="tl-legend" data-testid="tl-legend" aria-label="Legend">
        {GLYPH_ORDER.map((s) => (
          <span
            key={s}
            className={`tl-stage${s === 'da' ? ' tl-da' : ''}`}
            title={`${s === 'da' ? 'DA entry' : STAGE_LABEL[s]}. ${STATE_TITLE}`}
          >
            <svg width="12" height="12" aria-hidden="true">
              {stageGlyph(s, 6, 6)}
            </svg>
            {s === 'da' ? 'DA' : STAGE_LABEL[s]}
          </span>
        ))}
        {(['tl-bar-s', 'tl-bar-e', 'tl-bar-ew'] as const).map((cls) => (
          <span key={cls}>
            <svg width="10" height="6" aria-hidden="true">
              {kindPill(cls, 0, 3)}
            </svg>
            {cls === 'tl-bar-s' ? 'Sensor' : cls === 'tl-bar-e' ? 'Effector' : 'EW'}
          </span>
        ))}
        <span className="tl-bead">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx={6} cy={6} r={BEAD_R} />
            <text x={6} y={6}>
              D
            </text>
          </svg>
          Event
        </span>
      </div>
      <PlayBar mode={mode} tmax={tmax} stopList={stopList} setTimeHere={setTimeHere} />
    </div>
  );
}
