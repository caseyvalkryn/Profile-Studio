// Runs in the sim worker. A finished run is stored in memory and appended to the document as a
// RunSummary. At run start every hypothesis with a prediction is locked and its prediction is
// snapshotted into the RunEntry. The lock and the RunSummary are system edits
// (`useDocument.apply`), outside undo history, so undo can neither unlock a prediction nor remove
// a run. Cancel terminates the worker through its `WorkerHandle`; a `CancelledError` ends the
// entry as `cancelled`, never `error`.
import { create } from 'zustand';
import { newKey } from '../domain/ids';
import type { Hypothesis, RunSummary } from '../domain/types';
import type { Factor, Sweep } from '../engine/sweep';
import {
  CancelledError,
  startRun as startRunInWorker,
  startSweep as startSweepInWorker,
  type RunInWorker,
  type WorkerHandle,
} from '../workers/simClient';
import { useDocument } from './document';

/** Result sets kept in memory. Older ones drop, except those in compareKeys. */
export const KEEP_RESULTS = 8;
/** Runs compared side by side (spec section 7, Results). */
export const MAX_COMPARE = 4;

export type RunStatus = 'running' | 'done' | 'cancelled' | 'error';
export type RunProgress = { done: number; total: number };

/** A hypothesis prediction as it stood at run start. Results evaluate against this. */
export type PredictionSnapshot = {
  /** Hypothesis key. */
  hypothesis: string;
  measure: string;
  op: Hypothesis['op'];
  value: number;
  low: number;
  high: number;
};

/** Shown in RunEntry.error when the worker fails. The raw text goes to RunEntry.detail. */
export const RUN_FAILED = 'The simulation failed. Try again or reduce the replicate count.';
export const EDITED_DURING_RUN = 'Vignette edited during the run';
export const CLOSED_DURING_RUN = 'Vignette closed during the run. The result was not stored.';

export type RunEntry = {
  key: string;
  n: number;
  seed: number;
  status: RunStatus;
  progress: RunProgress;
  result: RunInWorker | null;
  /** A sentence for the user. */
  error: string | null;
  /** The raw worker error, for the console and bug reports. */
  detail: string | null;
  /** Predictions locked at run start. */
  predictions: PredictionSnapshot[];
  /** The vignette the run scored: its id and its `updated` stamp at run start. */
  docId: string;
  docUpdated: string;
  /** Set when the vignette changed or closed while the run was in flight. */
  note: string | null;
};

export type SweepEntry = {
  key: string;
  factors: Factor[];
  status: RunStatus;
  result: Sweep | null;
  error: string | null;
};

export type RunsState = {
  /** By run key. The key is also the RunSummary key in the document. */
  results: Record<string, RunEntry>;
  /** Run keys, oldest first. */
  order: string[];
  activeKey: string | null;
  compareKeys: string[];
  sweep: SweepEntry | null;
  /** The worker of the run in flight, so cancel can stop it. */
  runHandle: WorkerHandle<RunInWorker> | null;
  /** The worker of the sweep in flight. */
  sweepHandle: WorkerHandle<Sweep> | null;
  /** Starts a run on the open document. Resolves to the run key, or null if none started. */
  startRun: (n: number, seed: number) => Promise<string | null>;
  /** Stops the active run: terminates its worker and marks it cancelled. */
  cancel: () => void;
  startSweep: (factors: Factor[], n: number, seed: number) => Promise<string | null>;
  cancelSweep: () => void;
  setCompare: (keys: string[]) => void;
  toggleCompare: (key: string) => void;
};

function runId(existing: readonly RunSummary[]): string {
  const used = new Set(existing.map((r) => r.id));
  let i = 1;
  while (used.has(`R-${i}`)) i++;
  return `R-${i}`;
}

