// One picked AAR chart: the Results chart for a measure on a given run. Reads the run from memory
// when it is there, else the stored RunSummary rows, scored as the Report scores them.
import { useMemo } from 'react';
import { measureById } from '../../domain/measures';
import { score } from '../../engine/score';
import { useDocument } from '../../state/document';
import { useRun } from '../../state/runs';
import { useUi } from '../../state/ui';
import { ChartFrame } from './ChartFrame';
import { MeasureChart } from './MeasureChart';
import './results.css';

export default function ReportChart({ measureId, runKey }: { measureId: string; runKey: string }) {
  const doc = useDocument((s) => s.doc);
  const entry = useRun(runKey);
  const units = useUi((s) => s.units);
  const data = useMemo(() => {
    if (entry?.result) return { rows: entry.result.rows, scores: entry.result.scores };
    const stored = doc?.runs.find((r) => r.key === runKey);
    if (!doc || !stored) return null;
    return { rows: stored.rows, scores: score(stored.rows, doc.measures, { seed: stored.seed }) };
  }, [doc, entry, runKey]);
  const s = data?.scores.find((x) => x.id === measureId);
  if (!data || !s)
    return (
      <ChartFrame
        title={`${measureId} ${measureById(measureId)?.name ?? ''}`.trim()}
        subtitle="Not scored in this run."
      >
        {null}
      </ChartFrame>
    );
  return (
    <MeasureChart
      score={s}
      rows={data.rows}
      hypothesis={doc?.hypotheses.find((h) => h.measure === measureId)}
      units={units}
    />
  );
}
