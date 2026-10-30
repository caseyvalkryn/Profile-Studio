// Results test data: a real run of the engine test vignette at a fixed seed. Not a test file.
import type { Hypothesis, Vignette } from '../../domain/types';
import { run } from '../../engine/run';
import { enteredValues, score } from '../../engine/score';
import type { Score } from '../../engine/score';
import { testVignette } from '../../engine/testVignette';
import type { RunEntry } from '../../state/runs';

export const N = 20;

export function hypothesis(over: Partial<Hypothesis> = {}): Hypothesis {
  return {
    key: 'k-H-01',
    id: 'H-01',
    question: 'k-Q-01',
    measure: '1.1.1',
    op: '>=',
    value: 10,
    prediction: { low: 50, high: 100 },
    lockedAt: '2026-10-30T12:00:00Z',
    ...over,
  };
}

export function resultsVignette(): Vignette {
  const base = testVignette();
  return {
    ...base,
    hypotheses: [hypothesis()],
    measures: [
      ...base.measures,
      { id: '1.2.1', op: '>=', threshold: 80, unit: '%' },
      { id: '2.1.4', op: '<=', threshold: 5, unit: '%' },
      { id: '4.2.1', op: '>=', threshold: 60, unit: 'min' },
    ],
  };
}

export function entry(key: string, v: Vignette, seed: number, scoresOverride?: Score[]): RunEntry {
  const r = run(v, N, seed);
  const scores = scoresOverride ?? score(r.rows, v.measures, { seed, entered: enteredValues(v) });
  return {
    key,
    n: N,
    seed,
    status: 'done',
    progress: { done: N, total: N },
    result: { ...r, scores },
    error: null,
    detail: null,
    predictions: v.hypotheses.flatMap((h) =>
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
    ),
    docId: v.id,
    docUpdated: v.updated,
    note: null,
  };
}
