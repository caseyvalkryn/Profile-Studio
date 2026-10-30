// The scorecard: DroneScore measures grouped by F2T2EA step, then areas 4 and 5 as system
// results. Scored rows come from the run's scores; the step's other measures show muted as
// unscored, collapsed per step behind a quiet "n more measures" toggle. Target has no measures (jiatf-401 section c): it shows the decision time inputs.
import { Fragment, useState } from 'react';
import { MEASURES, STEPS, measureById } from '../../domain/measures';
import type { Measure, SourceClass, Step } from '../../domain/measures';
import type { Evaluation, Score } from '../../engine/score';
import type { Units } from '../../state/ui';
import { Button, Tooltip } from '../../ui';
import {
  EVALUATION_WORD,
  SOURCE_WORD,
  STEP_WORD,
  formatInterval,
  formatThreshold,
  formatValue,
  noValueText,
} from '../shared/units';

export function EvaluationBadge({ evaluation }: { evaluation: Evaluation }) {
  return (
    <span
      className={`results-state-${evaluation} inline-flex items-center gap-1.5 whitespace-nowrap text-text`}
      data-evaluation={evaluation}
    >
      <span className="results-state-dot" aria-hidden />
      {EVALUATION_WORD[evaluation]}
    </span>
  );
}

function notSimulatedReason(m: Measure): string {
  return `Not simulated: needs ${m.collectedBy.toLowerCase()}. ${m.recorded}`;
}

export function SourceChip({
  measure,
  sourceClass,
}: {
  measure?: Measure;
  sourceClass: SourceClass;
}) {
  const chip = (
    <span
      className="inline-block whitespace-nowrap rounded-sm border border-surface-3 px-1.5 text-xs text-muted"
      tabIndex={sourceClass === 'not-simulated' ? 0 : undefined}
    >
      {SOURCE_WORD[sourceClass]}
    </span>
  );
  if (sourceClass === 'not-simulated' && measure)
    return <Tooltip content={notSimulatedReason(measure)}>{chip}</Tooltip>;
  return chip;
}

export type ScorecardProps = {
  scores: Score[];
  units: Units;
  /** Target step inputs, seconds. */
  chainTime?: { decisionS: number; assignS: number };
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const COLS = 7;

export function Scorecard({ scores, units, chainTime, selectedId, onSelect }: ScorecardProps) {
  const byId = new Map(scores.map((s) => [s.id, s]));
  const stepOf = (id: string): Step => measureById(id)?.step ?? 'system';
  const [open, setOpen] = useState<ReadonlySet<Step>>(() => new Set());
  const toggle = (step: Step) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(step)) next.add(step);
      return next;
    });
  return (
    <table className="w-full border-collapse text-sm" aria-label="Scorecard">
      <thead>
        <tr className="border-b border-surface-3 text-left text-xs text-muted">
          <th className="py-1 pr-2 font-normal">ID</th>
          <th className="py-1 pr-2 font-normal">Measure</th>
          <th className="py-1 pr-2 text-right font-normal">Value</th>
          <th className="py-1 pr-2 font-normal">Interval (95 %)</th>
          <th className="py-1 pr-2 font-normal">Threshold</th>
          <th className="py-1 pr-2 font-normal">Evaluation</th>
          <th className="py-1 font-normal">Source</th>
        </tr>
      </thead>
      <tbody>
        {STEPS.map((step) => {
          const scored = scores.filter((s) => stepOf(s.id) === step);
          const unscored = MEASURES.filter((m) => m.step === step && !byId.has(m.id));
          return (
            <Fragment key={step}>
              <tr data-step={step}>
                <th
                  colSpan={COLS}
                  scope="rowgroup"
                  className="pt-3 pb-1 text-left text-xs font-semibold tracking-wide text-text uppercase"
                >
                  {STEP_WORD[step]}
                </th>
              </tr>
              {step === 'target' ? (
                <tr className="text-muted">
                  <td colSpan={COLS} className="py-1 text-xs">
                    No DroneScore measure. Decision time inputs:{' '}
                    <span className="font-mono text-text">
                      decision {chainTime ? chainTime.decisionS : '–'} s
                    </span>
                    ,{' '}
                    <span className="font-mono text-text">
                      assignment {chainTime ? chainTime.assignS : '–'} s
                    </span>
                    .
                  </td>
                </tr>
              ) : null}
              {scored.map((s) => {
                const m = measureById(s.id);
                const selected = s.id === selectedId;
                const greyed = s.sourceClass === 'not-simulated';
                return (
                  <tr
                    key={s.id}
                    data-measure={s.id}
                    aria-selected={selected}
                    tabIndex={0}
                    onClick={() => onSelect(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(s.id);
                      }
                    }}
                    className={`cursor-pointer border-b border-surface-2 outline-none hover:bg-surface-2 focus-visible:bg-surface-2 ${
                      selected ? 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]' : ''
                    } ${greyed ? 'text-muted' : ''}`}
                  >
                    <td className="py-1 pr-2 pl-1 font-mono">{s.id}</td>
                    <td className="py-1 pr-2">{m?.name ?? s.id}</td>
                    {s.value == null ? (
                      <td colSpan={2} className="py-1 pr-2 text-xs text-muted" data-testid="note">
                        {noValueText(s)}
                      </td>
                    ) : (
                      <>
                        <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">
                          {formatValue(units, s.id, s.value, s.interval)}
                        </td>
                        <td className="py-1 pr-2 font-mono whitespace-nowrap">
                          {s.interval ? formatInterval(units, s.id, s.interval, s.value) : '–'}
                        </td>
                      </>
                    )}
                    <td className="py-1 pr-2 font-mono whitespace-nowrap">
                      {formatThreshold(units, s)}
                    </td>
                    <td className="py-1 pr-2">
                      <EvaluationBadge evaluation={s.evaluation} />
                    </td>
                    <td className="py-1">
                      <SourceChip measure={m} sourceClass={s.sourceClass} />
                    </td>
                  </tr>
                );
              })}
              {unscored.length > 0 ? (
                <tr className="results-no-print" data-unscored-toggle={step}>
                  <td colSpan={COLS} className="py-0.5 pl-1">
                    <Button
                      size="sm"
                      variant="quiet"
                      aria-expanded={open.has(step)}
                      onClick={() => toggle(step)}
                      className="text-xs text-muted"
                    >
                      {open.has(step)
                        ? 'Hide unscored measures'
                        : `${unscored.length} more ${unscored.length === 1 ? 'measure' : 'measures'}`}
                    </Button>
                  </td>
                </tr>
              ) : null}
              {(open.has(step) ? unscored : []).map((m) => (
                <tr
                  key={m.id}
                  data-measure={m.id}
                  data-unscored
                  className="border-b border-surface-2 text-muted opacity-70"
                >
                  <td className="py-0.5 pr-2 pl-1 font-mono">{m.id}</td>
                  <td className="py-0.5 pr-2">{m.name}</td>
                  <td colSpan={4} className="py-0.5 pr-2 text-xs">
                    Not scored in this vignette
                  </td>
                  <td className="py-0.5">
                    <SourceChip measure={m} sourceClass={m.sourceClass} />
                  </td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
