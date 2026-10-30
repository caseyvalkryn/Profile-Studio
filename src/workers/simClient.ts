// Typed client for sim.worker.ts. One worker per call; it ends when the call settles or is
// cancelled.
import type { Vignette } from '../domain/types';
import type { Progress, RunResult } from '../engine/run';
import type { Score } from '../engine/score';
import type { Factor, Sweep } from '../engine/sweep';
import type { SimRequest, SimResponse } from './sim.worker';

export type RunInWorker = RunResult & { scores: Score[] };

/**
 * A worker call. Awaitable directly (it is the promise) and as `handle.promise`; `cancel()`
 * terminates the worker and rejects the promise with a `CancelledError`.
 */
export type WorkerHandle<T> = Promise<T> & { promise: Promise<T>; cancel(): void };

export class CancelledError extends Error {
  constructor() {
    super('sim worker cancelled');
    this.name = 'CancelledError';
  }
}

function spawn(): Worker {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
}

function call<T>(
  req: SimRequest,
  onDone: (m: Extract<SimResponse, { type: 'done' }>) => T,
  onProgress?: Progress,
): WorkerHandle<T> {
  let cancel: () => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    const w = spawn();
    let settled = false;
    const finish = () => {
      settled = true;
      w.terminate();
    };
    cancel = () => {
      if (settled) return;
      finish();
      reject(new CancelledError());
    };
    w.onmessage = (ev: MessageEvent<SimResponse>) => {
      const m = ev.data;
      if (m.type === 'progress') onProgress?.(m.done, m.total);
      else if (m.type === 'done') {
        finish();
        try {
          resolve(onDone(m));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      } else {
        finish();
        reject(new Error(m.message));
      }
    };
    w.onerror = (ev) => {
      finish();
      reject(new Error(ev.message || 'sim worker failed'));
    };
    // A reply that fails structured cloning never reaches onmessage; settle instead of hanging.
    w.onmessageerror = () => {
      finish();
      reject(new Error('sim worker reply could not be deserialised'));
    };
    w.postMessage(req);
  });
  const handle = promise as WorkerHandle<T>;
  handle.promise = promise;
  handle.cancel = () => cancel();
  return handle;
}

/** Run with a cancel handle. `runInWorker` is the same call typed as a plain promise. */
export function startRun(
  v: Vignette,
  n: number,
  seed: number,
  onProgress?: Progress,
): WorkerHandle<RunInWorker> {
  return call(
    { type: 'run', vignette: v, n, seed },
    (m) => {
      if (!('rows' in m)) throw new Error('sim worker: run returned no rows');
      return { rows: m.rows, trace: m.trace, scores: m.scores };
    },
    onProgress,
  );
}

/** Sweep with a cancel handle. `sweepInWorker` is the same call typed as a plain promise. */
export function startSweep(
  v: Vignette,
  factors: Factor[],
  n: number,
  seed: number,
): WorkerHandle<Sweep> {
  return call({ type: 'sweep', vignette: v, factors, n, seed }, (m) => {
    if (!('sweep' in m)) throw new Error('sim worker: sweep returned no cells');
    return m.sweep;
  });
}

/** Plain-promise form kept for callers that await; the value is in fact a `WorkerHandle`. */
export function runInWorker(
  v: Vignette,
  n: number,
  seed: number,
  onProgress?: Progress,
): Promise<RunInWorker> {
  return startRun(v, n, seed, onProgress);
}

/** Plain-promise form kept for callers that await; the value is in fact a `WorkerHandle`. */
export function sweepInWorker(
  v: Vignette,
  factors: Factor[],
  n: number,
  seed: number,
): Promise<Sweep> {
  return startSweep(v, factors, n, seed);
}
