// The strip's geometry (Timeline.tsx draws it): the constants, the lanes, the gutter width, the
// step reached at a time and the state of each key point at the cursor. No React and no store.
import type { PathRec, Scene, SystemRec, EventRec } from '../../board';
import { EFFECTOR_KINDS } from '../../domain/catalog';
import type { Card } from '../../domain/types';
import type { Derived } from '../../engine';
import type { Window } from '../../engine/geo';
import { keyPoints, type KeyPoint } from './stages';

/** The base left gutter: the threat id, and in a tall lane the pill and id of each system row. */
export const GUT_L = 56;
/** The gutter when a lane header carries its step word ("T1 Engage") and needs the room. */
export const GUT_WIDE = 72;
export const GUT_R = 12;
export const AXIS_H = 24;
/** px per mono character: 11 px (the micro size) and 12 px (the data size, the lane ids). */
export const CH = 6.6;
export const CH_LAB = 7.2;
/** The band the coverage bars share: up to four at 3 px with a 1 px gap, more at a finer pitch. */
export const BAND = 16;
/** An event bead: a circled letter, 7 px radius (the reference strip's size). */
export const BEAD_R = 7;
/** The lane's header row: the threat id at the left, the key point glyphs at their times. */
export const HEAD = 14;
/** A labelled system row: 14 px by default, growing to ROW_MAX with room (lane 12.4). */
export const ROW_MIN = 14;
export const ROW_MAX = 24;
/** The bar thickness of a labelled row, centred in the row. */
export const BAR = 8;
/** The lane's fixed parts around the rows: top pad, header, gap, beads, bottom pad. */
export const ROWS_FIXED = 2 + HEAD + 2 + 2 * BEAD_R + 4;
/** The defended asset row at the top of the lane area: each threat's entry to the run end. */
export const DA_H = 12;
/** The Cards row under the DA row (lane 13.1): one marker per card that has a time. */
export const CARDS_H = 14;
/** Two glyphs within this many px stack: the later one draws STACK_DY lower. */
export const STACK_PX = 10;
export const STACK_DY = 10;

export const round1 = (t: number) => Math.round(t * 10) / 10;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** "2:55", "175", "t+2:55" or "2:55.5" to seconds; null when the text is not a time. */
export function parseTime(text: string): number | null {
  const s = text.trim().replace(/^t\+/i, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function mmss(s: number): string {
  const a = Math.round(Math.abs(s));
  return `${Math.floor(a / 60)}:${a % 60 < 10 ? '0' : ''}${a % 60}`;
}

export function inkOf(identity: PathRec['identity']): string {
  if (identity === 'friend') return 'tl-ink-friend';
  if (identity === 'hostile' || identity === 'suspect') return 'tl-ink-hostile';
  return 'tl-ink-unknown';
}

const isEff = (kind: string) => (EFFECTOR_KINDS as readonly string[]).includes(kind);
export const barClass = (kind: string) =>
  kind === 'ew' ? 'tl-bar-ew' : isEff(kind) ? 'tl-bar-e' : 'tl-bar-s';

export type SysRow = { sys: SystemRec; wins: Window[] };
export type Lane = {
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

export type Lanes = {
  lanes: Lane[];
  height: number;
  daRow: boolean;
  /** The Cards row's top, or null when no card has a time. */
  cardsTop: number | null;
};

/**
 * Lane geometry: the DA row, the Cards row (when `cardsRow`), then one lane per threat path,
 * each at its content height. The rows share one pitch: the largest from ROW_MIN to ROW_MAX at
 * which every lane fits `areaH` (the lane area's cap, `ui.tlH`), else the compact band. The lanes
 * may still overrun the cap (the area scrolls); they never share blank space.
 */
export function buildLanes(scene: Scene, d: Derived, areaH = 0, cardsRow = false): Lanes {
  const byPath = scene.scene.paths.map((path) => {
    const rows: SysRow[] = [];
    for (const sys of scene.scene.systems) {
      const wins = d.windows[sys.id]?.[path.id] ?? [];
      if (wins.length) rows.push({ sys, wins });
    }
    return { path, rows };
  });
  const n = byPath.length;
  const daRow = byPath.some(({ path }) => d.daEntry[path.id] != null);
  const head = (daRow ? DA_H + 1 : 0) + (cardsRow ? CARDS_H + 1 : 0);
  const total = (pitch: number | null) =>
    byPath.reduce(
      (s, { rows }) => s + ROWS_FIXED + (pitch && rows.length ? rows.length * pitch : BAND),
      4 + Math.max(0, n - 1) + head,
    );
  let pitch: number | null = null;
  for (let p = ROW_MAX; p >= ROW_MIN; p--)
    if (total(p) <= areaH) {
      pitch = p;
      break;
    }
  const lanes: Lane[] = [];
  const cardsTop = cardsRow ? 2 + (daRow ? DA_H + 1 : 0) : null;
  let y = 2 + head;
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
  return { lanes, height: Math.max(y + 2, 20), daRow, cardsTop };
}

/** The F2T2EA step reached at t: the latest key point at or before t (not the DA entry). */
export function stepAt(points: readonly KeyPoint[], t: number): KeyPoint | null {
  let out: KeyPoint | null = null;
  for (const p of points) if (p.stage !== 'da' && p.t <= t + 1e-9) out = p;
  return out;
}

/** The width a lane header takes with this step word: pad, id (12 px), gap, word (11 px), pad. */
const headW = (id: string, word: string) => 4 + id.length * CH_LAB + 4 + word.length * CH + 4;

/** True when the header has room for the id and this word in a gutter of `gut` px. */
export const wordFits = (id: string, word: string, gut: number) => headW(id, word) <= gut;

/**
 * The left gutter: GUT_WIDE when some lane's id with its longest step word needs more than GUT_L
 * and fits GUT_WIDE, else GUT_L. It reads the lanes only, never the time, so the plot does not
 * shift while the cursor moves.
 */
export function gutterFor(lanes: readonly Lane[]): number {
  for (const L of lanes) {
    let word = '';
    for (const p of L.points) if (p.stage !== 'da' && p.label.length > word.length) word = p.label;
    if (!word) continue;
    const w = headW(L.path.id, word);
    if (w > GUT_L && w <= GUT_WIDE) return GUT_WIDE;
  }
  return GUT_L;
}

/** A key point's state at the cursor (lane 13.1 item 4); the class names 13.2 reuses. */
export type PointState = 'tl-reached' | 'tl-current' | 'tl-future';

/**
 * Each point's state at t, in order: at or before t is reached, the latest reached is current,
 * after t is future. With time off, every state is null (the glyphs draw as before).
 */
export function pointStates(
  points: readonly { t: number }[],
  t: number,
  timeOn: boolean,
): (PointState | null)[] {
  if (!timeOn) return points.map(() => null);
  let cur = -1;
  points.forEach((p, i) => {
    if (p.t <= t + 1e-9 && (cur < 0 || p.t >= points[cur]!.t)) cur = i;
  });
  return points.map((p, i) =>
    i === cur ? 'tl-current' : p.t <= t + 1e-9 ? 'tl-reached' : 'tl-future',
  );
}

/** A card on the Cards row: its 1-based place in the deck, its time and its slice. */
export type CardMark = { card: Card; n: number; t: number };

/** The cards that have a time (a frame's `tS`, else a slice's start), with their deck number. */
export function cardMarks(cards: readonly Card[]): CardMark[] {
  const out: CardMark[] = [];
  cards.forEach((card, i) => {
    const t = card.tS ?? card.clip?.t0S ?? null;
    if (t != null) out.push({ card, n: i + 1, t });
  });
  return out;
}
