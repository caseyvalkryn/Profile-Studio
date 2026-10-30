// Sweep results (spec acceptance 12.7). One factor: the chosen measure against the factor levels,
// the interval as a band, the threshold as a line. Two factors: a heat map of the value with the
// number in each cell.
import { useId, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { measureById } from '../../domain/measures';
import type { Factor, FactorKind, Sweep } from '../../engine/sweep';
import type { Score } from '../../engine/score';
import type { Units } from '../../state/ui';
import { ChartFrame } from './ChartFrame';
import {
  EVALUATION_WORD,
  M_PER_FT,
  M_PER_NM,
  OP_TEXT,
  canonicalThreshold,
  fmt,
  measureScale,
} from '../shared/units';

const FACTOR_WORD: Record<FactorKind, string> = {
  'threat-speed': 'Threat speed',
  'threat-altitude': 'Threat altitude',
  'approach-bearing': 'Approach bearing',
  'sensor-range': 'Sensor range',
  'sensor-position-offset': 'Sensor position offset',
};

/** A factor level in display units. */
export function factorLevel(
  units: Units,
  kind: FactorKind,
  level: number,
): { v: number; unit: string } {
  const nav = units === 'nav';
  switch (kind) {
    case 'threat-speed':
      return nav ? { v: level / (M_PER_NM / 3600), unit: 'kt' } : { v: level, unit: 'm/s' };
    case 'threat-altitude':
      return nav ? { v: level / M_PER_FT, unit: 'ft AGL' } : { v: level, unit: 'm AGL' };
    case 'approach-bearing':
      return { v: level, unit: '°' };
    case 'sensor-range':
    case 'sensor-position-offset':
      return nav ? { v: level / M_PER_NM, unit: 'nm' } : { v: level / 1000, unit: 'km' };
  }
}

function factorLabel(units: Units, f: Factor): string {
  return `${FACTOR_WORD[f.kind]}${f.target ? ` (${f.target})` : ''}, ${factorLevel(units, f.kind, 0).unit}`;
}

function levelText(units: Units, f: Factor, level: number): string {
  const d = factorLevel(units, f.kind, level);
  return fmt(d.v, Number.isInteger(d.v) ? 0 : 1);
}

const BLUE_RAMP = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
];

export function rampColor(t: number): { fill: string; ink: string } {
  const i = Math.round(Math.max(0, Math.min(1, t)) * (BLUE_RAMP.length - 1));
  return { fill: BLUE_RAMP[i]!, ink: i >= 6 ? '#ffffff' : '#0b0b0b' };
}

function scoreOf(scores: Score[], id: string): Score | undefined {
  return scores.find((s) => s.id === id);
}

export type SweepChartProps = { sweep: Sweep; units: Units; width?: number; height?: number };

