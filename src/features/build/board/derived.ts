// The board's read of the document: one memoised `derived(v, preview(v))` and one `toScene(v)`
// per Vignette reference (WeakMap), so a render, a drag step and the readout never derive twice
// for the same document. Exported for lane 9.2.6 (the thumbnails and the strip read the same memo).
import { derived, type Derived } from '../../../engine/derived';
import type { Vignette } from '../../../domain/types';
import { toScene } from '../../../board';
import type { Scene } from '../../../board';
import { previewOf } from '../../../state/document';

const memo = new WeakMap<Vignette, Derived>();

/** `derived(v, previewOf(v))`, one per Vignette reference. */
export function boardDerived(v: Vignette): Derived {
  let d = memo.get(v);
  if (!d) {
    d = derived(v, previewOf(v));
    memo.set(v, d);
  }
  return d;
}

/** The legacy record the layers read, one per Vignette reference (toScene memoises too). */
export function boardScene(v: Vignette): Scene {
  return toScene(v);
}
