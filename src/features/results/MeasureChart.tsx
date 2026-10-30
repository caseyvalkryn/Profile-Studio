// One scorecard row as a chart. A proportion shows its point and Wilson interval on a 0 to 100 %
// scale; a sample shows a histogram of the per-row values with the statistic, its interval and
// the threshold marked. Drawn as plain SVG so the export matches the screen.
import type { Hypothesis, RunRow } from '../../domain/types';
import { measureById } from '../../domain/measures';
import { MEASURE_FORMULAS } from '../../engine/score';
import type { Score } from '../../engine/score';
import type { Units } from '../../state/ui';
import { ChartFrame } from './ChartFrame';
import {
  OP_TEXT,
  canonicalThreshold,
  fmt,
  formatValue,
  measureScale,
  noValueText,
  resultSentence,
} from '../shared/units';

export type MeasureChartProps = {
  score: Score;
  rows: RunRow[];
  hypothesis?: Hypothesis;
  units: Units;
  width?: number;
};

/** Per-row values of a sample measure, in the canonical unit. Empty for other kinds. */
export function sampleValues(id: string, rows: RunRow[]): number[] {
  const f = MEASURE_FORMULAS[id];
  if (!f || f.kind !== 'sample') return [];
  return rows.map(f.value).filter((v): v is number => v != null && Number.isFinite(v));
}

export function chartTitle(score: Score, units: Units, h?: Hypothesis): string {
  const m = measureById(score.id);
  const name = `${score.id} ${m?.name ?? ''}`.trim();
  if (!h) return name;
  return `${h.id}: ${name} ${OP_TEXT[h.op]} ${formatValue(units, score.id, h.value)}`;
}

/** The sample statistic's word: max for 1.5, mean otherwise. */
export function statLabel(id: string): string {
  const f = MEASURE_FORMULAS[id];
  return f?.kind === 'sample' && f.statistic ? 'max' : 'mean';
}

const PAD = { l: 44, r: 16, t: 12, b: 34 };
const TEXT = { fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' };

function ticks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

function ProportionPlot({ score, width }: { score: Score; width: number }) {
  const h = 96;
  const x = (v: number) => PAD.l + ((width - PAD.l - PAD.r) * v) / 100;
  const y = 40;
  const t = canonicalThreshold(score);
  return (
    <svg data-chart width={width} height={h} role="img" aria-label="Proportion with interval">
      {ticks(0, 100, 5).map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={12} y2={h - PAD.b} stroke="var(--chart-grid)" />
          <text x={x(v)} y={h - PAD.b + 16} textAnchor="middle" {...TEXT}>
            {v}
          </text>
        </g>
      ))}
      <text x={width - PAD.r} y={h - 4} textAnchor="end" {...TEXT}>
        %
      </text>
      {t != null ? (
        <g>
          <line
            x1={x(t)}
            x2={x(t)}
            y1={8}
            y2={h - PAD.b}
            stroke="var(--text)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text x={x(t) + 4} y={16} {...TEXT}>
            threshold {fmt(t, 0)}
          </text>
        </g>
      ) : null}
      {score.interval ? (
        <g stroke="var(--chart-mark)" strokeWidth={2}>
          <line x1={x(score.interval.low)} x2={x(score.interval.high)} y1={y} y2={y} />
          <line x1={x(score.interval.low)} x2={x(score.interval.low)} y1={y - 6} y2={y + 6} />
          <line x1={x(score.interval.high)} x2={x(score.interval.high)} y1={y - 6} y2={y + 6} />
        </g>
      ) : null}
      {score.value != null ? (
        <circle
          cx={x(score.value)}
          cy={y}
          r={5}
          fill="var(--chart-mark)"
          stroke="var(--surface-1)"
          strokeWidth={2}
        >
          <title>{`${fmt(score.value, 1)} % (n ${score.n})`}</title>
        </circle>
      ) : null}
    </svg>
  );
}

