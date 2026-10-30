// Side elevation along the selected flight path (spec section 7, Build: Profile). X is
// along-track distance, Y is altitude AGL. Sensor coverage windows sit as quiet bands under the
// plot, one row per sensor that covers the path. The accent dot is the current time.
import { useMemo } from 'react';
import { selected } from '../../../commands/select';
import { usePreview, useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { Tooltip } from '../../../ui';
import {
  altitudeUnit,
  distanceUnit,
  fmtAltitude,
  fmtDistance,
  fmtTime,
  niceTicks,
  toAltitude,
  toDistance,
} from '../timeline/format';
import { STEPS } from '../timeline/steps';
import { useSize } from '../timeline/useSize';
import { alongAt, cumulative } from './along';

export type ProfileViewProps = {
  /** Fixed size in pixels. Omit to fill the container. */
  width?: number;
  height?: number;
};

const M = { left: 64, right: 16, top: 24, axis: 28 };
const BAND_H = 8;
const BAND_GAP = 4;

export default function ProfileView({ width: fw, height: fh }: ProfileViewProps) {
  const doc = useDocument((s) => s.doc);
  const preview = usePreview();
  const units = useUi((s) => s.units);
  const tS = useUi((s) => s.tS);
  const keys = useUi((s) => s.selectedKeys);
  const [ref, size] = useSize<HTMLDivElement>({ width: fw, height: fh });

  const threat = useMemo(() => {
    for (const f of selected(doc, keys)) {
      if (f.kind === 'threat') return f.value;
      if (f.kind === 'waypoint') return f.threat;
    }
    return null;
  }, [doc, keys]);
  const tp = threat && preview ? (preview.threats[threat.key] ?? null) : null;

  const geo = useMemo(() => {
    if (!tp || !doc) return null;
    const w = tp.timed;
    const cum = cumulative(w);
    const sensors = doc.sensors
      .map((s) => ({ s, wins: preview?.windows[s.key]?.[tp.key] ?? [] }))
      .filter((x) => x.wins.length > 0);
    return { w, cum, sensors };
  }, [tp, doc, preview]);

  const body = (() => {
    if (!threat || !tp || !geo) {
      return (
        <p className="px-3 py-2 text-xs text-muted">Select a flight path to see its profile</p>
      );
    }
    const { width, height } = size;
    if (width <= 0 || height <= 0) return null;
    const { w, cum, sensors } = geo;
    const bandsH = sensors.length * (BAND_H + BAND_GAP);
    const plotB = height - M.axis - bandsH; // ground line y
    const plotW = Math.max(1, width - M.left - M.right);
    const plotH = Math.max(1, plotB - M.top);

    const maxS = cum[cum.length - 1] ?? 0;
    const maxZ = Math.max(1, ...w.map((p) => p.z));
    const xTicks = niceTicks(toDistance(maxS, units) || 1, 5);
    const yTicks = niceTicks(toAltitude(maxZ, units), 4);
    const xMax = xTicks[xTicks.length - 1] || 1;
    const yMax = yTicks[yTicks.length - 1] || 1;
    const X = (sM: number) => M.left + (toDistance(sM, units) / xMax) * plotW;
    const Yd = (v: number) => plotB - (v / yMax) * plotH; // v in display units
    const Y = (zM: number) => Yd(toAltitude(zM, units));
    const now = alongAt(w, cum, tS);
    const line = w.map((p, i) => `${i ? 'L' : 'M'} ${X(cum[i]!)} ${Y(p.z)}`).join(' ');

    return (
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Profile of ${threat.id}`}
        data-testid="profile-svg"
        className="block select-none"
      >
        <g data-testid="profile-y-axis">
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={Yd(v)}
                y2={Yd(v)}
                className="stroke-surface-2"
              />
              <text
                x={M.left - 6}
                y={Yd(v) + 3}
                textAnchor="end"
                fontSize={10}
                className="fill-muted font-mono"
              >
                {v}
              </text>
            </g>
          ))}
          <text x={8} y={M.top - 10} fontSize={10} className="fill-muted">
            Altitude ({altitudeUnit(units)})
          </text>
        </g>
        <g data-testid="profile-x-axis">
          {xTicks.map((v) => {
            const xx = M.left + (v / xMax) * plotW;
            return (
              <text
                key={v}
                x={xx}
                y={height - M.axis + 14}
                textAnchor="middle"
                fontSize={10}
                className="fill-muted font-mono"
              >
                {v}
              </text>
            );
          })}
          <text
            x={width - M.right}
            y={height - 4}
            textAnchor="end"
            fontSize={10}
            className="fill-muted"
          >
            Along-track distance ({distanceUnit(units)})
          </text>
        </g>
        <line
          data-testid="profile-ground"
          x1={M.left}
          x2={width - M.right}
          y1={plotB}
          y2={plotB}
          className="stroke-muted"
        />
        {sensors.map(({ s, wins }, row) => {
          const y = plotB + BAND_GAP + row * (BAND_H + BAND_GAP);
          return (
            <g key={s.key} data-testid="profile-band" data-sensor={s.id}>
              <text
                x={M.left - 6}
                y={y + BAND_H - 1}
                textAnchor="end"
                fontSize={9}
                className="fill-muted font-mono"
              >
                {s.id}
              </text>
              {wins.map((win, i) => {
                const a = X(alongAt(w, cum, win.tIn).s);
                const b = X(alongAt(w, cum, win.tOut).s);
                return (
                  <Tooltip
                    key={i}
                    content={`${s.id} covers ${fmtTime(win.tIn)} to ${fmtTime(win.tOut)}`}
                  >
                    <rect
                      x={a}
                      y={y}
                      width={Math.max(1, b - a)}
                      height={BAND_H}
                      className="fill-surface-3"
                    />
                  </Tooltip>
                );
              })}
            </g>
          );
        })}
        <path
          data-testid="profile-line"
          d={line}
          fill="none"
          strokeWidth={1.5}
          className="stroke-text"
        />
        {w.map((p, i) => {
          const hold = p.t1 - p.t0;
          return (
            <g key={i}>
              <Tooltip
                content={`Waypoint ${i + 1}, ${fmtDistance(cum[i]!, units)}, ${fmtAltitude(p.z, units)}`}
              >
                <circle
                  data-testid="profile-waypoint"
                  cx={X(cum[i]!)}
                  cy={Y(p.z)}
                  r={3}
                  className="fill-surface-1 stroke-text"
                />
              </Tooltip>
              {hold > 0 ? (
                <g data-testid="profile-hold">
                  <line
                    x1={X(cum[i]!) - 10}
                    x2={X(cum[i]!) + 10}
                    y1={Y(p.z) - 6}
                    y2={Y(p.z) - 6}
                    strokeWidth={2}
                    className="stroke-muted"
                  />
                  <text
                    x={X(cum[i]!)}
                    y={Y(p.z) - 10}
                    textAnchor="middle"
                    fontSize={10}
                    className="fill-muted font-mono"
                  >
                    hold {Math.round(hold)} s
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
        {STEPS.map((step, i) => {
          const st = tp.stages[step.key];
          if (!st) return null;
          const at = alongAt(w, cum, st.t);
          const xx = X(at.s);
          const yy = Y(at.z);
          const sys =
            doc?.sensors.find((s) => s.key === st.system)?.id ??
            doc?.effectors.find((e) => e.key === st.system)?.id ??
            st.system;
          return (
            <Tooltip key={step.key} content={`${step.label}, ${fmtTime(st.t)}, ${sys}`}>
              <g data-testid="profile-step" data-step={step.key}>
                <line x1={xx} x2={xx} y1={yy + 4} y2={yy + 10} className="stroke-muted" />
                <text
                  x={xx}
                  y={yy + 20 + (i % 2) * 10}
                  textAnchor="middle"
                  fontSize={9}
                  className="fill-muted"
                >
                  {step.label}
                </text>
              </g>
            </Tooltip>
          );
        })}
        <circle
          data-testid="profile-now"
          cx={X(now.s)}
          cy={Y(now.z)}
          r={4}
          className="fill-accent"
        />
      </svg>
    );
  })();

  return (
    <div ref={ref} className="h-full min-h-0 w-full overflow-hidden bg-surface-1 text-text">
      {body}
    </div>
  );
}
