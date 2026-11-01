// The open vignette with undo and redo on immer patches (spec section 8, Undo).
// Every edit that changes the document is one undo step. A drag is one step. Selection, view and
// time live in ui.ts. `updated` and `version` are stamped outside history, so undo never rewinds
// them: `version` rises by one where a committed edit is pushed (an edit, or the end of a drag).
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
  beginDrag: (label: string) => void;
  /** Applies to the live document; adds no history until endDrag. */
  updateDrag: (recipe: Recipe) => void;
  endDrag: () => void;
  cancelDrag: () => void;
  undo: () => void;
  redo: () => void;
};

const now = () => new Date().toISOString();

/** The document with `updated` set to now. Applied after a change, never recorded in history. */
function stamp(v: Vignette): Vignette {
  return produce(v, (d) => {
    d.updated = now();
  });
}

/** The document with `version` one higher. Applied as an edit is committed, never recorded. */
function bump(v: Vignette): Vignette {
  return produce(v, (d) => {
    d.version = (d.version || 1) + 1;
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
  // One committed edit: one undo step and one version.
  const push = (entry: Entry) => {
    if (entry.patches.length === 0) return;
    const past = [...get().past, entry].slice(-HISTORY_LIMIT);
    const doc = get().doc;
    set({ ...(doc ? { doc: bump(doc) } : {}), ...derived(past, []) });
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
        doc: stamp(applyPatches(doc, entry.inverse)),
        ...derived(past.slice(0, -1), [entry, ...future]),
      });
    },

    redo: () => {
      if (get().drag) get().endDrag();
      const { doc, past, future } = get();
      const entry = future[0];
      if (!doc || !entry) return;
      set({
        doc: stamp(applyPatches(doc, entry.patches)),
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
    // Grouped threats fly as one group (legacy derive); the preview needs their keys.
    p = preview(v, { groupKeys: v.threats.filter((t) => t.group).map((t) => t.key) });
    previews.set(v, p);
  }
  return p;
}

/** The preview of the open document, or null. Recomputes only when the document changes. */
export function usePreview(): Preview | null {
  const doc = useDocument((s) => s.doc);
  return doc ? previewOf(doc) : null;
}
