// The strip's lane area marks: the DA row, the Cards row, one lane per threat and the group
// splits. Press targets carry data attributes the strip's pointer handlers read:
// `data-select-key` (the key a press selects; with `data-time` a press also sets the time),
// `data-card-key` (a Cards row marker), `data-event-key` (a bead) and `data-path-key` (a lane).
import type { ReactNode } from 'react';
import { EV_TYPES } from '../../board/layers/events';
import type { Card } from '../../domain/types';
import type { Derived } from '../../engine';
import { fmtTime } from '../shared/units';
import { kindPill, stageGlyph } from './glyphs';
import {
  BAND,
  BEAD_R,
  CARDS_H,
  CH,
  CH_LAB,
  DA_H,
  GUT_R,
  HEAD,
  STACK_DY,
  STACK_PX,
  barClass,
  inkOf,
  marginSeconds,
  pointStates,
  stepAt,
  wordFits,
  type CardMark,
  type Lane,
} from './layout';
import { mmss } from '../../engine/tokens';

/** The strip's x scale and view, shared by every mark. */
export type Geo = {
  W: number;
  gut: number;
  tv0: number;
  tv1: number;
  end: number;
  xOf: (t: number) => number;
  /** xOf clamped to the plot. */
  cx: (t: number) => number;
};

/** The selection, the hover and the time the marks light from. */
export type Live = {
  selectedKeys: readonly string[];
  hoverKey: string | null;
  tS: number;
  timeOn: boolean;
};

const inView = (g: Geo, a: number, b: number) => b >= g.tv0 && a <= g.tv1;
/** A glyph's reach from its time: the current glyph's 7 px halo. */
const GLYPH_CLEAR = 7;

