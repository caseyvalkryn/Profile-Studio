// A static picture of the vignette for the AAR Setup section: areas, sensor coverage rings and
// threat paths on a 320 by 200 SVG, labelled by id only. North is up; positions are the stored
// local metres.
import type { Vignette } from '../../domain/types';

const W = 320;
const H = 200;
const PAD = 12;
const ID_TEXT = { fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' };

type Box = { x0: number; y0: number; x1: number; y1: number };

function bounds(v: Vignette): Box | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };
  for (const a of v.areas) for (const [x, y] of a.pts) add(x, y);
  for (const s of v.sensors) {
    add(s.x - s.rangeM, s.y - s.rangeM);
    add(s.x + s.rangeM, s.y + s.rangeM);
  }
  for (const t of v.threats) for (const p of t.path) add(p.x, p.y);
  if (xs.length === 0) return null;
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function MapSnapshot({ vignette }: { vignette: Vignette }) {
  const b = bounds(vignette);
  const span = b ? Math.max(b.x1 - b.x0, b.y1 - b.y0, 1) : 1;
  const k = Math.min((W - 2 * PAD) / span, (H - 2 * PAD) / span);
  const cx = b ? (b.x0 + b.x1) / 2 : 0;
  const cy = b ? (b.y0 + b.y1) / 2 : 0;
  const px = (x: number) => W / 2 + (x - cx) * k;
  const py = (y: number) => H / 2 - (y - cy) * k;
  return (
    <svg
      className="report-map block rounded-md border border-surface-3 bg-surface-1"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Map snapshot"
      data-testid="map-snapshot"
    >
      {vignette.areas.map((a) => (
        <g key={a.key}>
          <polygon
            points={a.pts.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')}
            fill="var(--surface-2)"
            stroke="var(--text-muted)"
            strokeWidth={1}
          />
          {a.pts[0] ? (
            <text x={px(a.pts[0][0]) + 3} y={py(a.pts[0][1]) - 3} {...ID_TEXT}>
              {a.id}
            </text>
          ) : null}
        </g>
      ))}
      {vignette.sensors.map((s) => (
        <g key={s.key}>
          <circle
            cx={px(s.x)}
            cy={py(s.y)}
            r={s.rangeM * k}
            fill="none"
            stroke="var(--text)"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
          <circle cx={px(s.x)} cy={py(s.y)} r={2.5} fill="var(--text)" />
          <text x={px(s.x) + 4} y={py(s.y) - 4} {...ID_TEXT}>
            {s.id}
          </text>
        </g>
      ))}
      {vignette.threats.map((t) => {
        const last = t.path[t.path.length - 1];
        return (
          <g key={t.key}>
            <polyline
              points={t.path.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
              fill="none"
              stroke="var(--state-hostile)"
              strokeWidth={1.5}
            />
            {t.path[0] ? (
              <text x={px(t.path[0].x) + 4} y={py(t.path[0].y) + 10} {...ID_TEXT}>
                {t.id}
              </text>
            ) : null}
            {last ? (
              <circle cx={px(last.x)} cy={py(last.y)} r={2} fill="var(--state-hostile)" />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
