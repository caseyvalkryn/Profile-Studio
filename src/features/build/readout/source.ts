// The readout's default source: the derive layer, `boardDerived(v).at(threatId, tS, ref)`
// (src/engine/at.ts), from the same memo the board renders with. The reference is the board's
// (`useBoard.ref`, the Ref select) unless the caller names a system.
import type { Vignette } from '../../../domain/types';
import { boardDerived } from '../board/derived';
import { useBoard } from '../board/store';
import type { ReadoutAt } from './types';

/** The reference the readout measures from: the defended asset (legacy `ui.cam.ref` default). */
export const DEFAULT_REF = 'asset';

/** `at` for one vignette. A `ref` of DEFAULT_REF follows the board reference. */
export function readoutAtFor(v: Vignette): ReadoutAt {
  const d = boardDerived(v);
  return (threatId, tS, ref) => {
    const r = d.at(threatId, tS, ref && ref !== DEFAULT_REF ? ref : useBoard.getState().ref);
    if (!r) return null;
    // derived.at carries the whole window summary; the readout shows its geometric window.
    return { ...r, window: r.window ? r.window.geometric : null };
  };
}