export const useRuns = create<RunsState>()((set, get) => {
  const patch = (key: string, p: Partial<RunEntry>) =>
    set((s) => {
      const e = s.results[key];
      return e ? { results: { ...s.results, [key]: { ...e, ...p } } } : {};
    });

  const prune = () =>
    set((s) => {
      const keep = new Set(s.compareKeys);
      if (s.activeKey) keep.add(s.activeKey);
      const order = [...s.order];
      const results = { ...s.results };
      let extra = order.length - KEEP_RESULTS;
      for (let i = 0; i < order.length && extra > 0;) {
        const k = order[i] as string;
        if (keep.has(k)) {
          i++;
          continue;
        }
        order.splice(i, 1);
        delete results[k];
        extra--;
      }
      return { order, results };
    });

  return {
    results: {},
    order: [],
    activeKey: null,
    compareKeys: [],
    sweep: null,
    runHandle: null,
    sweepHandle: null,

    startRun: async (n, seed) => {
      if (isRunning(get())) return null; // one run at a time (review N-01)
      const docStore = useDocument.getState();
      const before = docStore.doc;
      if (!before) return null;
      const predictions: PredictionSnapshot[] = before.hypotheses.flatMap((h) =>
        h.prediction
          ? [
              {
                hypothesis: h.key,
                measure: h.measure,
                op: h.op,
                value: h.value,
                low: h.prediction.low,
                high: h.prediction.high,
              },
            ]
          : [],
      );
      const at = new Date().toISOString();
      docStore.apply('Lock predictions', (d) => {
        for (const h of d.hypotheses) if (h.prediction && !h.lockedAt) h.lockedAt = at;
      });
      // The run scores this snapshot, and its result is stored against the snapshot's id.
      const doc = useDocument.getState().doc;
      if (!doc) return null;
      const key = newKey();
      const entry: RunEntry = {
        key,
        n,
        seed,
        status: 'running',
        progress: { done: 0, total: n },
        result: null,
        error: null,
        detail: null,
        predictions,
        docId: doc.id,
        docUpdated: doc.updated,
        note: null,
      };
      set((s) => ({
        results: { ...s.results, [key]: entry },
        order: [...s.order, key],
        activeKey: key,
      }));
      prune();
      const live = () => get().results[key]?.status === 'running';
      const handle = startRunInWorker(doc, n, seed, (done, total) => {
        if (live()) patch(key, { progress: { done, total } });
      });
      set({ runHandle: handle });
      try {
        const result = await handle;
        if (!live()) return key;
        const now = useDocument.getState().doc;
        const note =
          now?.id !== doc.id
            ? CLOSED_DURING_RUN
            : now !== doc // any change replaces the reference; `updated` can repeat within 1 ms
              ? EDITED_DURING_RUN
              : null;
        patch(key, { status: 'done', result, progress: { done: n, total: n }, note });
        if (now?.id !== doc.id) return key;
        useDocument.getState().apply('Run', (d) => {
          const summary: RunSummary = {
            key,
            id: runId(d.runs),
            createdAt: new Date().toISOString(),
            n,
            seed,
            rows: result.rows,
            predictions: predictions.map((p) => ({
              hypothesis: p.hypothesis,
              low: p.low,
              high: p.high,
            })),
            ...(note ? { note } : {}),
          };
          d.runs.unshift(summary); // newest first
        });
      } catch (err) {
        if (!live()) return key;
        if (err instanceof CancelledError) patch(key, { status: 'cancelled' });
        else
          patch(key, {
            status: 'error',
            error: RUN_FAILED,
            detail: err instanceof Error ? err.message : String(err),
          });
      } finally {
        if (get().runHandle === handle) set({ runHandle: null });
      }
      return key;
    },

    cancel: () => {
      const key = get().activeKey;
      if (key && get().results[key]?.status === 'running') patch(key, { status: 'cancelled' });
      get().runHandle?.cancel();
    },

    startSweep: async (factors, n, seed) => {
      const doc = useDocument.getState().doc;
      if (!doc) return null;
      const key = newKey();
      set({ sweep: { key, factors, status: 'running', result: null, error: null } });
      const live = () => get().sweep?.key === key && get().sweep?.status === 'running';
      const handle = startSweepInWorker(doc, factors, n, seed);
      set({ sweepHandle: handle });
      try {
        const result = await handle;
        if (live()) set((s) => (s.sweep ? { sweep: { ...s.sweep, status: 'done', result } } : {}));
      } catch (err) {
        if (live())
          set((s) =>
            !s.sweep
              ? {}
              : err instanceof CancelledError
                ? { sweep: { ...s.sweep, status: 'cancelled' } }
                : { sweep: { ...s.sweep, status: 'error', error: (err as Error).message } },
          );
      } finally {
        if (get().sweepHandle === handle) set({ sweepHandle: null });
      }
      return key;
    },

    cancelSweep: () => {
      set((s) =>
        s.sweep?.status === 'running' ? { sweep: { ...s.sweep, status: 'cancelled' } } : {},
      );
      get().sweepHandle?.cancel();
    },

    setCompare: (keys) => set({ compareKeys: keys.slice(0, MAX_COMPARE) }),

    toggleCompare: (key) =>
      set((s) => {
        if (s.compareKeys.includes(key))
          return { compareKeys: s.compareKeys.filter((k) => k !== key) };
        if (s.compareKeys.length >= MAX_COMPARE) return {};
        return { compareKeys: [...s.compareKeys, key] };
      }),
  };
});

export function useRun(key: string | null | undefined): RunEntry | undefined {
  return useRuns((s) => (key ? s.results[key] : undefined));
}

export function useActiveRun(): RunEntry | undefined {
  return useRuns((s) => (s.activeKey ? s.results[s.activeKey] : undefined));
}

export function isRunning(s: RunsState = useRuns.getState()): boolean {
  return s.activeKey != null && s.results[s.activeKey]?.status === 'running';
}
