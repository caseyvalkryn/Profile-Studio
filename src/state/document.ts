// The open vignette with undo and redo on immer patches (spec section 8, Undo).
// Every edit that changes the document is one undo step. A drag is one step. System edits made
// with `apply` (run results, prediction locks) are not undo steps. Selection, view and time live
// in ui.ts. `updated` is stamped outside history, so undo never rewinds it. Undo and redo never
// change a locked hypothesis (review 6 F-04): the statement and prediction recorded before the
// first run stay as locked, while the rest of the step still applies.
import {
  applyPatches,
  enablePatches,
  produce,
  produceWithPatches,
  type Draft,
  type Patch,
} from 'immer';
import { create } from 'zustand';
import type { Vignette } from '../domain/types';
import { preview, type Preview } from '../engine/preview';

enablePatches();

export type Recipe = (draft: Draft<Vignette>) => void;

type Entry = { label: string; patches: Patch[]; inverse: Patch[] };
type Drag = { label: string; base: Vignette; patches: Patch[]; inverse: Patch[] };

/** History depth. The oldest step drops off past this. */
export const HISTORY_LIMIT = 200;

export type DocumentState = {
  doc: Vignette | null;
  past: Entry[];
  future: Entry[];
  drag: Drag | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Undo step labels, oldest first. */
  history: string[];
  open: (v: Vignette) => void;
  close: () => void;
  /** One undo step. An edit that changes nothing adds no step. */
  edit: (label: string, recipe: Recipe) => void;
  /**
   * A system edit outside undo history, such as a run result or a prediction lock. Undo and redo
   * never revert it. Ends an open drag first. `label` names the edit for debugging only.
   */
  apply: (label: string, recipe: Recipe) => void;
  beginDrag: (label: string) => void;
  /** Applies to the live document; adds no history until endDrag. */
  updateDrag: (recipe: Recipe) => void;
  endDrag: () => void;
  cancelDrag: () => void;
  undo: () => void;
  redo: () => void;
};

const now = () => new Date().toISOString();

/**
 * `next` with every hypothesis that is locked in `prev` restored to its `prev` value, matched by
 * key. A hypothesis the step removes stays removed only if it was not locked.
 */
export function keepLocked(prev: Vignette, next: Vignette): Vignette {
  const locked = prev.hypotheses.filter((h) => h.lockedAt);
  if (locked.length === 0) return next;
  return produce(next, (d) => {
    for (const h of locked) {
      const i = d.hypotheses.findIndex((x) => x.key === h.key);
      if (i >= 0) d.hypotheses[i] = h;
      else d.hypotheses.push(h);
    }
  });
}

/** The document with `updated` set to now. Applied after a change, never recorded in history. */
function stamp(v: Vignette): Vignette {
  return produce(v, (d) => {
    d.updated = now();
  });
}

function derived(past: Entry[], future: Entry[]) {
  return {
    past,
    future,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    history: past.map((e) => e.label),
  };
}

export const useDocument = create<DocumentState>()((set, get) => {
  const push = (entry: Entry) => {
    if (entry.patches.length === 0) return;
    const past = [...get().past, entry].slice(-HISTORY_LIMIT);
    set(derived(past, []));
  };

  return {
    doc: null,
    drag: null,
    ...derived([], []),

    open: (v) => set({ doc: v, drag: null, ...derived([], []) }),
    close: () => set({ doc: null, drag: null, ...derived([], []) }),

    edit: (label, recipe) => {
      if (get().drag) get().endDrag();
      const doc = get().doc;
      if (!doc) return;
      const [next, patches, inverse] = produceWithPatches(doc, recipe);
      if (patches.length === 0) return;
      set({ doc: stamp(next) });
      push({ label, patches, inverse });
    },

    apply: (_label, recipe) => {
      if (get().drag) get().endDrag();
      const doc = get().doc;
      if (!doc) return;
      const [next, patches] = produceWithPatches(doc, recipe);
      if (patches.length === 0) return;
      set({ doc: stamp(next) });
    },

    beginDrag: (label) => {
      const s = get();
      if (s.drag) s.endDrag();
      const doc = get().doc;
      if (!doc) return;
      set({ drag: { label, base: doc, patches: [], inverse: [] } });
    },

    updateDrag: (recipe) => {
      const { doc, drag } = get();
      if (!doc || !drag) return;
      const [next, patches, inverse] = produceWithPatches(doc, recipe);
      if (patches.length === 0) return;
      set({
        doc: stamp(next),
        // Inverse runs newest first: each step's inverse goes before the earlier ones.
        drag: {
          ...drag,
          patches: [...drag.patches, ...patches],
          inverse: [...inverse, ...drag.inverse],
        },
      });
    },

    endDrag: () => {
      const drag = get().drag;
      if (!drag) return;
      set({ drag: null });
      push({ label: drag.label, patches: drag.patches, inverse: drag.inverse });
    },

    cancelDrag: () => {
      const drag = get().drag;
      if (!drag) return;
      set({ doc: drag.base, drag: null });
    },

    undo: () => {
      if (get().drag) get().cancelDrag();
      const { doc, past, future } = get();
      const entry = past[past.length - 1];
      if (!doc || !entry) return;
      set({
        doc: stamp(keepLocked(doc, applyPatches(doc, entry.inverse))),
        ...derived(past.slice(0, -1), [entry, ...future]),
      });
    },

    redo: () => {
      if (get().drag) get().endDrag();
      const { doc, past, future } = get();
      const entry = future[0];
      if (!doc || !entry) return;
      set({
        doc: stamp(keepLocked(doc, applyPatches(doc, entry.patches))),
        ...derived([...past, entry], future.slice(1)),
      });
    },
  };
});

// One preview per document reference. Selection, view and time changes do not recompute it.
const previews = new WeakMap<Vignette, Preview>();

export function previewOf(v: Vignette): Preview {
  let p = previews.get(v);
  if (!p) {
    p = preview(v);
    previews.set(v, p);
  }
  return p;
}

/** The preview of the open document, or null. Recomputes only when the document changes. */
export function usePreview(): Preview | null {
  const doc = useDocument((s) => s.doc);
  return doc ? previewOf(doc) : null;
}
