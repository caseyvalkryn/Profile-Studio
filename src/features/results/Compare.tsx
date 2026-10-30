// Run compare (spec acceptance 12.6): up to four runs side by side, rows aligned by DroneScore
// id, and the difference against the first run in the last column.
import { measureById } from '../../domain/measures';
import type { Score } from '../../engine/score';
import type { Units } from '../../state/ui';
import { EvaluationBadge } from './Scorecard';
import { fmt, formatInterval, formatValue, measureScale } from '../shared/units';

export type CompareRun = { key: string; label: string; scores: Score[] };

export function intervalsOverlap(
  a: { low: number; high: number },
  b: { low: number; high: number },
): boolean {
  return a.low <= b.high && b.low <= a.high;
}

function difference(units: Units, first: Score | undefined, other: Score | undefined): string {
  if (!first || !other || first.value == null || other.value == null) return '–';
  const s = measureScale(units, first.id);
  const d = (other.value - first.value) * s.factor;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  const overlap =
    first.interval && other.interval
      ? intervalsOverlap(first.interval, other.interval)
        ? 'intervals overlap'
        : 'intervals do not overlap'
      : 'no interval';
  return `${sign}${fmt(Math.abs(d), s.decimals)} ${s.unit}, ${overlap}`;
}

export function Compare({ runs, units }: { runs: CompareRun[]; units: Units }) {
  if (runs.length < 2)
    return (
      <p className="text-sm text-muted">
        Select two to four runs in the run list to compare them side by side.
      </p>
    );
  const ids: string[] = [];
  for (const r of runs) for (const s of r.scores) if (!ids.includes(s.id)) ids.push(s.id);
  const [first, ...others] = runs;
  return (
    <table className="w-full border-collapse text-sm" aria-label="Run compare">
      <thead>
        <tr className="border-b border-surface-3 text-left text-xs text-muted">
          <th className="py-1 pr-2 font-normal">Measure</th>
          {runs.map((r) => (
            <th key={r.key} className="py-1 pr-2 font-normal" data-run={r.label}>
              {r.label}
            </th>
          ))}
          <th className="py-1 font-normal">Difference against {first!.label}</th>
        </tr>
      </thead>
      <tbody>
        {ids.map((id) => {
          const firstScore = first!.scores.find((s) => s.id === id);
          return (
            <tr key={id} data-measure={id} className="border-b border-surface-2 align-top">
              <td className="py-1 pr-2">
                <span className="font-mono">{id}</span> {measureById(id)?.name ?? ''}
              </td>
              {runs.map((r) => {
                const s = r.scores.find((x) => x.id === id);
                return (
                  <td key={r.key} className="py-1 pr-2">
                    {s && s.value != null ? (
                      <div className="flex flex-col">
                        <span className="font-mono whitespace-nowrap">
                          {formatValue(units, id, s.value)}{' '}
                          {s.interval ? formatInterval(units, id, s.interval) : ''}
                        </span>
                        <EvaluationBadge evaluation={s.evaluation} />
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{s ? s.note : 'Not scored'}</span>
                    )}
                  </td>
                );
              })}
              <td className="py-1 font-mono text-xs whitespace-nowrap" data-testid="difference">
                {others.map((r) => (
                  <div key={r.key}>
                    {others.length > 1 ? `${r.label}: ` : ''}
                    {difference(
                      units,
                      firstScore,
                      r.scores.find((x) => x.id === id),
                    )}
                  </div>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
