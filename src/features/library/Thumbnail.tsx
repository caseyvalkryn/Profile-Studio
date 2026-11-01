// The Library thumbnail: the board's Plan card render (src/board `render.card`, thumb mode) at
// 200 by 120, from the same derive memo as Build. An empty profile shows the placeholder.
import '../../board/board.css';
import { render } from '../../board';
import type { Vignette } from '../../domain/types';
import { boardDerived, boardScene } from '../build/board/derived';

export const THUMB_W = 200;
export const THUMB_H = 120;

const isEmpty = (v: Vignette) =>
  v.areas.length + v.sensors.length + v.effectors.length + v.nodes.length + v.threats.length === 0;

/** The thumbnail of one vignette. `title` names it for assistive technology. */
export function Thumbnail({ vignette: v, title }: { vignette: Vignette; title: string }) {
  if (isEmpty(v)) return <ThumbnailPlaceholder title={title} />;
  const svg = render.card(boardScene(v), boardDerived(v), null, { W: THUMB_W, H: THUMB_H }, true);
  return (
    <div
      role="img"
      aria-label={title}
      className="block w-full overflow-hidden rounded-sm bg-surface-0 [&>svg]:h-auto [&>svg]:w-full"
      style={{ maxWidth: THUMB_W }}
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg ', '<svg aria-hidden="true" ') }}
    />
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
