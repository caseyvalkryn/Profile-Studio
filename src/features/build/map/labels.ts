// Label placement for the map overlay (review watch-list 3c). A greedy pass in input order: each
// label takes the first free slot around its anchor, so earlier labels keep their place and later
// ones move. Pure and deterministic; the controller measures the boxes and writes the transforms.
import type { XY } from './frame';

export type LabelBox = { key: string; anchor: XY; w: number; h: number };

/** Offset of the first slot from the anchor: right of the symbol, top edge just below centre. */
export const LABEL_DX = 8;
export const LABEL_DY = 4;
/** Clear space kept between two labels, pixels. */
const GAP = 2;
/** Rings of slots tried before a label gives up and is hidden. */
const MAX_RINGS = 48;

type Rect = { x: number; y: number; w: number; h: number };

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

/**
 * Top-left corners of the slots around `l`, nearest first. Ring 0 is right, left, below, above;
 * each further ring repeats them one line further out (right and left step down, below steps
 * down, above steps up).
 */
function* slots(l: LabelBox): Generator<XY> {
  const { anchor: a, w, h } = l;
  const row = h + GAP;
  for (let k = 0; k < MAX_RINGS; k++) {
    const d = k * row;
    yield { x: a.x + LABEL_DX, y: a.y + LABEL_DY + d };
    yield { x: a.x - LABEL_DX - w, y: a.y + LABEL_DY + d };
    yield { x: a.x - w / 2, y: a.y + LABEL_DY + row + d };
    yield { x: a.x - w / 2, y: a.y - LABEL_DX - h - d };
  }
}

/** A box a label must not cover: a marker or a small area, pixels. `key` is its object. */
export type Obstacle = Rect & { key: string };

export type PlaceOptions = {
  /** Markers and small areas; a label never covers one, except its own object's. */
  obstacles?: readonly Obstacle[];
  /** Canvas size: a label stays inside it. Omit, or pass 0, to place without bounds. */
  bounds?: { w: number; h: number };
};

/** Strict overlap with no gap: a label may touch a marker's box edge. */
const covers = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Place labels so no two overlap and none covers a marker (review 7.R F-09). Returns each
 * label's top-left corner, in the input order's priority: the first label sits in its first free
 * slot (right of its anchor). A label with no free slot inside the bounds is left out of the
 * result, and the caller hides it, rather than drawn over another label or a marker.
 */
export function placeLabels(
  items: readonly LabelBox[],
  { obstacles = [], bounds }: PlaceOptions = {},
): Map<string, XY> {
  const out = new Map<string, XY>();
  const placed: Rect[] = [];
  const inside = (r: Rect) =>
    !bounds?.w ||
    !bounds.h ||
    (r.x >= 0 && r.y >= 0 && r.x + r.w <= bounds.w && r.y + r.h <= bounds.h);
  for (const l of items) {
    for (const s of slots(l)) {
      const r = { x: s.x, y: s.y, w: l.w, h: l.h };
      if (!inside(r)) continue;
      if (placed.some((p) => overlaps(p, r))) continue;
      if (obstacles.some((o) => o.key !== l.key && covers(o, r))) continue;
      placed.push(r);
      out.set(l.key, s);
      break;
    }
  }
  return out;
}

/** Fallback size for a label not yet laid out (jsdom, or before first paint): 11 px mono. */
export function estimateLabelSize(text: string): { w: number; h: number } {
  return { w: Math.ceil(text.length * 6.7) + 1, h: 15 };
}
