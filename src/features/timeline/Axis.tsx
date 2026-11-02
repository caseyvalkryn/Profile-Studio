// The strip's time axis: the loop range (or the range being dragged), the base line, the minor
// and major ticks and the labels ("0:00"; the cursor chip carries the "t+" prefix).
import type { ReactNode } from 'react';
import { AXIS_H, CH, mmss } from './layout';

const MAJORS = [1, 2, 5, 10, 30, 60, 120, 300, 600, 1200, 3600];
const MINOR: Record<number, number> = {
  1: 0.2,
  2: 0.5,
  5: 1,
  10: 2,
  30: 5,
  60: 10,
  120: 30,
  300: 60,
  600: 120,
  1200: 300,
  3600: 600,
};

/** The major and minor tick steps for a span at this scale: at most 8 labelled majors that fit. */
export function tickSteps(spanS: number, pxPerS: number): { major: number; minor: number } {
  // the widest label, "59:00", is five mono characters
  const labMin = 5 * CH + 8;
  let major = MAJORS[MAJORS.length - 1]!;
  for (const m of MAJORS)
    if (spanS / m <= 8 && m * pxPerS >= labMin) {
      major = m;
      break;
    }
  return { major, minor: MINOR[major] ?? major / 5 };
}

export type AxisProps = {
  /** The strip width, the left and right gutters. */
  W: number;
  gut: number;
  gutR: number;
  tv0: number;
  tv1: number;
  xOf: (t: number) => number;
  /** The loop range to draw: the one being dragged, else the loop. */
  range: { t0: number; t1: number } | null;
};

export function axisMarks({ W, gut, gutR, tv0, tv1, xOf, range }: AxisProps): ReactNode[] {
  const span = tv1 - tv0;
  const plotW = W - gut - gutR;
  const { major, minor } = tickSteps(span, plotW / span);
  const out: ReactNode[] = [];
  if (range && range.t1 > range.t0) {
    const x0 = Math.max(gut, xOf(range.t0));
    const x1 = Math.min(W - gutR, xOf(range.t1));
    if (x1 > x0)
      out.push(
        <rect key="rg" className="tl-range" x={x0} y={0} width={x1 - x0} height={AXIS_H} />,
        <line key="r0" className="tl-rangeedge" x1={x0} x2={x0} y1={0} y2={AXIS_H} />,
        <line key="r1" className="tl-rangeedge" x1={x1} x2={x1} y1={0} y2={AXIS_H} />,
      );
  }
  out.push(
    <line
      key="base"
      className="tl-axbase"
      x1={gut}
      x2={W - gutR}
      y1={AXIS_H - 0.5}
      y2={AXIS_H - 0.5}
    />,
  );
  let labEnd = -Infinity;
  for (let t = Math.ceil(tv0 / minor) * minor; t <= tv1 + 1e-6; t += minor) {
    const tt = Math.round(t * 1000) / 1000;
    const x = xOf(tt);
    const maj = Math.abs(tt / major - Math.round(tt / major)) < 1e-6;
    out.push(
      <line
        key={`t${tt}`}
        className={maj ? 'tl-tick tl-tick-maj' : 'tl-tick'}
        x1={x}
        x2={x}
        y1={maj ? AXIS_H - 7 : AXIS_H - 4}
        y2={AXIS_H}
      />,
    );
    if (!maj) continue;
    const lab = major < 1 || tt % 1 ? tt.toFixed(1) : mmss(tt);
    const atStart = x < gut + 12;
    const lw = lab.length * CH;
    const lx0 = atStart ? x : x - lw / 2;
    if (lx0 >= labEnd + 8) {
      out.push(
        <text
          key={`l${tt}`}
          className="tl-tlab"
          x={x}
          y={AXIS_H - 9}
          textAnchor={atStart ? 'start' : 'middle'}
        >
          {lab}
        </text>,
      );
      labEnd = lx0 + lw;
    }
  }
  out.push(
    <text key="t" className="tl-tlab" x={4} y={AXIS_H - 9}>
      t
    </text>,
  );
  return out;
}
