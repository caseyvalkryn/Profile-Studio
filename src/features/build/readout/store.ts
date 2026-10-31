// The readout baseline (legacy `ui.baseline` and `ui.ghost.before`).
//
// API, for lane 9.2.5 (board interactions) and anyone else:
//   pin(record?, label?)     Pin a baseline. Default: the open document, labelled with the local
//                            time as hh:mm (legacy "vs pinned 14:05"). The readout then shows
//                            deltas against it until clear().
//   clear()                  Drop the pinned baseline.
//   setDragBaseline(record)  Call with the pre-drag record when a drag starts and with null when it
//                            ends or is cancelled. While set, the readout shows deltas against it
//                            in place of the pinned baseline. When nothing calls it, the readout
//                            falls back to `useDocument.getState().drag?.base`.
// A record is a whole Vignette; the readout evaluates it through the same source as the document.
import { create } from 'zustand';
import type { Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';

export type Baseline = { record: Vignette; label: string };

type ReadoutStore = {
  pinned: Baseline | null;
  dragBase: Vignette | null;
  pin: (record?: Vignette, label?: string) => void;
  clear: () => void;
  setDragBaseline: (record: Vignette | null) => void;
};

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const useReadout = create<ReadoutStore>()((set) => ({
  pinned: null,
  dragBase: null,
  pin: (record, label) => {
    const r = record ?? useDocument.getState().doc;
    if (r) set({ pinned: { record: r, label: label ?? hhmm(new Date()) } });
  },
  clear: () => set({ pinned: null }),
  setDragBaseline: (dragBase) => set({ dragBase }),
}));

export const pin = (record?: Vignette, label?: string) => useReadout.getState().pin(record, label);
export const setDragBaseline = (record: Vignette | null) =>
  useReadout.getState().setDragBaseline(record);
