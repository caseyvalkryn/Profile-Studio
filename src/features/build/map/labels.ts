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
/** Rings of slots tried before a label gives up and takes its first slot. */
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

/**
 * Place labels so no two overlap. Returns each label's top-left corner, in the input order's
 * priority: the first label always sits in its first slot (right of its anchor).
 */
export function placeLabels(items: readonly LabelBox[]): Map<string, XY> {
  const out = new Map<string, XY>();
  const placed: Rect[] = [];
  for (const l of items) {
    let at: XY | null = null;
    for (const s of slots(l)) {
      const r = { x: s.x, y: s.y, w: l.w, h: l.h };
      if (!placed.some((p) => overlaps(p, r))) {
        at = s;
        break;
      }
    }
    at ??= { x: l.anchor.x + LABEL_DX, y: l.anchor.y + LABEL_DY };
    placed.push({ x: at.x, y: at.y, w: l.w, h: l.h });
    out.set(l.key, at);
  }
  return out;
}

/** Fallback size for a label not yet laid out (jsdom, or before first paint): 11 px mono. */
export function estimateLabelSize(text: string): { w: number; h: number } {
  return { w: Math.ceil(text.length * 6.7) + 1, h: 15 };
}
