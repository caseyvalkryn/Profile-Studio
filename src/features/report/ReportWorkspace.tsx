// The AAR composer (spec section 7, Report). Seven sections in fixed order (principle 6.3), each
// with a user note. Read-only toward hypotheses: a locked prediction is shown, never edited.
import { Fragment, useMemo, type ReactNode } from 'react';
import { measureById, STEPS, type SourceClass, type Step } from '../../domain/measures';
import type { RunRow, Vignette } from '../../domain/types';
import { score, scoreOne, type Evaluation, type Score } from '../../engine/score';
import { useDocument } from '../../state/document';
import { useActiveRun, type PredictionSnapshot } from '../../state/runs';
import { useUi, type Units } from '../../state/ui';
import { Button } from '../../ui';
import {
  pickedCharts,
  sectionNote,
  SECTIONS,
  setPickedCharts,
  setSectionNote,
  type SectionId,
} from './draft';
import { downloadText, fileName, rowsToCsv, vignetteJson } from './export';
import { factorLine, factorRows, type FactorRow } from './factors';
import { measureValue, utc, type Shown } from './format';
import './report.css';

export type ReportWorkspaceProps = {
  /** Renders one picked chart. The wiring step passes the results chart here. */
  renderChart?: (measureId: string, runKey: string) => ReactNode;
  /** Renders the map snapshot in Setup. A quiet placeholder box shows without it. */
  renderMap?: () => ReactNode;
};

export const NO_RUN = 'No run yet. The prediction locks at the first run.';
export const SCOPE_LEAD = 'This result applies to the conditions tested:';

const STEP_LABEL: Record<Step, string> = {
  find: 'Find',
  fix: 'Fix',
  track: 'Track',
  target: 'Target',
  engage: 'Engage',
  assess: 'Assess',
  system: 'System',
};

const EVALUATION_LABEL: Record<Evaluation, string> = {
  meets: 'Meets',
  'does-not-meet': 'Does not meet',
  inconclusive: 'Inconclusive',
};

const SOURCE_LABEL: Record<SourceClass, string> = {
  simulated: 'Simulated',
  entered: 'Entered',
  derived: 'Derived',
  'not-simulated': 'Not simulated',
};

/** The run the report states: the active run of this vignette, else the newest stored run. */
type ReportRun = {
  key: string;
  n: number;
  seed: number;
  rows: RunRow[];
  predictions: PredictionSnapshot[];
};

