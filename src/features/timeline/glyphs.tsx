// The timeline's marks (principle 1.2: one mark per meaning on the strip, the legend and, later,
// the Brief). One SVG glyph per F2T2EA step and the defended asset entry, 8 to 9 px on the
// design tokens (the inks are classes in timeline.css; no new colour, principle 5.2), and the
// kind swatch of a coverage row. Each glyph is centred on (cx, cy).
import type { ReactNode } from 'react';
import type { StageName } from '../../engine';

export type GlyphStage = StageName | 'da';

/** The glyph of one key point. `className` carries the lane's ink classes. */
export function stageGlyph(stage: GlyphStage, cx: number, cy: number): ReactNode {
  const r = 4;
  switch (stage) {
    case 'find':
      return <circle className="tl-gl tl-gl-open" cx={cx} cy={cy} r={r} />;
    case 'fix':
      return (
        <>
          <circle className="tl-gl tl-gl-open" cx={cx} cy={cy} r={r} />
          <circle className="tl-gl tl-gl-fill" cx={cx} cy={cy} r={1.5} />
        </>
      );
    case 'track':
      return (
        <polygon
          className="tl-gl tl-gl-open"
          points={`${cx},${cy - r - 0.5} ${cx + r + 0.5},${cy} ${cx},${cy + r + 0.5} ${cx - r - 0.5},${cy}`}
        />
      );
    case 'target':
      return (
        <>
          <circle className="tl-gl tl-gl-open" cx={cx} cy={cy} r={r} />
          <line className="tl-gl" x1={cx - r} x2={cx + r} y1={cy} y2={cy} />
          <line className="tl-gl" x1={cx} x2={cx} y1={cy - r} y2={cy + r} />
        </>
      );
    case 'engage':
      return (
        <polygon
          className="tl-gl tl-gl-fill"
          points={`${cx},${cy - r - 0.5} ${cx + r + 0.5},${cy + r} ${cx - r - 0.5},${cy + r}`}
        />
      );
    case 'assess':
      return (
        <>
          <rect className="tl-gl tl-gl-open" x={cx - r} y={cy - r} width={2 * r} height={2 * r} />
          <polyline
            className="tl-gl"
            points={`${cx - 2.5},${cy} ${cx - 0.5},${cy + 2} ${cx + 2.5},${cy - 2}`}
          />
        </>
      );
    case 'da':
      return <rect className="tl-gl tl-gl-da" x={cx - 1.5} y={cy - r - 0.5} width={3} height={9} />;
  }
}

/** The legend's glyph order: the six F2T2EA steps, then the defended asset entry. */
export const GLYPH_ORDER: readonly GlyphStage[] = [
  'find',
  'fix',
  'track',
  'target',
  'engage',
  'assess',
  'da',
];

/**
 * The hatch patterns' ids: defs in the strip (Timeline.tsx) that `.tl-bar-s` and `.tl-bar-ew`
 * fill with (timeline.css), so the coverage families differ by texture, not only by ink.
 */
export const HATCH_S = 'tl-hatch-s';
export const HATCH_EW = 'tl-hatch-ew';

/** The pill of a coverage row or a legend entry: 10 by 6 in the row's bar fill, centred on cy. */
export function kindPill(barClass: string, x: number, cy: number): ReactNode {
  return <rect className={`tl-bar ${barClass}`} x={x} y={cy - 3} width={10} height={6} rx={1.5} />;
}
