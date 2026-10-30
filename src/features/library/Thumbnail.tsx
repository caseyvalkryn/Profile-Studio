// A plain SVG map thumbnail: areas, sensor rings, effector rings and flight paths.
// Map y points north; SVG y points down, so y is negated.
import type { Vignette } from '../../domain/types';

export const THUMB_W = 200;
export const THUMB_H = 120;

type Box = { x0: number; y0: number; x1: number; y1: number };

function bounds(v: Vignette): Box | null {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x: number, y: number, r = 0) => {
    b.x0 = Math.min(b.x0, x - r);
    b.x1 = Math.max(b.x1, x + r);
    b.y0 = Math.min(b.y0, -y - r);
    b.y1 = Math.max(b.y1, -y + r);
  };
  for (const a of v.areas) for (const [x, y] of a.pts) add(x, y);
  for (const s of v.sensors) add(s.x, s.y, s.rangeM);
  for (const e of v.effectors) add(e.x, e.y, e.rangeM);
  for (const n of v.nodes) add(n.x, n.y);
  for (const t of v.threats) for (const p of t.path) add(p.x, p.y);
  return Number.isFinite(b.x0) ? b : null;
}

/** The thumbnail of one vignette. `title` names it for assistive technology. */
export function Thumbnail({ vignette: v, title }: { vignette: Vignette; title: string }) {
  const b = bounds(v);
  if (!b) return <ThumbnailPlaceholder title={title} />;
  // Fit the bounds into the 5:3 frame with a margin, keeping aspect.
  const w = Math.max(b.x1 - b.x0, 1);
  const h = Math.max(b.y1 - b.y0, 1);
  const scale = Math.max(w / THUMB_W, h / THUMB_H) * 1.08;
  const vw = THUMB_W * scale;
  const vh = THUMB_H * scale;
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const px = scale; // one screen pixel in map metres
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`}
      width={THUMB_W}
      height={THUMB_H}
      className="block h-auto w-full rounded-sm bg-surface-0"
      fill="none"
    >
      {v.areas.map((a) => (
        <polygon
          key={a.key}
          points={a.pts.map(([x, y]) => `${x},${-y}`).join(' ')}
          fill="var(--surface-3)"
          fillOpacity={a.kind === 'asset' ? 0.9 : 0.4}
          stroke="var(--text-muted)"
          strokeWidth={px}
        />
      ))}
      {v.sensors.map((s) => (
        <circle
          key={s.key}
          cx={s.x}
          cy={-s.y}
          r={s.rangeM}
          stroke="var(--text-muted)"
          strokeOpacity={0.6}
          strokeWidth={px}
        />
      ))}
      {v.effectors.map((e) => (
        <circle
          key={e.key}
          cx={e.x}
          cy={-e.y}
          r={e.rangeM}
          stroke="var(--text)"
          strokeOpacity={0.7}
          strokeWidth={px}
          strokeDasharray={`${3 * px} ${2 * px}`}
        />
      ))}
      {v.threats.map((t) => (
        <polyline
          key={t.key}
          points={t.path.map((p) => `${p.x},${-p.y}`).join(' ')}
          stroke="var(--text)"
          strokeWidth={1.5 * px}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** A quiet frame shown until a saved vignette loads, or when it has nothing to draw. */
export function ThumbnailPlaceholder({ title }: { title: string }) {
  return (
    <div
      role="img"
      aria-label={title}
      className="aspect-[5/3] w-full rounded-sm bg-surface-0"
      style={{ maxWidth: THUMB_W }}
    />
  );
}
