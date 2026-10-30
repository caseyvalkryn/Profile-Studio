/// <reference lib="webworker" />
// Module Web Worker. All logic lives in src/engine; this file only relays messages.
import type { Vignette } from '../domain/types';
import { run } from '../engine/run';
import type { RunResult } from '../engine/run';
import { enteredValues, score } from '../engine/score';
import type { Score } from '../engine/score';
import { sweep } from '../engine/sweep';
import type { Factor, Sweep } from '../engine/sweep';

export type SimRequest =
  | { type: 'run'; vignette: Vignette; n: number; seed: number }
  | { type: 'sweep'; vignette: Vignette; factors: Factor[]; n: number; seed: number };

export type SimResponse =
  | { type: 'progress'; done: number; total: number }
  | ({ type: 'done' } & RunResult & { scores: Score[] })
  | { type: 'done'; sweep: Sweep }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(m: SimResponse): void {
  ctx.postMessage(m);
}

ctx.onmessage = (ev: MessageEvent<SimRequest>) => {
  const req = ev.data;
  try {
    if (req.type === 'run') {
      const { rows, trace } = run(req.vignette, req.n, req.seed, (done, total) =>
        post({ type: 'progress', done, total }),
      );
      post({
        type: 'done',
        rows,
        trace,
        scores: score(rows, req.vignette.measures, {
          seed: req.seed,
          entered: enteredValues(req.vignette),
        }),
      });
    } else if (req.type === 'sweep') {
      post({ type: 'done', sweep: sweep(req.vignette, req.factors, req.n, req.seed) });
    } else {
      post({
        type: 'error',
        message: `unknown request ${String((req as { type: unknown }).type)}`,
      });
    }
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
