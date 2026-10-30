// Results workspace: run list, hypotheses, scorecard with the selected row's chart, run compare
// and sweep charts. Reads the run store, the open document and the display units.
import { useEffect, useState, type ReactNode } from 'react';
import type { RunSummary } from '../../domain/types';
import { useDocument } from '../../state/document';
import { MAX_COMPARE, useRuns } from '../../state/runs';
import type { RunEntry } from '../../state/runs';
import { useUi } from '../../state/ui';
import { Compare, type CompareRun } from './Compare';
import { Hypotheses } from './Hypotheses';
import { MeasureChart } from './MeasureChart';
import { Scorecard } from './Scorecard';
import { SweepChart } from './SweepChart';
import './results.css';

const STATUS_WORD: Record<RunEntry['status'], string> = {
  running: 'Running',
  done: 'Done',
  cancelled: 'Cancelled',
  error: 'Failed',
};

function runLabel(summary: RunSummary | undefined, index: number): string {
  return summary?.id ?? `Run ${index + 1}`;
}

function clock(iso: string | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function ResultsWorkspace({ chartWidth = 640 }: { chartWidth?: number }) {
  const doc = useDocument((s) => s.doc);
  const results = useRuns((s) => s.results);
  const order = useRuns((s) => s.order);
  const activeKey = useRuns((s) => s.activeKey);
  const compareKeys = useRuns((s) => s.compareKeys);
  const toggleCompare = useRuns((s) => s.toggleCompare);
  const sweepEntry = useRuns((s) => s.sweep);
  const units = useUi((s) => s.units);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Results is seen, by a link or by browser back and forward: the Build run-done note has done
  // its job (review FR-03, 7.R F-05).
  useEffect(() => useRuns.getState().dismissDoneNote(), []);

  const summaries = new Map((doc?.runs ?? []).map((r) => [r.key, r]));
  // The run store holds every run of the session; Results shows the open vignette's only.
  const ofDoc = (e: RunEntry | undefined): e is RunEntry => e != null && e.docId === doc?.id;
  const entries = order.map((k) => results[k]).filter(ofDoc);
  const labelOf = (e: RunEntry) => runLabel(summaries.get(e.key), entries.indexOf(e));
  const key =
    pickedKey && ofDoc(results[pickedKey])
      ? pickedKey
      : activeKey && ofDoc(results[activeKey])
        ? activeKey
        : (entries[entries.length - 1]?.key ?? null);
  const run = key ? results[key] : undefined;
  const sweep = sweepEntry?.docId === doc?.id ? sweepEntry : null;
  const scores = run?.result?.scores ?? [];
  const rows = run?.result?.rows ?? [];
  const selected = scores.find((s) => s.id === selectedId);
  const hypotheses = doc?.hypotheses ?? [];

  const compareRuns: CompareRun[] = compareKeys
    .map((k) => results[k])
    .filter((e): e is RunEntry => ofDoc(e) && e.result != null)
    .map((e) => ({ key: e.key, label: labelOf(e), scores: e.result!.scores }));

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-surface-0" aria-label="Results">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
        <h1 className="m-0 text-lg font-semibold">Results</h1>
        <Section title="Runs">
          {entries.length === 0 ? (
            <p className="text-sm text-muted">No run yet. Run the vignette from Build.</p>
          ) : (
            <table className="w-full border-collapse text-sm" aria-label="Runs">
              <thead>
                <tr className="border-b border-surface-3 text-left text-xs text-muted">
                  <th className="py-1 pr-2 font-normal">Run</th>
                  <th className="py-1 pr-2 text-right font-normal">n</th>
                  <th className="py-1 pr-2 text-right font-normal">Seed</th>
                  <th className="py-1 pr-2 font-normal">Time</th>
                  <th className="py-1 pr-2 font-normal">Status</th>
                  <th className="py-1 pr-2 font-normal">Note</th>
                  <th className="results-no-print py-1 font-normal">Compare</th>
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map((e) => {
                  const isSel = e.key === key;
                  const inCompare = compareKeys.includes(e.key);
                  return (
                    <tr
                      key={e.key}
                      data-run={labelOf(e)}
                      aria-selected={isSel}
                      tabIndex={0}
                      onClick={() => setPickedKey(e.key)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') setPickedKey(e.key);
                      }}
                      className={`cursor-pointer border-b border-surface-2 outline-none hover:bg-surface-2 focus-visible:bg-surface-2 ${
                        isSel ? 'bg-surface-2 shadow-[inset_2px_0_0_var(--accent)]' : ''
                      }`}
                    >
                      <td className="py-1 pr-2 pl-1 font-mono">{labelOf(e)}</td>
                      <td className="py-1 pr-2 text-right font-mono">{e.n}</td>
                      <td className="py-1 pr-2 text-right font-mono">{e.seed}</td>
                      <td className="py-1 pr-2 font-mono">
                        {clock(summaries.get(e.key)?.createdAt)}
                      </td>
                      <td className="py-1 pr-2">
                        {STATUS_WORD[e.status]}
                        {e.status === 'running' ? ` ${e.progress.done}/${e.progress.total}` : ''}
                      </td>
                      <td className="py-1 pr-2 text-xs text-muted">{e.error ?? e.note ?? ''}</td>
                      <td className="results-no-print py-1" onClick={(ev) => ev.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Compare ${labelOf(e)}`}
                          checked={inCompare}
                          disabled={!e.result || (!inCompare && compareKeys.length >= MAX_COMPARE)}
                          onChange={() => toggleCompare(e.key)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        {run?.result ? (
          <>
            <Section title="Hypotheses">
              <Hypotheses
                hypotheses={hypotheses}
                scores={scores}
                predictions={run.predictions}
                units={units}
              />
            </Section>
            <Section title={`Scorecard, ${labelOf(run)}, n ${run.n}`}>
              <Scorecard
                scores={scores}
                units={units}
                chainTime={doc?.chainTime}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
              {selected ? (
                <MeasureChart
                  score={selected}
                  rows={rows}
                  hypothesis={hypotheses.find((h) => h.measure === selected.id)}
                  units={units}
                  width={chartWidth}
                />
              ) : (
                <p className="text-xs text-muted">Select a scored row to see its chart.</p>
              )}
            </Section>
          </>
        ) : run ? (
          <p className="text-sm text-muted">
            {run.status === 'running'
              ? `Running: ${run.progress.done} of ${run.progress.total} replicates.`
              : (run.error ?? 'This run has no result.')}
          </p>
        ) : null}

        <Section title="Compare">
          <Compare runs={compareRuns} units={units} />
        </Section>

        {sweep ? (
          <Section title="Sweep">
            {sweep.result ? (
              <SweepChart sweep={sweep.result} units={units} width={chartWidth} />
            ) : (
              <p className="text-sm text-muted">
                {sweep.status === 'running'
                  ? 'Sweep running.'
                  : (sweep.error ?? `Sweep ${STATUS_WORD[sweep.status].toLowerCase()}.`)}
              </p>
            )}
          </Section>
        ) : null}
      </div>
    </main>
  );
}