export function SweepChart({ sweep, units, width = 640, height = 260 }: SweepChartProps) {
  const ids = sweep.cells[0]?.scores.map((s) => s.id) ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const pickerId = useId();
  const id = picked && ids.includes(picked) ? picked : (ids[0] ?? null);
  if (!id || sweep.factors.length === 0)
    return <p className="text-sm text-muted">The sweep has no scored measure.</p>;
  const m = measureById(id);
  const s = measureScale(units, id);
  const scores = sweep.cells.map((c) => scoreOf(c.scores, id));
  const meets = scores.filter((x) => x?.evaluation === 'meets').length;
  const sample = scores.find((x) => x) as Score;
  const t = canonicalThreshold(sample);
  const thresholdText =
    t == null ? '' : ` ${OP_TEXT[sample.op]} ${fmt(t * s.factor, s.decimals)} ${s.unit}`;
  const name = `${id} ${m?.name ?? ''}`.trim();
  const f0 = sweep.factors[0]!;
  const f1 = sweep.factors[1];
  const title = f1
    ? `${name} by ${FACTOR_WORD[f0.kind].toLowerCase()} and ${FACTOR_WORD[f1.kind].toLowerCase()}`
    : `${name} against ${FACTOR_WORD[f0.kind].toLowerCase()}`;
  const subtitle = `${EVALUATION_WORD.meets} the threshold${thresholdText} at ${meets} of ${sweep.cells.length} ${f1 ? 'cells' : 'levels'}.`;

  const picker = (
    <div className="results-no-print mb-2 flex items-center gap-2 text-xs text-muted">
      <label htmlFor={pickerId}>Measure</label>
      <select
        id={pickerId}
        value={id}
        onChange={(e) => setPicked(e.target.value)}
        className="rounded-sm border border-surface-3 bg-surface-1 px-1 py-0.5 text-text"
      >
        {ids.map((x) => (
          <option key={x} value={x}>
            {x} {measureById(x)?.name ?? ''}
          </option>
        ))}
      </select>
    </div>
  );

  if (!f1) {
    const data = sweep.cells.map((c, i) => {
      const sc = scores[i];
      return {
        level: factorLevel(units, f0.kind, c.levels[0]!).v,
        value: sc?.value == null ? null : sc.value * s.factor,
        band: sc?.interval ? [sc.interval.low * s.factor, sc.interval.high * s.factor] : null,
      };
    });
    return (
      <div>
        {picker}
        <ChartFrame
          title={title}
          subtitle={subtitle}
          note={`Line: ${s.unit} at each level. Band: 95 % interval. Dashed: threshold. x: ${factorLabel(units, f0)}.`}
        >
          <ComposedChart
            width={width}
            height={height}
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="level"
              type="number"
              domain={['dataMin', 'dataMax']}
              ticks={data.map((d) => d.level)}
              tickFormatter={(v: number) => fmt(v, Number.isInteger(v) ? 0 : 1)}
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }}
            />
            <YAxis
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }}
              tickFormatter={(v: number) => fmt(v, s.decimals)}
              width={52}
            />
            <ChartTooltip
              formatter={(v: unknown) =>
                Array.isArray(v)
                  ? `[${fmt(Number(v[0]), s.decimals)}, ${fmt(Number(v[1]), s.decimals)}] ${s.unit}`
                  : `${fmt(Number(v), s.decimals)} ${s.unit}`
              }
              labelFormatter={(v: unknown) => `${FACTOR_WORD[f0.kind]} ${fmt(Number(v), 1)}`}
            />
            <Area
              dataKey="band"
              name="95 % interval"
              stroke="none"
              fill="var(--chart-band)"
              fillOpacity={1}
              isAnimationActive={false}
            />
            {t != null ? (
              <ReferenceLine y={t * s.factor} stroke="var(--text)" strokeDasharray="4 3" />
            ) : null}
            <Line
              dataKey="value"
              name={name}
              stroke="var(--chart-mark)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--chart-mark)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartFrame>
      </div>
    );
  }

  // Two factors: f0 on x, f1 on y.
  const xs = f0.levels;
  const ys = f1.levels;
  const values = scores.map((x) => (x?.value == null ? null : x.value * s.factor));
  const finite = values.filter((v): v is number => v != null);
  const lo = finite.length ? Math.min(...finite) : 0;
  const hi = finite.length ? Math.max(...finite) : 1;
  const cellAt = (i: number, j: number) =>
    sweep.cells.findIndex((c) => c.levels[0] === xs[i] && c.levels[1] === ys[j]);
  const left = 64;
  const top = 8;
  const bottom = 36;
  const cw = Math.max(24, (width - left - 8) / xs.length);
  const ch = Math.max(24, Math.min(48, (height - top - bottom) / ys.length));
  const h = top + ch * ys.length + bottom;
  const mono = { fontFamily: 'var(--font-mono)', fontSize: 11 };
  return (
    <div>
      {picker}
      <ChartFrame
        title={title}
        subtitle={subtitle}
        note={`Cell: ${s.unit}, darker is higher. x: ${factorLabel(units, f0)}. y: ${factorLabel(units, f1)}.`}
      >
        <svg data-chart width={width} height={h} role="img" aria-label="Sweep heat map">
          {ys.map((yl, j) => (
            <text
              key={`y${j}`}
              x={left - 6}
              y={top + ch * (ys.length - 1 - j) + ch / 2 + 4}
              textAnchor="end"
              fill="var(--text-muted)"
              {...mono}
            >
              {levelText(units, f1, yl)}
            </text>
          ))}
          {xs.map((xl, i) => (
            <text
              key={`x${i}`}
              x={left + cw * i + cw / 2}
              y={top + ch * ys.length + 16}
              textAnchor="middle"
              fill="var(--text-muted)"
              {...mono}
            >
              {levelText(units, f0, xl)}
            </text>
          ))}
          {xs.flatMap((_, i) =>
            ys.map((__, j) => {
              const k = cellAt(i, j);
              const v = k >= 0 ? values[k] : null;
              const sc = k >= 0 ? scores[k] : undefined;
              const c =
                v == null
                  ? { fill: 'var(--surface-2)', ink: 'var(--text-muted)' }
                  : rampColor(hi > lo ? (v - lo) / (hi - lo) : 0.5);
              const x = left + cw * i;
              const y = top + ch * (ys.length - 1 - j);
              return (
                <g key={`${i}-${j}`} data-cell>
                  <rect x={x + 1} y={y + 1} width={cw - 2} height={ch - 2} rx={2} fill={c.fill}>
                    <title>
                      {v == null
                        ? 'No value'
                        : `${fmt(v, s.decimals)} ${s.unit}: ${sc ? EVALUATION_WORD[sc.evaluation] : ''}`}
                    </title>
                  </rect>
                  <text
                    x={x + cw / 2}
                    y={y + ch / 2 + 4}
                    textAnchor="middle"
                    fill={c.ink}
                    {...mono}
                  >
                    {v == null ? '–' : fmt(v, s.decimals)}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </ChartFrame>
    </div>
  );
}
