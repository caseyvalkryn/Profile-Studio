// Tip placement (legacy/js/51-panel-tip.js place): 12 px below and right of the pointer, flipped
// to the other side of the pointer at the right or bottom edge, 4 px inside the bounds. The
// pointer target stays uncovered (principle 5.3, spec section 8 Tooltips).

export type Rect = { left: number; top: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Size = { w: number; h: number };

export const TIP_OFFSET = 12;
export const TIP_MARGIN = 4;

/** The tip's top-left corner in the same frame as `rect` and `pointer`. */
export function placeTip(rect: Rect, pointer: Point, size: Size): Point {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  let x = pointer.x + TIP_OFFSET;
  let y = pointer.y + TIP_OFFSET;
  if (x + size.w > right - TIP_MARGIN)
    x = Math.max(rect.left + TIP_MARGIN, pointer.x - TIP_OFFSET - size.w);
  if (y + size.h > bottom - TIP_MARGIN)
    y = Math.max(rect.top + TIP_MARGIN, pointer.y - TIP_OFFSET - size.h);
  return { x: Math.round(x), y: Math.round(y) };
}