function Histogram({
  score,
  values,
  units,
  width,
}: {
  score: Score;
  values: number[];
  units: Units;
  width: number;
}) {
  const s = measureScale(units, score.id);
  const xs = values.map((v) => v * s.factor);
  const tc = canonicalThreshold(score);
  const t = tc == null ? null : tc * s.factor;
  const iv = score.interval
    ? { low: score.interval.low * s.factor, high: score.interval.high * s.factor }
    : null;
  const stat = score.value == null ? null : score.value * s.factor;
  const marks = [...xs, ...(t != null ? [t] : []), ...(iv ? [iv.low, iv.high] : [])];
  let lo = Math.min(...marks);
  let hi = Math.max(...marks);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.05;
  lo -= pad;
  hi += pad;
  const bins = Math.max(4, Math.min(16, Math.ceil(Math.log2(Math.max(xs.length, 1)) + 1)));
  const bw = (hi - lo) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const v of xs) counts[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / bw)))]!++;
  const maxC = Math.max(1, ...counts);
  const h = 200;
  const plotW = width - PAD.l - PAD.r;
  const plotH = h - PAD.t - PAD.b;
  const x = (v: number) => PAD.l + (plotW * (v - lo)) / (hi - lo);
  const y = (c: number) => PAD.t + plotH - (plotH * c) / maxC;
  const base = PAD.t + plotH;
  return (
    <svg data-chart width={width} height={h} role="img" aria-label="Histogram of per-row values">
      {ticks(0, maxC, Math.min(4, maxC)).map((c) => (
        <g key={`y${c}`}>
          <line x1={PAD.l} x2={width - PAD.r} y1={y(c)} y2={y(c)} stroke="var(--chart-grid)" />
          <text x={PAD.l - 6} y={y(c) + 4} textAnchor="end" {...TEXT}>
            {c}
          </text>
        </g>
      ))}
      {iv ? (
        <rect
          x={x(iv.low)}
          y={PAD.t}
          width={Math.max(1, x(iv.high) - x(iv.low))}
          height={plotH}
          fill="var(--chart-band)"
        />
      ) : null}
      {counts.map((c, i) =>
        c > 0 ? (
          <rect
            key={i}
            x={x(lo + i * bw) + 1}
            y={y(c)}
            width={Math.max(1, x(lo + (i + 1) * bw) - x(lo + i * bw) - 2)}
            height={base - y(c)}
            rx={2}
            fill="var(--chart-mark)"
          >
            <title>{`${fmt(lo + i * bw, s.decimals)} to ${fmt(lo + (i + 1) * bw, s.decimals)} ${s.unit}: ${c} rows`}</title>
          </rect>
        ) : null,
      )}
      <line x1={PAD.l} x2={width - PAD.r} y1={base} y2={base} stroke="var(--text-muted)" />
      {ticks(lo, hi, 5).map((v) => (
        <text key={`x${v}`} x={x(v)} y={base + 16} textAnchor="middle" {...TEXT}>
          {fmt(v, s.decimals)}
        </text>
      ))}
      <text x={width - PAD.r} y={h - 4} textAnchor="end" {...TEXT}>
        {s.unit}
      </text>
      {stat != null ? (
        <g>
          <line
            x1={x(stat)}
            x2={x(stat)}
            y1={PAD.t}
            y2={base}
            stroke="var(--text)"
            strokeWidth={2}
          />
          <text x={x(stat) + 4} y={PAD.t + 10} {...TEXT}>
            {statLabel(score.id)}
          </text>
        </g>
      ) : null}
      {t != null ? (
        <g>
          <line
            x1={x(t)}
            x2={x(t)}
            y1={PAD.t}
            y2={base}
            stroke="var(--text)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text x={x(t) + 4} y={PAD.t + 24} {...TEXT}>
            threshold
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export function MeasureChart({ score, rows, hypothesis, units, width = 640 }: MeasureChartProps) {
  const f = MEASURE_FORMULAS[score.id];
  const title = chartTitle(score, units, hypothesis);
  const subtitle = resultSentence(units, score);
  if (score.value == null || !f || f.kind === 'null')
    return (
      <ChartFrame title={title} subtitle={subtitle}>
        <div className="text-sm text-muted">
          {score.value == null
            ? noValueText(score)
            : score.sourceClass === 'entered'
              ? 'Entered value from the vendor sheet. The run does not produce it, so there is no chart.'
              : 'No value to chart.'}
        </div>
      </ChartFrame>
    );
  if (f.kind === 'proportion')
    return (
      <ChartFrame
        title={title}
        subtitle={subtitle}
        note={`Point: proportion of ${score.n} rows. Bar: 95 % Wilson score interval. Dashed: threshold.`}
      >
        <ProportionPlot score={score} width={width} />
      </ChartFrame>
    );
  const values = sampleValues(score.id, rows);
  const s = measureScale(units, score.id);
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      note={`Bars: count of ${values.length} row values in ${s.unit}. Solid: statistic. Band: 95 % bootstrap interval. Dashed: threshold.`}
    >
      <Histogram score={score} values={values} units={units} width={width} />
    </ChartFrame>
  );
}