export function laneMarks(
  L: Lane,
  g: Geo,
  live: Live,
  d: Derived | null,
  warned: ReadonlySet<string>,
  /** Display id to key, so a glyph press selects the system that gives the step. */
  sysKey: ReadonlyMap<string, string>,
): ReactNode {
  const { W, gut, tv0, tv1, xOf, cx } = g;
  const { path, top, h, rows, layout, rowsTop, pitch, bar, events, points } = L;
  const { selectedKeys, hoverKey } = live;
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
    // a row whose system is selected or hovered (on the strip, the board or the inspector) lights
    const lit = selectedKeys.includes(sys.key) || hoverKey === sys.key ? ' tl-lit' : '';
    // in a labelled row the bar is centred on the row; in the band it is the row
    const barY = tall ? yy + Math.floor((pitch - 1 - bar) / 2) : yy;
    if (tall)
      items.push(
        <g
          key={`r-${sys.id}`}
          className={`tl-row${lit}`}
          data-testid="tl-row"
          data-select-key={sys.key}
        >
          <rect className="tl-hit" x={0} y={yy} width={gut} height={pitch} />
          {kindPill(cls, 4, barY + bar / 2)}
          <text className="tl-rowlab" x={17} y={barY + bar / 2}>
            {sys.id}
          </text>
          <line
            className="tl-row-sep"
            x1={gut}
            x2={W - GUT_R}
            y1={yy + pitch - 1.5}
            y2={yy + pitch - 1.5}
          />
        </g>,
      );
    wins.forEach((w, i) => {
      if (!inView(g, w.tIn, w.tOut)) return;
      const x0 = cx(w.tIn);
      const x1 = cx(w.tOut);
      const bw = Math.max(1, x1 - x0);
      items.push(
        <g
          key={`${sys.id}-${i}`}
          className={`tl-win${lit}`}
          data-testid="tl-window"
          data-select-key={sys.key}
        >
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
  // With time on each draws its state at the cursor: reached, current (with a halo) or future.
  const gy0 = top + 2 + HEAD / 2;
  const states = pointStates(points, live.tS, live.timeOn);
  const lastX = [-Infinity, -Infinity];
  /** The x of each glyph drawn, so the margin label keeps clear of them. */
  const glyphXs: number[] = [];
  points.forEach((p, i) => {
    if (p.t < tv0 || p.t > tv1) return;
    const x = xOf(p.t);
    glyphXs.push(x);
    const level = x - lastX[0]! < STACK_PX && x - lastX[1]! >= STACK_PX ? 1 : 0;
    lastX[level] = x;
    const gy = gy0 + level * STACK_DY;
    const who = p.system ? ` · ${p.system}` : '';
    const state = states[i];
    // a press sets the time here and selects the system that gives the step (DA: the threat)
    const selKey = (p.stage !== 'da' && p.system && sysKey.get(p.system)) || path.key;
    items.push(
      <g
        key={`s-${p.stage}`}
        className={`tl-stage${p.stage === 'da' ? ' tl-da' : ''}${state ? ` ${state}` : ''}`}
        data-testid="tl-stage"
        data-stage={p.stage}
        data-level={level}
        data-select-key={selKey}
        data-time={p.t}
      >
        <title>{`${p.label} · ${fmtTime(p.t)}${who}. ${p.definition}`}</title>
        {/* the time's hairline from the glyph down through the rows to the lane foot */}
        <line className="tl-hair" x1={x} x2={x} y1={gy + 5} y2={foot} />
        {state === 'tl-current' ? <circle className="tl-halo" cx={x} cy={gy} r={7} /> : null}
        {stageGlyph(p.stage, x, gy)}
        <circle className="tl-hit" cx={x} cy={gy} r={6} />
      </g>,
    );
  });
  // The engage margin: a bracket along the header's foot from Engage to the latest engage
  // that still gets an effect, with the margin beside it, when it spans 24 px or more.
  const ws = d?.window[path.id];
  const engT = d?.stages[path.id]?.engage?.t;
  if (ws && engT != null && ws.latest != null && ws.margin != null) {
    const x0 = cx(engT);
    const x1 = cx(ws.latest);
    const yb = top + 2 + HEAD - 1.5;
    // signed as the Frame panel signs it (review 13 F-06): "margin +142 s"
    const label = `margin ${marginSeconds(ws.margin)}`;
    const lw = label.length * CH;
    // The first spot clear of every glyph (its 4 px radius and the 7 px halo): right of the
    // bracket, inside it after its last glyph (Engage, or Assess when it follows), else left of
    // Engage (review 13 F-06).
    const clear = (a: number, b: number) =>
      glyphXs.every((gx) => gx + GLYPH_CLEAR < a || gx - GLYPH_CLEAR > b);
    const inner = Math.max(x0, ...glyphXs.filter((gx) => gx >= x0 - GLYPH_CLEAR && gx <= x1));
    const span = (x: number, anchor: 'start' | 'end') =>
      anchor === 'start' ? { x, anchor, a: x, b: x + lw } : { x, anchor, a: x - lw, b: x };
    const spots = [
      span(x1 + 4, 'start'),
      span(inner + GLYPH_CLEAR + 2, 'start'),
      span(x0 - GLYPH_CLEAR - 2, 'end'),
    ];
    const fits = (sp: (typeof spots)[number], i: number) =>
      sp.a >= gut && sp.b <= W - GUT_R && (i !== 1 || sp.b <= x1 - 4) && clear(sp.a, sp.b);
    const spot = spots.find(fits) ?? spots[2]!;
    if (x1 - x0 >= 24 && inView(g, engT, ws.latest))
      items.push(
        <g key="margin" className="tl-margin" data-testid="tl-margin">
          <title>{`Latest engage ${fmtTime(ws.latest)}, ${label}`}</title>
          <polyline points={`${x0},${yb - 3} ${x0},${yb} ${x1},${yb} ${x1},${yb - 3}`} />
          <text x={spot.x} y={yb - 1} textAnchor={spot.anchor}>
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
  // the step reached at the cursor after the threat id, when the gutter has room (lane 13.1)
  const step = live.timeOn ? stepAt(points, live.tS) : null;
  const word = step && wordFits(path.id, step.label, gut) ? step.label : null;
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
      {word ? (
        <text
          className="tl-step"
          x={4 + path.id.length * CH_LAB + 4}
          y={top + 11}
          data-testid="tl-step"
        >
          {word}
        </text>
      ) : null}
      {items}
      <line className="tl-lane-sep" x1={0} x2={W} y1={top + h + 0.5} y2={top + h + 0.5} />
    </g>
  );
}

/**
 * The DA row (lane 12.4, from the reference strip): each threat's defended asset entry as a bar
 * in the hostile ink from its entry to the run end, labelled with the threat id when more than
 * one threat enters.
 */
export function daMarks(lanes: readonly Lane[], g: Geo, d: Derived): ReactNode {
  const { W, gut, tv1, cx, end } = g;
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
              {entries.length > 1 && x0 - gut > e.id.length * CH + 6 ? (
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
}

/** The time words of a card: "t+1:40", or "t+0:10 to t+0:40" for a slice. */
export function cardTimeText(card: Card, t: number): string {
  return card.clip ? `${fmtTime(card.clip.t0S)} to ${fmtTime(card.clip.t1S)}` : fmtTime(t);
}

/**
 * The Cards row (lane 13.1): a 12 px rounded square per card that has a time, with its number in
 * the deck; a slice draws a 6 px band from its start to its end under the marker. The current
 * card (ui.cardKey, else the first) draws in the accent.
 */
export function cardMarksSvg(
  marks: readonly CardMark[],
  top: number,
  g: Geo,
  currentKey: string | null,
): ReactNode {
  const { W, cx, tv0, tv1 } = g;
  const cy = top + CARDS_H / 2;
  return (
    <g data-testid="tl-cards-row">
      <text className="tl-lab tl-cards-lab" x={4} y={top + 11}>
        Cards
      </text>
      {marks.map(({ card, n, t }) => {
        const cur = card.key === currentKey;
        const clip = card.clip;
        const shown = inView(g, clip ? Math.min(clip.t0S, t) : t, clip ? Math.max(clip.t1S, t) : t);
        if (!shown) return null;
        const x = cx(t);
        const onRow = t >= tv0 && t <= tv1;
        return (
          <g
            key={card.key}
            className={`tl-card${cur ? ' tl-card-cur' : ''}`}
            data-testid="tl-card"
            data-card-key={card.key}
          >
            <title>{`Card ${n} · ${card.name} · ${cardTimeText(card, t)}`}</title>
            {clip ? (
              <rect
                className="tl-card-slice"
                data-testid="tl-card-slice"
                x={cx(clip.t0S)}
                y={cy - 3}
                width={Math.max(1, cx(clip.t1S) - cx(clip.t0S))}
                height={6}
              />
            ) : null}
            {onRow ? (
              <>
                <rect
                  className="tl-card-mark"
                  x={x - 6}
                  y={cy - 6}
                  width={12}
                  height={12}
                  rx={2.5}
                />
                <text x={x} y={cy}>
                  {n}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
      <line
        className="tl-lane-sep"
        x1={0}
        x2={W}
        y1={top + CARDS_H + 0.5}
        y2={top + CARDS_H + 0.5}
      />
    </g>
  );
}

/** A split or merge: a dashed rule across every lane, its circled letter at the top row. */
export function splitMarks(d: Derived | null, g: Geo, height: number): ReactNode[] {
  return (d?.splits ?? [])
    .filter((s) => s.t >= g.tv0 && s.t <= g.tv1)
    .map((s, i) => {
      const x = g.xOf(s.t);
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
}
