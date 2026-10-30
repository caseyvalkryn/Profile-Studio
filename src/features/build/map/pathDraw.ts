// Path drawing (spec section 8, Place). A threat drop or armed click places the first waypoint;
// each click adds one; double-click or Enter ends it; Escape cancels. The draft lives outside the
// document, so the finished path is one undo step and a cancel leaves the document untouched.
import type { XY } from './frame';

export type PathDraft = {
  type: string;
  /** Threat key when the draft extends an existing threat (after "Add threat here"). */
  extend: string | null;
  points: XY[];
};

export type DrawEvent =
  | { t: 'start'; type: string; p: XY; extend?: string | null; points?: XY[] }
  | { t: 'click'; p: XY; tolM: number }
  | { t: 'finish' }
  | { t: 'cancel' };

export type DrawResult = { draft: PathDraft | null; commit: PathDraft | null };

export function drawStep(draft: PathDraft | null, e: DrawEvent): DrawResult {
  switch (e.t) {
    case 'start':
      return {
        draft: { type: e.type, extend: e.extend ?? null, points: e.points ?? [e.p] },
        commit: null,
      };
    case 'click': {
      if (!draft) return { draft, commit: null };
      const last = draft.points[draft.points.length - 1];
      // The clicks of a double-click land on the last point; they add nothing.
      if (last && Math.hypot(last.x - e.p.x, last.y - e.p.y) <= e.tolM)
        return { draft, commit: null };
      return { draft: { ...draft, points: [...draft.points, e.p] }, commit: null };
    }
    case 'finish':
      return { draft: null, commit: draft };
    case 'cancel':
      return { draft: null, commit: null };
  }
}
