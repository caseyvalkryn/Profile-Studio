// The timeline strip (reference artifact `js/51-panel-timeline.js`, ported onto the React stores):
// one strip that Build hosts under the board and Brief hosts under the stage, over the one time
// state in `useUi` (tS, timeOn, playing, loop, rate, tview). The axis: ticks, the loop range and
// the time cursor; a press scrubs, Shift and drag set the loop range, a double click clears it,
// Ctrl or Cmd and the wheel zoom the span (the overview bar above the axis pans it; a double
// click there fits the run). One lane per threat: the coverage bars of each sensor and effector
// that sees it, the F2T2EA key points as glyphs with the step name (glyphs.tsx), the authored
// events as beads with the board's letter and their label when there is room, the defended
// asset entry, and the group splits across the lanes. The lane area takes `ui.tlH`: the grip on
// the strip's top edge drags it (ArrowUp and ArrowDown step it, a double click resets it), the
// lanes share the height, and a lane tall enough gives each system its own labelled row. A
// bead press sets the time there and selects the event; in Build a bead drags to move the event
// (one undo step). The legend names the marks. The play bar: first, previous stop, play, next
// stop, last, rate, loop, the clock (type a time and press Enter) and the Time checkbox. The
// strip mounts the playback clock.
import './timeline.css';
import { ChevronFirst, ChevronLast, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
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
import { kindSwatch, stageGlyph } from './glyphs';
import { keyPoints, type KeyPoint } from './stages';

export const RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const;
/** The strip's shortest run, so an empty or short profile still has a usable axis. */
export const MIN_RUN_S = 60;

/** The left gutter: the threat id, and in a tall lane the system ids of its rows. */
export const GUT_L = 72;
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
const CH = 6.6; // px per mono character at 11 px
/** The band the coverage bars share: up to four at 3 px with a 1 px gap, more at a finer pitch. */
const BAND = 16;
const BEAD_R = 5;
const STAGE_H = 13;
/** One lane's least height, the same whatever it holds, so an added system never moves the board. */
const LANE_H = 2 + BAND + 2 + STAGE_H + 2 * BEAD_R + 4;
/** A tall lane: a header line with the threat id, then one labelled row per system. */
const HEAD = 14;
const ROW_MIN = 12;
const ROW_MAX = 22;
/** The lane's fixed parts around the rows: top pad, header, gap, stage row, beads, bottom pad. */
const ROWS_FIXED = 2 + HEAD + 2 + STAGE_H + 2 * BEAD_R + 4;
const GLYPH = 9;
const STEP_PX = 16;

export const runEnd = (tmaxS: number) => Math.max(MIN_RUN_S, tmaxS);
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
  const labMin = 6 * CH + 8;
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
 * Lane geometry: one lane per threat path, stacked from y = 2. Every lane is the same height:
 * LANE_H, or more when `areaH` (the lane area) has room, so the lanes share it. A lane whose rows
 * get a pitch of ROW_MIN or more lays each system on its own labelled row.
 */
export function buildLanes(scene: Scene, d: Derived, areaH = 0): { lanes: Lane[]; height: number } {
  const lanes: Lane[] = [];
  const n = scene.scene.paths.length;
  const laneH = Math.max(LANE_H, n ? Math.floor((areaH - 4 - (n - 1)) / n) : LANE_H);
  let y = 2;
  for (const path of scene.scene.paths) {
    const rows: SysRow[] = [];
    for (const sys of scene.scene.systems) {
      const wins = d.windows[sys.id]?.[path.id] ?? [];
      if (wins.length) rows.push({ sys, wins });
    }
    const free = laneH - ROWS_FIXED;
    const tall = rows.length > 0 && free >= rows.length * ROW_MIN;
    const pitch = tall
      ? Math.min(ROW_MAX, Math.floor(free / rows.length))
      : rows.length <= 4
        ? 4
        : BAND / rows.length;
    lanes.push({
      path,
      top: y,
      h: laneH,
      rows,
      layout: tall ? 'rows' : 'band',
      rowsTop: y + 2 + (tall ? HEAD : 0),
      pitch,
      bar: tall ? pitch - 4 : Math.max(1, pitch - 1),
      events: scene.events.filter((e) => e.path === path.id),
      points: keyPoints(d, path.id),
    });
    y += laneH + 1;
  }
  return { lanes, height: Math.max(y + 2, 20) };
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

  const { lanes, height } = scene && d ? buildLanes(scene, d, tlH) : { lanes: [], height: 20 };
  const warned = new Set<string>();
  for (const w of d?.warnings ?? []) if (w.eventId) warned.add(w.eventId);

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
      const lab = major < 1 || tt % 1 ? `t+${tt.toFixed(1)}` : fmtTime(tt);
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
    // the rows (or the band) at the lane's head, then the stage row, then the beads
    const stageY = tall ? rowsTop + rows.length * pitch + 2 : top + 2 + BAND + 2;
    const by = stageY + STAGE_H + BEAD_R;
    const items: ReactNode[] = [];
    rows.forEach(({ sys, wins }, k) => {
      const yy = rowsTop + k * pitch;
      const cls = barClass(sys.kind);
      if (tall)
        items.push(
          <g key={`r-${sys.id}`} className="tl-row" data-testid="tl-row">
            {kindSwatch(cls, 4, yy + bar / 2)}
            <text className="tl-rowlab" x={11} y={yy + bar / 2}>
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
        items.push(
          <g key={`${sys.id}-${i}`} data-testid="tl-window">
            <title>{`${sys.id} sees ${path.id} from ${fmtTime(w.tIn)} to ${fmtTime(w.tOut)}, held ${mmss(w.tOut - w.tIn)}`}</title>
            <rect
              className={`tl-bar ${cls}`}
              x={x0}
              y={yy}
              width={Math.max(1, x1 - x0)}
              height={bar}
            />
            {/* the first see: a darker cap at the bar's start */}
            {w.tIn >= tv0 ? (
              <rect className="tl-bar-cap" x={x0} y={yy} width={1} height={bar} />
            ) : null}
            <rect
              className="tl-bar-hit"
              x={x0}
              y={yy - 1}
              width={Math.max(3, x1 - x0)}
              height={bar + 2}
            />
          </g>,
        );
      });
    });
    const gy = stageY + GLYPH / 2 + 1;
    const shown = points.filter((p) => p.t >= tv0 && p.t <= tv1);
    // The glyph always shows. Its label goes to the right when it ends before the next glyph,
    // else to the left when that space is free of the last label, else it is dropped.
    let used = GUT_L;
    const hg = GLYPH / 2;
    shown.forEach((p, i) => {
      const x = xOf(p.t);
      const next = shown[i + 1];
      const lw = p.label.length * CH;
      let side: 'r' | 'l' | null = null;
      if (x + hg + 3 >= used && (!next || x + hg + 3 + lw <= xOf(next.t) - hg - 2)) side = 'r';
      else if (x - hg - 3 - lw >= used + 4) side = 'l';
      used = side === 'r' ? x + hg + 3 + lw : x + hg;
      const who = p.system ? ` · ${p.system}` : '';
      items.push(
        <g
          key={`s-${p.stage}`}
          className={`tl-stage${p.stage === 'da' ? ' tl-da' : ''}`}
          data-testid="tl-stage"
          data-stage={p.stage}
        >
          <title>{`${p.label} · ${fmtTime(p.t)}${who}. ${p.definition}`}</title>
          {/* the time's hairline up through the rows to the glyph */}
          <line x1={x} x2={x} y1={top + 2 + (tall ? HEAD : 0)} y2={gy - GLYPH / 2 - 1} />
          {stageGlyph(p.stage, x, gy)}
          {side ? (
            <text
              x={side === 'r' ? x + hg + 3 : x - hg - 3}
              y={stageY + 10}
              textAnchor={side === 'r' ? 'start' : 'end'}
            >
              {p.label}
            </text>
          ) : null}
        </g>,
      );
    });
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

  const splitSvg = (d?.splits ?? [])
    .filter((s) => s.t >= tv0 && s.t <= tv1)
    .map((s, i) => {
      const x = xOf(s.t);
      return (
        <g key={`sp${i}`} data-testid="tl-split">
          <title>{`${s.to > s.from ? 'Split' : 'Merge'} to ${s.to} at ${fmtTime(s.t)}`}</title>
          <line className="tl-split" x1={x} x2={x} y1={0} y2={height} />
          <text className="tl-splab" x={x + 3} y={10}>
            {s.to > s.from ? 'S ' : 'M '}
            {s.to}
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
        <div className="tl-resize-rule" />
      </div>
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
          <div ref={lanesRef} className="tl-lanes" style={{ height: tlH }}>
            {lanes.length ? (
              <svg
                width={W}
                height={height}
                viewBox={`0 0 ${W} ${height}`}
                role="img"
                aria-label="Coverage and key points by threat"
              >
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
            <span className="tl-cursor-time" data-testid="tl-cursor-time">
              {fmtTime(tS)}
            </span>
          </div>
        </div>
      </ContextMenu>
      <div className="tl-legend" data-testid="tl-legend" aria-label="Legend">
        <span>
          <svg width="12" height="8" aria-hidden="true">
            <rect className="tl-bar tl-bar-s" x={0} y={1} width={12} height={6} rx={1} />
          </svg>
          Sensor
        </span>
        <span>
          <svg width="12" height="8" aria-hidden="true">
            <rect className="tl-bar tl-bar-e" x={0} y={1} width={12} height={6} rx={1} />
          </svg>
          Effector
        </span>
        <span>
          <svg width="12" height="8" aria-hidden="true">
            <rect className="tl-bar tl-bar-ew" x={0} y={1} width={12} height={6} rx={1} />
          </svg>
          EW
        </span>
        <span className="tl-stage">
          <svg width="12" height="12" aria-hidden="true">
            {stageGlyph('track', 6, 6)}
          </svg>
          F2T2EA step
        </span>
        <span className="tl-bead">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx={6} cy={6} r={BEAD_R} />
            <text x={6} y={6}>
              D
            </text>
          </svg>
          Event
        </span>
        <span className="tl-stage tl-da">
          <svg width="12" height="12" aria-hidden="true">
            {stageGlyph('da', 6, 6)}
          </svg>
          Defended asset
        </span>
      </div>
      <div className="tl-bar" role="toolbar" aria-label="Play bar">
        <label className="tl-check">
          <input
            type="checkbox"
            checked={timeOn}
            onChange={(e) => ui().setTimeOn(e.target.checked)}
            className={focusRing}
          />
          Time
        </label>
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
      </div>
    </div>
  );
}
