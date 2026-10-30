// Hypotheses above the scorecard (spec acceptance 12.5): each H-nn with its measure, the
// prediction range, the lock time and the evaluation of its measure in this run.
import { measureById } from '../../domain/measures';
import type { Hypothesis } from '../../domain/types';
import { evaluate } from '../../engine/score';
import type { Evaluation, Score } from '../../engine/score';
import type { PredictionSnapshot } from '../../state/runs';
import type { Units } from '../../state/ui';
import { EvaluationBadge } from './Scorecard';
import { OP_TEXT, formatInterval, formatValue, utc } from '../shared/units';

export type HypothesisResult = {
  evaluation: Evaluation | null;
  /** True when the evaluation used the prediction locked at this run's start. */
  locked: boolean;
  /** Whether the measured value falls inside the predicted range. */
  insidePrediction: boolean | null;
};

/** The hypothesis evaluated against the run: the snapshot when one exists, else the live one. */
export function hypothesisResult(
  h: Hypothesis,
  scores: Score[],
  predictions: PredictionSnapshot[],
): HypothesisResult {
  const snap = predictions.find((p) => p.hypothesis === h.key);
  const sc = scores.find((s) => s.id === (snap?.measure ?? h.measure));
  if (!sc) return { evaluation: null, locked: snap != null, insidePrediction: null };
  const op = snap?.op ?? h.op;
  const value = snap?.value ?? h.value;
  const evaluation = sc.interval ? evaluate(sc.interval, op, value) : 'inconclusive';
  const range = snap ? { low: snap.low, high: snap.high } : h.prediction;
  const insidePrediction =
    range && sc.value != null ? sc.value >= range.low && sc.value <= range.high : null;
  return { evaluation, locked: snap != null, insidePrediction };
}

export function Hypotheses({
  hypotheses,
  scores,
  predictions,
  units,
}: {
  hypotheses: Hypothesis[];
  scores: Score[];
  predictions: PredictionSnapshot[];
  units: Units;
}) {
  if (hypotheses.length === 0)
    return <p className="text-sm text-muted">No hypothesis stated for this vignette.</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Hypotheses">
      {hypotheses.map((h) => {
        // The statement and prediction as locked for this run (review 6 F-12), else the live ones.
        const snap = predictions.find((p) => p.hypothesis === h.key);
        const measure = snap?.measure ?? h.measure;
        const op = snap?.op ?? h.op;
        const value = snap?.value ?? h.value;
        const prediction = snap ? { low: snap.low, high: snap.high } : h.prediction;
        const m = measureById(measure);
        const r = hypothesisResult(h, scores, predictions);
        return (
          <li
            key={h.key}
            data-hypothesis={h.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-surface-2 py-1 text-sm"
          >
            <span className="font-mono font-semibold">{h.id}</span>
            <span>
              <span className="font-mono">{measure}</span> {m?.name ?? ''}{' '}
              <span className="font-mono">
                {OP_TEXT[op]} {formatValue(units, measure, value)}
              </span>
            </span>
            <span className="text-xs text-muted">
              Prediction{' '}
              <span className="font-mono">
                {prediction ? formatInterval(units, measure, prediction) : 'none'}
              </span>
              {r.insidePrediction == null
                ? ''
                : r.insidePrediction
                  ? ', result inside'
                  : ', result outside'}
            </span>
            <span className="text-xs text-muted">
              {h.lockedAt ? `Locked ${utc(h.lockedAt)}` : 'Not locked'}
              {h.lockedAt && !r.locked ? ' (after this run)' : ''}
            </span>
            <span className="ml-auto">
              {r.evaluation ? (
                <EvaluationBadge evaluation={r.evaluation} />
              ) : (
                <span className="text-xs text-muted">Not scored in this run</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
