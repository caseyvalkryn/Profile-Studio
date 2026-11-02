// The timeline strip (reference artifact `js/51-panel-timeline.js`, ported onto the React stores):
// one strip that Build hosts under the board and Brief hosts under the stage, over the one time
// state in `useUi` (tS, timeOn, playing, loop, rate, tview). The axis: ticks, the loop range and
// the time cursor; a press scrubs, Shift and drag set the loop range, a double click clears it,
// Ctrl or Cmd and the wheel zoom the span (the overview bar above the axis pans it; a double
// click there fits the run; the context menu fits the run or the action span, fit.ts). A run
// that is mostly empty ingress opens on its action span until the user zooms by hand (review of
// 2026-11-01). One lane per threat: a header with the threat id and the F2T2EA key points as
// glyphs at their times (glyphs.tsx; the legend names them), then the coverage rows of each
// sensor and effector that sees it (one labelled row per system with room, else a compact
// band), then the authored events as beads with the board's letter and their label when there
// is room, the defended asset entry, and the group splits across the lanes. Each lane takes its
// content height, the row pitch growing to ROW_MAX with room; `ui.tlH` caps the lane area, which
// scrolls past it (the grip on the strip's top edge drags it; ArrowUp and ArrowDown step it, a
// double click resets it). A bead press sets the time there and selects the event; in Build a
// bead drags to move the event (one undo step). The play bar: first, previous stop, play, next
// stop, last, rate, loop, the clock (type a time and press Enter) and the Time checkbox. The
// strip mounts the playback clock.
import './timeline.css';
import {
  ChevronFirst,
  ChevronLast,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  TimerOff,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';
import { EV_TYPES } from '../../board/layers/events';
import type { EventRec, PathRec, Scene, SystemRec } from '../../board';
import { EFFECTOR_KINDS } from '../../domain/catalog';
import { nextStop, prevStop, stops, type Derived } from '../../engine';
import type { Window } from '../../engine/geo';
import { useDocument } from '../../state/document';
import { TL_H_DEFAULT, TL_H_MAX, TL_H_MIN, useUi } from '../../state/ui';
import { ContextMenu, type MenuItem } from '../../ui';
import { Tooltip } from '../../ui/Tooltip';
import { focusRing } from '../../ui/focus';
import { menuItemsFor } from '../commands/adapter';
import { usePlayback } from '../build/bar/usePlayback';
import { boardDerived, boardScene } from '../build/board/derived';
import { useSize } from '../shared/useSize';
import { fmtTime } from '../shared/units';
import { actionSpan, actionStart, runEnd, wantsFit } from './fit';
import { GLYPH_ORDER, HATCH_EW, HATCH_S, kindPill, stageGlyph } from './glyphs';
import { STAGE_LABEL, keyPoints, type KeyPoint } from './stages';

export { MIN_RUN_S, runEnd } from './fit';

export const RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;

/** The left gutter: the threat id, and in a tall lane the pill and id of each system row. */
export const GUT_L = 56;
const GUT_R = 12;
const AXIS_H = 24;
const MAJORS = [1, 2, 5, 10, 30, 60, 120, 300, 600, 1200, 3600];
const MINOR: Record<number, number> = {
  1: 0.2,
  2: 0.5,
  5: 1,
  10: 2,
  30: 5,
  60: 10,
  120: 30,
  300: 60,
  600: 120,
  1200: 300,
  3600: 600,
};
const MIN_SPAN_S = 10;
/** The cursor time chip's width with its offset: "t+12:34" in the mono face plus padding. */
const CHIP_W = 64;
const CH = 6.6; // px per mono character at 11 px
/** The band the coverage bars share: up to four at 3 px with a 1 px gap, more at a finer pitch. */
const BAND = 16;
/** An event bead: a circled letter, 7 px radius (the reference strip's size). */
const BEAD_R = 7;
/** The lane's header row: the threat id at the left, the key point glyphs at their times. */
const HEAD = 14;
/** A labelled system row: 14 px by default, growing to ROW_MAX with room (lane 12.4). */
const ROW_MIN = 14;
const ROW_MAX = 24;
/** The bar thickness of a labelled row, centred in the row. */
const BAR = 8;
/** The lane's fixed parts around the rows: top pad, header, gap, beads, bottom pad. */
const ROWS_FIXED = 2 + HEAD + 2 + 2 * BEAD_R + 4;
/** The defended asset row at the top of the lane area: each threat's entry to the run end. */
const DA_H = 12;
/** Two glyphs within this many px stack: the later one draws STACK_DY lower. */
const STACK_PX = 10;
const STACK_DY = 10;
const STEP_PX = 16;

const round1 = (t: number) => Math.round(t * 10) / 10;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** "2:55", "175", "t+2:55" or "2:55.5" to seconds; null when the text is not a time. */
export function parseTime(text: string): number | null {
  const s = text.trim().replace(/^t\+/i, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function mmss(s: number): string {
  const a = Math.round(Math.abs(s));
  return `${Math.floor(a / 60)}:${a % 60 < 10 ? '0' : ''}${a % 60}`;
}

function inkOf(identity: PathRec['identity']): string {
  if (identity === 'friend') return 'tl-ink-friend';
  if (identity === 'hostile' || identity === 'suspect') return 'tl-ink-hostile';
  return 'tl-ink-unknown';
}

const isEff = (kind: string) => (EFFECTOR_KINDS as readonly string[]).includes(kind);
const barClass = (kind: string) =>
  kind === 'ew' ? 'tl-bar-ew' : isEff(kind) ? 'tl-bar-e' : 'tl-bar-s';

/** The major and minor tick steps for a span at this scale: at most 8 labelled majors that fit. */
export function tickSteps(spanS: number, pxPerS: number): { major: number; minor: number } {
  // the widest label, "59:00", is five mono characters
  const labMin = 5 * CH + 8;
  let major = MAJORS[MAJORS.length - 1]!;
  for (const m of MAJORS)
    if (spanS / m <= 8 && m * pxPerS >= labMin) {
      major = m;
      break;
    }
  return { major, minor: MINOR[major] ?? major / 5 };
}

type SysRow = { sys: SystemRec; wins: Window[] };
type Lane = {
  path: PathRec;
  top: number;
  h: number;
  rows: SysRow[];
  /** `rows`: each system on its own labelled row; `band`: the compact band of thin bars. */
  layout: 'rows' | 'band';
  /** The y of the first row, the row pitch and the bar thickness. */
  rowsTop: number;
  pitch: number;
  bar: number;
  events: EventRec[];
  points: KeyPoint[];
};

/**
 * Lane geometry: one lane per threat path, stacked from y = 2, each at its content height. The
 * rows share one pitch: the largest from ROW_MIN to ROW_MAX at which every lane fits `areaH`
 * (the lane area's cap, `ui.tlH`), else the compact band. The lanes may still overrun the cap
 * (the area scrolls); they never share blank space.
 */
export function buildLanes(
  scene: Scene,
  d: Derived,
  areaH = 0,
): { lanes: Lane[]; height: number; daRow: boolean } {
  const byPath = scene.scene.paths.map((path) => {
    const rows: SysRow[] = [];
    for (const sys of scene.scene.systems) {
      const wins = d.windows[sys.id]?.[path.id] ?? [];
      if (wins.length) rows.push({ sys, wins });
    }
    return { path, rows };
  });
  const n = byPath.length;
  const hasDa = byPath.some(({ path }) => d.daEntry[path.id] != null);
  const total = (pitch: number | null) =>
    byPath.reduce(
      (s, { rows }) => s + ROWS_FIXED + (pitch && rows.length ? rows.length * pitch : BAND),
      4 + Math.max(0, n - 1) + (hasDa ? DA_H + 1 : 0),
    );
  let pitch: number | null = null;
  for (let p = ROW_MAX; p >= ROW_MIN; p--)
    if (total(p) <= areaH) {
      pitch = p;
      break;
    }
  const lanes: Lane[] = [];
  // the DA row above the first lane, when a threat enters the defended asset
  const daRow = hasDa;
  let y = 2 + (daRow ? DA_H + 1 : 0);
  for (const { path, rows } of byPath) {
    const tall = pitch != null && rows.length > 0;
    const rowPitch =
      pitch != null && rows.length > 0 ? pitch : rows.length <= 4 ? 4 : BAND / rows.length;
    const h = ROWS_FIXED + (tall ? rows.length * rowPitch : BAND);
    lanes.push({
      path,
      top: y,
      h,
      rows,
      layout: tall ? 'rows' : 'band',
      rowsTop: y + 2 + HEAD,
      pitch: rowPitch,
      bar: tall ? BAR : Math.max(1, rowPitch - 1),
      events: scene.events.filter((e) => e.path === path.id),
      points: keyPoints(d, path.id),
    });
    y += h + 1;
  }
  return { lanes, height: Math.max(y + 2, 20), daRow };
}

type Drag =
  | { kind: 'scrub' }
  | { kind: 'range'; t0: number }
  | { kind: 'bead'; key: string; id: string; x0: number; moved: boolean }
  | { kind: 'lane'; key: string | null; x0: number }
  | { kind: 'pan'; x0: number; t0: number; span: number };

export default function Timeline({ mode }: { mode: 'build' | 'brief' }) {
  usePlayback();
  const doc = useDocument((s) => s.doc);
  const tS = useUi((s) => s.tS);
  const timeOn = useUi((s) => s.timeOn);
  const playing = useUi((s) => s.playing);
  const loop = useUi((s) => s.loop);
  const rate = useUi((s) => s.rate);
  const tview = useUi((s) => s.tview);
  const tlH = useUi((s) => s.tlH);
  const selectedKeys = useUi((s) => s.selectedKeys);
  const hoverKey = useUi((s) => s.hoverKey);
  const [plotRef, size] = useSize<HTMLDivElement>();
  const lanesRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // the loop range being dragged: the ref for the pointer handlers, the state for the axis
  const rangeRef = useRef<{ t0: number; t1: number } | null>(null);
  const [rangeTmp, setRangeTmp] = useState<{ t0: number; t1: number } | null>(null);
  const setRange = (r: { t0: number; t1: number } | null) => {
    rangeRef.current = r;
    setRangeTmp(r);
  };
  const [menuT, setMenuT] = useState(0);
  const [clockDraft, setClockDraft] = useState<string | null>(null);

  const scene = doc ? boardScene(doc) : null;
  const d = doc ? boardDerived(doc) : null;
  const tmax = d ? d.tmax : 0;
  const end = runEnd(tmax);
  const W = Math.max(240, Math.round(size.width) || 800);
  const tv0 = tview ? clamp(tview.t0S, 0, end) : 0;
  const tv1 = tview ? clamp(tview.t1S, tv0 + 1, Math.max(end, tv0 + 1)) : end;
  const span = tv1 - tv0;
  const plotW = W - GUT_L - GUT_R;
  const xOf = (t: number) => GUT_L + ((t - tv0) / span) * plotW;
  const cx = (t: number) => clamp(xOf(t), GUT_L, W - GUT_R);
  const inView = (a: number, b: number) => b >= tv0 && a <= tv1;

  const tAt = (clientX: number): number => {
    const el = plotRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return clamp(tv0 + ((clientX - r.left - GUT_L) / plotW) * span, 0, end);
  };

  const ui = useUi.getState;
  const setTimeHere = (t: number) => {
    const u = ui();
    u.setTime(round1(clamp(t, 0, end)));
    if (!u.timeOn) u.setTimeOn(true);
  };

  const { lanes, height, daRow } =
    scene && d ? buildLanes(scene, d, tlH) : { lanes: [], height: 20, daRow: false };
  const warned = new Set<string>();
  for (const w of d?.warnings ?? []) if (w.eventId) warned.add(w.eventId);

  // The auto fit (lane 12.4): a run over three times its action span opens on the span, and
  // follows the span while the document changes, until a zoom by hand (the wheel, the overview
  // pan, the fit commands: any tview this effect did not set). A new document resets that.
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
      f.docId = docId;
      f.hand = false;
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
    () => menuItemsFor('timeline', { pointer: { x: 0, y: 0, tS: menuT }, onArg: () => {} }),
    // Rebuilt for each right-click; the stores are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuT, doc],
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
      const tp = clamp(a0 + ((e.clientX - r.left - GUT_L) / plotW) * sp, 0, end);
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
  }, [plotRef, end, plotW, ui]);

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
      const lane = t.closest('[data-path-key]');
      drag.current = {
        kind: 'lane',
        key: lane?.getAttribute('data-path-key') ?? null,
        x0: e.clientX,
      };
      return;
    }
    capture(e);
    e.preventDefault();
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    const lane = (e.target as Element).closest('[data-path-key]');
    const hk = lane?.getAttribute('data-path-key') ?? null;
    if (!dr || dr.kind === 'lane') {
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
    } else if (dr.kind === 'lane' && dr.key && Math.abs(e.clientX - dr.x0) < 3) {
      ui().setSelection([dr.key]);
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

  // ---------------------------------------------------------------- play bar

  const stopList = () => (doc && d ? stops(doc, d) : [0]);
  const loopMode: 'off' | 'all' | 'range' = !loop
    ? 'off'
    : loop.startS <= 0 && loop.endS >= tmax - 1e-9
      ? 'all'
      : 'range';
  const onLoop = (v: string) => {
    const u = ui();
    if (v === 'off') u.setLoop(null);
    else if (v === 'all') u.setLoop({ startS: 0, endS: tmax });
    else
      u.setLoop(u.tview ? { startS: u.tview.t0S, endS: u.tview.t1S } : { startS: 0, endS: tmax });
  };
  const clockText = timeOn ? fmtTime(tS) : '';
  const onClockKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = parseTime(e.currentTarget.value);
      if (v != null) setTimeHere(v);
      setClockDraft(null);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setClockDraft(null);
      e.currentTarget.blur();
    }
  };

  // ---------------------------------------------------------------- axis

  const axis = (() => {
    const { major, minor } = tickSteps(span, plotW / span);
    const out: ReactNode[] = [];
    const rg = rangeTmp ?? (loop ? { t0: loop.startS, t1: loop.endS } : null);
    if (rg && rg.t1 > rg.t0) {
      const x0 = Math.max(GUT_L, xOf(rg.t0));
      const x1 = Math.min(W - GUT_R, xOf(rg.t1));
      if (x1 > x0)
        out.push(
          <rect key="rg" className="tl-range" x={x0} y={0} width={x1 - x0} height={AXIS_H} />,
          <line key="r0" className="tl-rangeedge" x1={x0} x2={x0} y1={0} y2={AXIS_H} />,
          <line key="r1" className="tl-rangeedge" x1={x1} x2={x1} y1={0} y2={AXIS_H} />,
        );
    }
    out.push(
      <line
        key="base"
        className="tl-axbase"
        x1={GUT_L}
        x2={W - GUT_R}
        y1={AXIS_H - 0.5}
        y2={AXIS_H - 0.5}
      />,
    );
    let labEnd = -Infinity;
    for (let t = Math.ceil(tv0 / minor) * minor; t <= tv1 + 1e-6; t += minor) {
      const tt = Math.round(t * 1000) / 1000;
      const x = xOf(tt);
      const maj = Math.abs(tt / major - Math.round(tt / major)) < 1e-6;
      out.push(
        <line
          key={`t${tt}`}
          className={maj ? 'tl-tick tl-tick-maj' : 'tl-tick'}
          x1={x}
          x2={x}
          y1={maj ? AXIS_H - 7 : AXIS_H - 4}
          y2={AXIS_H}
        />,
      );
      if (!maj) continue;
      const lab = major < 1 || tt % 1 ? tt.toFixed(1) : mmss(tt);
      const atStart = x < GUT_L + 12;
      const lw = lab.length * CH;
      const lx0 = atStart ? x : x - lw / 2;
      if (lx0 >= labEnd + 8) {
        out.push(
          <text
            key={`l${tt}`}
            className="tl-tlab"
            x={x}
            y={AXIS_H - 9}
            textAnchor={atStart ? 'start' : 'middle'}
          >
            {lab}
          </text>,
        );
        labEnd = lx0 + lw;
      }
    }
    out.push(
      <text key="t" className="tl-tlab" x={4} y={AXIS_H - 9}>
        t
      </text>,
    );
    return out;
  })();

  // ---------------------------------------------------------------- lanes

  const laneSvg = lanes.map((L) => {
    const { path, top, h, rows, layout, rowsTop, pitch, bar, events, points } = L;
    const sel = selectedKeys.includes(path.key);
    const ink = inkOf(path.identity);
    const tall = layout === 'rows';
    // the header (threat id, key point glyphs), then the rows (or the band), then the beads
    const rowsEnd = rowsTop + (tall ? rows.length * pitch : BAND);
    const by = rowsEnd + 2 + BEAD_R;
    const foot = top + h - 2;
    const items: ReactNode[] = [];
    rows.forEach(({ sys, wins }, k) => {
      const yy = rowsTop + k * pitch;
      const cls = barClass(sys.kind);
      // in a labelled row the bar is centred on the row; in the band it is the row
      const barY = tall ? yy + Math.floor((pitch - 1 - bar) / 2) : yy;
      if (tall)
        items.push(
          <g key={`r-${sys.id}`} className="tl-row" data-testid="tl-row">
            {kindPill(cls, 4, barY + bar / 2)}
            <text className="tl-rowlab" x={17} y={barY + bar / 2}>
              {sys.id}
            </text>
            <line
              className="tl-row-sep"
              x1={GUT_L}
              x2={W - GUT_R}
              y1={yy + pitch - 1.5}
              y2={yy + pitch - 1.5}
            />
          </g>,
        );
      wins.forEach((w, i) => {
        if (!inView(w.tIn, w.tOut)) return;
        const x0 = cx(w.tIn);
        const x1 = cx(w.tOut);
        const bw = Math.max(1, x1 - x0);
        items.push(
          <g key={`${sys.id}-${i}`} data-testid="tl-window">
            <title>{`${sys.id} sees ${path.id} from ${fmtTime(w.tIn)} to ${fmtTime(w.tOut)}, held ${mmss(w.tOut - w.tIn)}`}</title>
            <rect className={`tl-bar ${cls}`} x={x0} y={barY} width={bw} height={bar} />
            {/* the first see: a darker cap at the bar's start */}
            {w.tIn >= tv0 ? (
              <rect className="tl-bar-cap" x={x0} y={barY} width={1} height={bar} />
            ) : null}
            <rect
              className="tl-bar-hit"
              x={x0}
              y={barY - 1}
              width={Math.max(3, x1 - x0)}
              height={bar + 2}
            />
          </g>,
        );
      });
    });
    // The glyphs sit in the header row at their times; two within STACK_PX stack, the later
    // one STACK_DY lower (the first row's top), each on its own hairline down to the lane foot.
    const gy0 = top + 2 + HEAD / 2;
    const shown = points.filter((p) => p.t >= tv0 && p.t <= tv1);
    const lastX = [-Infinity, -Infinity];
    for (const p of shown) {
      const x = xOf(p.t);
      const level = x - lastX[0]! < STACK_PX && x - lastX[1]! >= STACK_PX ? 1 : 0;
      lastX[level] = x;
      const gy = gy0 + level * STACK_DY;
      const who = p.system ? ` · ${p.system}` : '';
      items.push(
        <g
          key={`s-${p.stage}`}
          className={`tl-stage${p.stage === 'da' ? ' tl-da' : ''}`}
          data-testid="tl-stage"
          data-stage={p.stage}
          data-level={level}
        >
          <title>{`${p.label} · ${fmtTime(p.t)}${who}. ${p.definition}`}</title>
          {/* the time's hairline from the glyph down through the rows to the lane foot */}
          <line x1={x} x2={x} y1={gy + 5} y2={foot} />
          {stageGlyph(p.stage, x, gy)}
        </g>,
      );
    }
    // The engage margin: a bracket along the header's foot from Engage to the latest engage
    // that still gets an effect, with the margin beside it, when it spans 24 px or more.
    const ws = d?.window[path.id];
    const engT = d?.stages[path.id]?.engage?.t;
    if (ws && engT != null && ws.latest != null && ws.margin != null) {
      const x0 = cx(engT);
      const x1 = cx(ws.latest);
      const yb = top + 2 + HEAD - 1.5;
      const label = `margin ${Math.round(ws.margin)} s`;
      // the text goes right of the bracket, or left of it near the strip's right edge
      const right = x1 + 4 + label.length * CH <= W - GUT_R;
      if (x1 - x0 >= 24 && inView(engT, ws.latest))
        items.push(
          <g key="margin" className="tl-margin" data-testid="tl-margin">
            <title>{`Latest engage ${fmtTime(ws.latest)}, margin ${Math.round(ws.margin)} s`}</title>
            <polyline points={`${x0},${yb - 3} ${x0},${yb} ${x1},${yb} ${x1},${yb - 3}`} />
            <text x={right ? x1 + 4 : x0 - 4} y={yb - 1} textAnchor={right ? 'start' : 'end'}>
              {label}
            </text>
          </g>,
        );
    }
    let evEnd = -Infinity;
    for (const e of events) {
      if (e.t < tv0 || e.t > tv1) continue;
      const x = xOf(e.t);
      const warn = warned.has(e.id);
      const cls = `tl-bead${selectedKeys.includes(e.key) ? ' tl-sel' : ''}${warn ? ' tl-warn' : ''}`;
      const text = e.label || e.id;
      const showLab = x >= evEnd;
      if (showLab) evEnd = x + BEAD_R + 4 + text.length * CH + 8;
      items.push(
        <g
          key={e.key}
          className={cls}
          data-testid="tl-bead"
          data-event-key={e.key}
          data-event-id={e.id}
          data-t={e.t}
        >
          <title>{`${e.id} ${e.label || e.type} · ${fmtTime(e.t)}`}</title>
          <circle cx={x} cy={by} r={BEAD_R} />
          <text x={x} y={by}>
            {EV_TYPES[e.type] ?? '?'}
          </text>
          {warn ? (
            <polygon
              className="tl-warn-tri"
              points={`${x + 4},${by - 9} ${x + 8},${by - 2} ${x},${by - 2}`}
            />
          ) : null}
          {showLab ? (
            <text className="tl-evlab" x={x + BEAD_R + 4} y={by}>
              {text}
            </text>
          ) : null}
        </g>,
      );
    }
    return (
      <g key={path.key} data-path-key={path.key} data-testid="tl-lane">
        <rect
          className={`tl-lane${sel ? ' tl-sel' : hoverKey === path.key ? ' tl-hov' : ''}`}
          x={0}
          y={top}
          width={W}
          height={h}
        />
        <text className={`tl-lab ${ink}`} x={4} y={top + 11}>
          {path.id}
        </text>
        {items}
        <line className="tl-lane-sep" x1={0} x2={W} y1={top + h + 0.5} y2={top + h + 0.5} />
      </g>
    );
  });

  // The DA row (lane 12.4, from the reference strip): each threat's defended asset entry as a
  // bar in the hostile ink from its entry to the run end, labelled with the threat id when
  // more than one threat enters.
  const daSvg = (() => {
    if (!daRow || !d) return null;
    const entries = lanes
      .map((L) => ({ id: L.path.id, t: d.daEntry[L.path.id] }))
      .filter((e): e is { id: string; t: number } => e.t != null);
    const y = 2 + (DA_H - 6) / 2;
    return (
      <g data-testid="tl-da-row">
        <text className="tl-lab tl-ink-hostile" x={4} y={2 + DA_H - 2}>
          DA
        </text>
        {entries
          .filter((e) => e.t <= tv1)
          .map((e) => {
            const x0 = cx(e.t);
            const x1 = cx(end);
            return (
              <g key={e.id} data-testid="tl-da-bar">
                <title>{`${e.id} enters the defended asset at ${fmtTime(e.t)}`}</title>
                <rect className="tl-da-bar" x={x0} y={y} width={Math.max(1, x1 - x0)} height={6} />
                {entries.length > 1 && x0 - GUT_L > e.id.length * CH + 6 ? (
                  <text className="tl-da-lab" x={x0 - 3} y={2 + DA_H - 3} textAnchor="end">
                    {e.id}
                  </text>
                ) : null}
              </g>
            );
          })}
        <line className="tl-lane-sep" x1={0} x2={W} y1={2 + DA_H + 0.5} y2={2 + DA_H + 0.5} />
      </g>
    );
  })();

  // a split or merge: a dashed rule across every lane, its circled letter at the top row
  const splitSvg = (d?.splits ?? [])
    .filter((s) => s.t >= tv0 && s.t <= tv1)
    .map((s, i) => {
      const x = xOf(s.t);
      return (
        <g key={`sp${i}`} data-testid="tl-split">
          <title>{`${s.to > s.from ? 'Split' : 'Merge'} to ${s.to} at ${fmtTime(s.t)}`}</title>
          <line className="tl-split" x1={x} x2={x} y1={0} y2={height} />
          <circle className="tl-splab-ring" cx={x} cy={8} r={6} />
          <text className="tl-splab" x={x} y={8}>
            {s.to > s.from ? 'S' : 'M'}
          </text>
        </g>
      );
    });

  const cursorOn = timeOn && tS >= tv0 - 1e-6 && tS <= tv1 + 1e-6;
  const mini = `ps-btn mini quiet ${focusRing}`;

  return (
    <div
      role="group"
      aria-label="Timeline"
      className={`tl tl-${mode} mt-2 shrink-0`}
      data-testid="timeline"
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
          <div
            ref={lanesRef}
            className="tl-lanes"
            style={lanes.length ? { maxHeight: tlH } : undefined}
          >
            {lanes.length ? (
              <svg
                width={W}
                height={height}
                viewBox={`0 0 ${W} ${height}`}
                role="img"
                aria-label="Coverage and key points by threat"
              >
                {daSvg}
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
              className={`tl-cursor-time${xOf(tS) > W - GUT_R - CHIP_W ? ' tl-cursor-time-l' : ''}`}
              data-testid="tl-cursor-time"
            >
              {fmtTime(tS)}
            </span>
          </div>
        </div>
      </ContextMenu>
      <div className="tl-legend" data-testid="tl-legend" aria-label="Legend">
        {GLYPH_ORDER.map((s) => (
          <span key={s} className={`tl-stage${s === 'da' ? ' tl-da' : ''}`}>
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
      <div className="tl-bar" role="toolbar" aria-label="Play bar">
        <Tooltip content="Time to start" shortcut="Home">
          <button
            type="button"
            className={mini}
            aria-label="Time to start"
            onClick={() => setTimeHere(0)}
          >
            <ChevronFirst aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip content="Previous key point" shortcut="[">
          <button
            type="button"
            className={mini}
            aria-label="Previous key point"
            onClick={() => setTimeHere(prevStop(stopList(), ui().tS))}
          >
            <SkipBack aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip content={playing ? 'Pause' : 'Play'} shortcut={mode === 'build' ? 'Space' : 'P'}>
          <button
            type="button"
            className={mini}
            aria-label={playing ? 'Pause' : 'Play'}
            aria-pressed={playing}
            onClick={() => ui().setPlaying(!ui().playing)}
          >
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
        </Tooltip>
        <Tooltip content="Next key point" shortcut="]">
          <button
            type="button"
            className={mini}
            aria-label="Next key point"
            onClick={() => setTimeHere(nextStop(stopList(), ui().tS, tmax))}
          >
            <SkipForward aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip content="Time to end" shortcut="End">
          <button
            type="button"
            className={mini}
            aria-label="Time to end"
            onClick={() => setTimeHere(tmax)}
          >
            <ChevronLast aria-hidden="true" />
          </button>
        </Tooltip>
        <select
          aria-label="Play rate"
          className={`ps-input tl-select ${focusRing}`}
          value={String(rate)}
          onChange={(e) => ui().setRate(Number(e.target.value))}
        >
          {RATES.map((r) => (
            <option key={r} value={String(r)}>
              x{r}
            </option>
          ))}
        </select>
        <select
          aria-label="Loop"
          className={`ps-input tl-select ${focusRing}`}
          value={loopMode}
          onChange={(e) => onLoop(e.target.value)}
        >
          <option value="off">Loop off</option>
          <option value="all">Loop all</option>
          <option value="range">Loop range</option>
        </select>
        <span className="tl-sp" />
        <input
          aria-label="Time"
          className={`ps-input tl-clock ${focusRing}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder="full run"
          value={clockDraft ?? clockText}
          onFocus={() => setClockDraft(clockText)}
          onChange={(e) => setClockDraft(e.target.value)}
          onKeyDown={onClockKey}
          onBlur={() => setClockDraft(null)}
          data-testid="tl-clock"
        />
        <Tooltip content="Time off">
          <button
            type="button"
            className={mini}
            aria-label="Time off"
            disabled={!timeOn}
            onClick={() => ui().setTimeOn(false)}
          >
            <TimerOff aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