function useReportRun(doc: Vignette | null): ReportRun | null {
  const active = useActiveRun();
  return useMemo(() => {
    if (!doc) return null;
    if (active && active.status === 'done' && active.result && active.docId === doc.id)
      return {
        key: active.key,
        n: active.n,
        seed: active.seed,
        rows: active.result.rows,
        predictions: active.predictions,
      };
    const stored = doc.runs[0];
    if (!stored) return null;
    // A stored run has no snapshot in memory. A locked prediction cannot change after the lock,
    // so the locked hypotheses stand for the snapshot.
    const predictions: PredictionSnapshot[] = doc.hypotheses.flatMap((h) =>
      h.prediction && h.lockedAt
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
    return { key: stored.key, n: stored.n, seed: stored.seed, rows: stored.rows, predictions };
  }, [doc, active]);
}

function Num({ s }: { s: Shown }) {
  return (
    <span className="font-mono">
      {s.value}
      {s.unit ? ` ${s.unit}` : ''}
    </span>
  );
}

function canonicalUnit(id: string, fallback: string): string {
  return measureById(id)?.unit ?? fallback;
}

/** Threshold in the setting's unit; an empty unit is the measure's own. */
function thresholdShown(s: Score, units: Units): Shown {
  return measureValue(s.threshold, s.unit || canonicalUnit(s.id, ''), units);
}

function intervalText(s: Score, units: Units): string {
  if (!s.interval) return '';
  const u = canonicalUnit(s.id, s.unit);
  const lo = measureValue(s.interval.low, u, units);
  const hi = measureValue(s.interval.high, u, units);
  return `${lo.value} to ${hi.value} ${hi.unit}`.trim();
}

function SectionNote({ id, title, note }: { id: SectionId; title: string; note: string }) {
  const edit = useDocument((s) => s.edit);
  return (
    <div className="report-note mt-3">
      <label className="report-noprint block text-xs text-muted" htmlFor={`note-${id}`}>
        Note
      </label>
      <textarea
        id={`note-${id}`}
        key={note}
        aria-label={`Note: ${title}`}
        defaultValue={note}
        rows={id === 'next' ? 4 : 2}
        placeholder={id === 'next' ? 'State the next test and the conditions it adds.' : ''}
        className="report-noprint w-full rounded-sm border border-surface-3 bg-surface-1 p-2 text-sm text-text"
        onBlur={(e) => {
          const value = e.currentTarget.value;
          if (value === note) return;
          edit('Edit report note', (d) => setSectionNote(d, id, value));
        }}
      />
      {note ? <p className="report-print-only whitespace-pre-wrap text-sm">{note}</p> : null}
    </div>
  );
}

function Section({
  n,
  id,
  title,
  note,
  children,
}: {
  n: number;
  id: SectionId;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section mb-8" aria-labelledby={`report-${id}`} data-section={id}>
      <h2 id={`report-${id}`} className="mb-2 text-base font-semibold">
        {n}. {title}
      </h2>
      {children}
      <SectionNote id={id} title={title} note={note} />
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function FactorTable({ rows }: { rows: FactorRow[] }) {
  return (
    <table className="report-table w-full text-sm">
      <thead>
        <tr>
          <th scope="col">Factor</th>
          <th scope="col">ID</th>
          <th scope="col">Type</th>
          <th scope="col">Setting</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.factor}</td>
            <td className="font-mono">{r.id}</td>
            <td>{r.type}</td>
            <td className="font-mono">{r.setting}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Scorecard({ doc, scores, units }: { doc: Vignette; scores: Score[]; units: Units }) {
  const groups = STEPS.map((step) => ({
    step,
    scores: scores.filter((s) => (measureById(s.id)?.step ?? 'system') === step),
  }));
  return (
    <table className="report-table w-full text-sm" aria-label="Scorecard">
      <thead>
        <tr>
          <th scope="col">ID</th>
          <th scope="col">Name</th>
          <th scope="col">Value</th>
          <th scope="col">Interval</th>
          <th scope="col">Threshold</th>
          <th scope="col">Evaluation</th>
          <th scope="col">Source class</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(({ step, scores: rows }) => {
          if (step === 'target')
            return (
              <Fragment key={step}>
                <tr className="report-group">
                  <th colSpan={7} scope="rowgroup">
                    Target
                  </th>
                </tr>
                <tr>
                  <td colSpan={7} className="text-muted">
                    No DroneScore measure. Decision time{' '}
                    <span className="font-mono">{doc.chainTime.decisionS} s</span>, assignment time{' '}
                    <span className="font-mono">{doc.chainTime.assignS} s</span>.
                  </td>
                </tr>
              </Fragment>
            );
          if (rows.length === 0) return null;
          return (
            <Fragment key={step}>
              <tr className="report-group">
                <th colSpan={7} scope="rowgroup">
                  {STEP_LABEL[step]}
                </th>
              </tr>
              {rows.map((s) => {
                const m = measureById(s.id);
                return (
                  <tr key={s.id}>
                    <td className="font-mono">{s.id}</td>
                    <td>{m?.name ?? s.id}</td>
                    <td>
                      {s.value == null ? (
                        <span className="text-muted">No value</span>
                      ) : (
                        <Num s={measureValue(s.value, m?.unit ?? s.unit, units)} />
                      )}
                    </td>
                    <td className="font-mono">{intervalText(s, units)}</td>
                    <td>
                      <span className="font-mono">{s.op} </span>
                      <Num s={thresholdShown(s, units)} />
                    </td>
                    <td>{EVALUATION_LABEL[s.evaluation]}</td>
                    <td>{SOURCE_LABEL[s.sourceClass]}</td>
                  </tr>
                );
              })}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function predictionText(p: { low: number; high: number }, measure: string, units: Units): string {
  const u = canonicalUnit(measure, '');
  const lo = measureValue(p.low, u, units);
  const hi = measureValue(p.high, u, units);
  return `${lo.value} to ${hi.value} ${hi.unit}`.trim();
}

export default function ReportWorkspace({ renderChart, renderMap }: ReportWorkspaceProps) {
  const doc = useDocument((s) => s.doc);
  const edit = useDocument((s) => s.edit);
  const units = useUi((s) => s.units);
  const run = useReportRun(doc);

  const scores = useMemo(
    () => (doc && run ? score(run.rows, doc.measures, { seed: run.seed }) : []),
    [doc, run],
  );
  const factors = useMemo(
    () => (doc ? factorRows(doc, run ? { n: run.n, seed: run.seed } : null, units) : []),
    [doc, run, units],
  );

  if (!doc) return <Muted>No vignette open.</Muted>;

  const picked = pickedCharts(doc.report);
  const notes = Object.fromEntries(SECTIONS.map((s) => [s.id, sectionNote(doc.report, s.id)]));
  const question = (key: string) => doc.questions.find((q) => q.key === key);

  const togglePick = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    edit('Pick report chart', (d) => setPickedCharts(d, next));
  };

  const exportCsv = () => {
    if (!run) return;
    downloadText(fileName(`${doc.name}-runs`, 'csv'), rowsToCsv(run.rows), 'text/csv');
  };
  const exportVignette = () =>
    downloadText(fileName(doc.name, 'json'), vignetteJson(doc, doc.runs), 'application/json');

  const body: Record<SectionId, ReactNode> = {
    question:
      doc.questions.length === 0 ? (
        <Muted>No question recorded.</Muted>
      ) : (
        <ul className="space-y-1 text-sm">
          {doc.questions.map((q) => (
            <li key={q.key}>
              <span className="font-mono">{q.id}</span> {q.text}
              {q.note ? <p className="whitespace-pre-wrap text-muted">{q.note}</p> : null}
            </li>
          ))}
        </ul>
      ),

    hypothesis: (
      <div className="space-y-2 text-sm">
        {doc.hypotheses.length === 0 ? <Muted>No hypothesis recorded.</Muted> : null}
        {doc.hypotheses.map((h) => {
          const m = measureById(h.measure);
          const snap = run?.predictions.find((p) => p.hypothesis === h.key);
          const pred = snap ?? h.prediction;
          return (
            <div key={h.key}>
              <p>
                <span className="font-mono">{h.id}</span>
                {question(h.question) ? ` (${question(h.question)?.id})` : ''}:{' '}
                <span className="font-mono">{h.measure}</span> {m?.name ?? ''}{' '}
                <span className="font-mono">{h.op}</span>{' '}
                <Num s={measureValue(h.value, m?.unit ?? '', units)} />
              </p>
              <p>
                Prediction:{' '}
                {pred ? (
                  <span className="font-mono">{predictionText(pred, h.measure, units)}</span>
                ) : (
                  <span className="text-muted">none recorded</span>
                )}
              </p>
              {h.lockedAt && run ? (
                <p data-testid={`lock-${h.id}`}>
                  Prediction locked <span className="font-mono">{utc(h.lockedAt)}</span>.
                </p>
              ) : null}
            </div>
          );
        })}
        {run ? null : <p>{NO_RUN}</p>}
      </div>
    ),

    setup: (
      <div className="space-y-3">
        {renderMap ? (
          renderMap()
        ) : (
          <div className="report-map flex h-40 items-center justify-center rounded-md border border-surface-3 text-sm text-muted">
            Map snapshot
          </div>
        )}
        <FactorTable rows={factors} />
      </div>
    ),

    results: (
      <div className="space-y-4">
        {run ? <Scorecard doc={doc} scores={scores} units={units} /> : <Muted>No run yet.</Muted>}
        <fieldset className="report-noprint">
          <legend className="mb-1 text-xs text-muted">Charts in the report</legend>
          {doc.measures.length === 0 ? <Muted>No measures scored.</Muted> : null}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {doc.measures.map((s) => (
              <li key={s.id}>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={picked.includes(s.id)}
                    onChange={() => togglePick(s.id)}
                  />
                  <span className="font-mono">{s.id}</span> {measureById(s.id)?.name ?? ''}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {run && renderChart
          ? picked.map((id) => (
              <figure key={id} className="report-chart" data-chart={id}>
                {renderChart(id, run.key)}
              </figure>
            ))
          : null}
      </div>
    ),

    evaluation: !run ? (
      <Muted>No run yet.</Muted>
    ) : doc.hypotheses.length === 0 ? (
      <Muted>No hypothesis recorded.</Muted>
    ) : (
      <table className="report-table w-full text-sm">
        <thead>
          <tr>
            <th scope="col">Hypothesis</th>
            <th scope="col">Measure</th>
            <th scope="col">Predicted</th>
            <th scope="col">Observed</th>
            <th scope="col">Interval</th>
            <th scope="col">Evaluation</th>
            <th scope="col">Prediction held</th>
          </tr>
        </thead>
        <tbody>
          {doc.hypotheses.map((h) => {
            const m = measureById(h.measure);
            const snap = run.predictions.find((p) => p.hypothesis === h.key);
            // Scored against the hypothesis statement; an empty unit is the measure's own.
            const s = scoreOne(
              run.rows,
              { id: h.measure, op: h.op, threshold: h.value, unit: '' },
              { seed: run.seed },
            );
            const held =
              !snap || s.value == null
                ? 'Not assessed'
                : s.value >= snap.low && s.value <= snap.high
                  ? 'Yes'
                  : 'No';
            return (
              <tr key={h.key}>
                <td className="font-mono">{h.id}</td>
                <td>
                  <span className="font-mono">{h.measure}</span> {m?.name ?? ''}
                </td>
                <td className="font-mono">
                  {snap ? predictionText(snap, h.measure, units) : 'None'}
                </td>
                <td>
                  {s.value == null ? (
                    'No value'
                  ) : (
                    <Num s={measureValue(s.value, m?.unit ?? '', units)} />
                  )}
                </td>
                <td className="font-mono">{intervalText(s, units)}</td>
                <td>{EVALUATION_LABEL[s.evaluation]}</td>
                <td>{held}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    ),

    scope: (
      <div className="text-sm">
        <p>{SCOPE_LEAD}</p>
        <ul className="mt-1 list-disc pl-5" aria-label="Conditions tested">
          {factors.map((f) => (
            <li key={f.key}>{factorLine(f)}</li>
          ))}
        </ul>
        <p className="mt-2">Conclusions outside these conditions need a further test.</p>
      </div>
    ),

    next: null,
  };

  return (
    <div data-print-root className="report-root mx-auto max-w-4xl p-6 text-text">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{doc.name}</h1>
          <p className="text-sm text-muted">
            After action report (AAR)
            {run ? (
              <>
                {' '}
                · <span className="font-mono">n {run.n}</span> ·{' '}
                <span className="font-mono">seed {run.seed}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="report-noprint flex gap-2">
          <Button variant="default" onClick={() => window.print()}>
            Export PDF
          </Button>
          <Button variant="default" onClick={exportCsv} disabled={!run}>
            Export CSV
          </Button>
          <Button variant="default" onClick={exportVignette}>
            Export JSON
          </Button>
        </div>
      </header>
      {SECTIONS.map((s, i) => (
        <Section key={s.id} n={i + 1} id={s.id} title={s.title} note={notes[s.id] ?? ''}>
          {body[s.id]}
        </Section>
      ))}
    </div>
  );
}
