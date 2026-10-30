// Typed client for sim.worker.ts. One worker per call; it ends when the call settles.
import type { Vignette } from '../domain/types';
import type { Progress, RunResult } from '../engine/run';
import type { Score } from '../engine/score';
import type { Factor, Sweep } from '../engine/sweep';
import type { SimRequest, SimResponse } from './sim.worker';

export type RunInWorker = RunResult & { scores: Score[] };

function spawn(): Worker {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
}

function call<T>(
  req: SimRequest,
  onDone: (m: Extract<SimResponse, { type: 'done' }>) => T,
  onProgress?: Progress,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const w = spawn();
    const finish = () => w.terminate();
    w.onmessage = (ev: MessageEvent<SimResponse>) => {
      const m = ev.data;
      if (m.type === 'progress') onProgress?.(m.done, m.total);
      else if (m.type === 'done') {
        finish();
        resolve(onDone(m));
      } else {
        finish();
        reject(new Error(m.message));
      }
    };
    w.onerror = (ev) => {
      finish();
      reject(new Error(ev.message || 'sim worker failed'));
    };
    w.postMessage(req);
  });
}

export function runInWorker(
  v: Vignette,
  n: number,
  seed: number,
  onProgress?: Progress,
): Promise<RunInWorker> {
  return call(
    { type: 'run', vignette: v, n, seed },
    (m) => {
      if (!('rows' in m)) throw new Error('sim worker: run returned no rows');
      return { rows: m.rows, trace: m.trace, scores: m.scores };
    },
    onProgress,
  );
}

export function sweepInWorker(
  v: Vignette,
  factors: Factor[],
  n: number,
  seed: number,
): Promise<Sweep> {
  return call({ type: 'sweep', vignette: v, factors, n, seed }, (m) => {
    if (!('sweep' in m)) throw new Error('sim worker: sweep returned no cells');
    return m.sweep;
  });
}
