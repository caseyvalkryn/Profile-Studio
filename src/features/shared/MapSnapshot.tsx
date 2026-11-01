// A static picture of the vignette for the AAR Setup section: the board's Plan card render
// (src/board `render.card`, thumb mode) at 320 by 200, from the same derive memo as Build.
import '../../board/board.css';
import { render } from '../../board';
import type { Vignette } from '../../domain/types';
import { boardDerived, boardScene } from '../build/board/derived';

const W = 320;
const H = 200;

export function MapSnapshot({ vignette }: { vignette: Vignette }) {
  const svg = render.card(boardScene(vignette), boardDerived(vignette), null, { W, H }, true);
  return (
    <div
      className="report-map block overflow-hidden rounded-md border border-surface-3 bg-surface-1"
      style={{ width: W, height: H }}
      role="img"
      aria-label="Map snapshot"
      data-testid="map-snapshot"
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg aria-hidden="true" ') }}
    />
  );
}
