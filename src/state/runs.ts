// Runs in the sim worker. A finished run is stored in memory and appended to the document as a
// RunSummary (one undo step, 'Run'). The first run locks every hypothesis with a prediction.
import { create } from 'zustand';
import { newKey } from '../domain/ids';
import type { RunSummary } from '../domain/types';
import type { Factor, Sweep } from '../engine/sweep';
import { runInWorker, sweepInWorker, type RunInWorker } from '../workers/simClient';
import { useDocument } from './document';

/** Result sets kept in memory. Older ones drop, except those in compareKeys. */
export const KEEP_RESULTS = 8;
/** Runs compared side by side (spec section 7, Results). */
export const MAX_COMPARE = 4;

export type RunStatus = 'running' | 'done' | 'cancelled' | 'error';
export type RunProgress = { done: number; total: number };

export type RunEntry = {
  key: string;
  n: number;
  seed: number;
  status: RunStatus;
  progress: RunProgress;
  result: RunInWorker | null;
  error: string | null;
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
  /** Starts a run on the open document. Resolves to the run key, or null if none started. */
  startRun: (n: number, seed: number) => Promise<string | null>;
  /** Stops waiting for the active run. Its result, when it arrives, is dropped. */
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

    startRun: async (n, seed) => {
      const docStore = useDocument.getState();
      if (!docStore.doc) return null;
      if (docStore.doc.runs.length === 0) {
        const at = new Date().toISOString();
        docStore.edit('Lock predictions', (d) => {
          for (const h of d.hypotheses) if (h.prediction && !h.lockedAt) h.lockedAt = at;
        });
      }
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
      };
      set((s) => ({
        results: { ...s.results, [key]: entry },
        order: [...s.order, key],
        activeKey: key,
      }));
      prune();
      const live = () => get().results[key]?.status === 'running';
      try {
        const result = await runInWorker(doc, n, seed, (done, total) => {
          if (live()) patch(key, { progress: { done, total } });
        });
        if (!live()) return key;
        patch(key, { status: 'done', result, progress: { done: n, total: n } });
        useDocument.getState().edit('Run', (d) => {
          const summary: RunSummary = {
            key,
            id: runId(d.runs),
            createdAt: new Date().toISOString(),
            n,
            seed,
            rows: result.rows,
          };
          d.runs.unshift(summary); // newest first
        });
      } catch (err) {
        if (live()) patch(key, { status: 'error', error: (err as Error).message });
      }
      return key;
    },

    cancel: () => {
      const key = get().activeKey;
      if (key && get().results[key]?.status === 'running') patch(key, { status: 'cancelled' });
    },

    startSweep: async (factors, n, seed) => {
      const doc = useDocument.getState().doc;
      if (!doc) return null;
      const key = newKey();
      set({ sweep: { key, factors, status: 'running', result: null, error: null } });
      const live = () => get().sweep?.key === key && get().sweep?.status === 'running';
      try {
        const result = await sweepInWorker(doc, factors, n, seed);
        if (live()) set((s) => (s.sweep ? { sweep: { ...s.sweep, status: 'done', result } } : {}));
      } catch (err) {
        if (live())
          set((s) =>
            s.sweep
              ? { sweep: { ...s.sweep, status: 'error', error: (err as Error).message } }
              : {},
          );
      }
      return key;
    },

    cancelSweep: () =>
      set((s) =>
        s.sweep?.status === 'running' ? { sweep: { ...s.sweep, status: 'cancelled' } } : {},
      ),

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
