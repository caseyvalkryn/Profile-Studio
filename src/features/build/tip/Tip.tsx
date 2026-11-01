// The hover tip (legacy/js/51-panel-tip.js): after 400 ms of a stable hover on a record it shows
// the id, the name and one or two facts. It follows the pointer and flips from the edges. The
// board lane passes the pointer; the tip reads ui.hoverKey and the document.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePreview, useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { tipContent } from './content';
import { placeTip, type Point, type Rect } from './place';

export const TIP_DELAY_MS = 400;

export type TipProps = {
  /** The pointer in viewport pixels, or null when it is off the board. */
  pointer: Point | null;
  /** The area the tip stays inside; the window by default. */
  bounds?: Rect;
};

export function Tip({ pointer, bounds }: TipProps) {
  const hoverKey = useUi((s) => s.hoverKey);
  const units = useUi((s) => s.units);
  const tS = useUi((s) => s.tS);
  const doc = useDocument((s) => s.doc);
  const preview = usePreview();
  const [shownKey, setShownKey] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // A new hover key hides the tip and restarts the 400 ms timer; the same key keeps it.
  // The cleanup clears the shown key, so a return to an earlier key waits again.
  useEffect(() => {
    if (!hoverKey) return;
    const id = setTimeout(() => setShownKey(hoverKey), TIP_DELAY_MS);
    return () => {
      clearTimeout(id);
      setShownKey(null);
    };
  }, [hoverKey]);

  const content =
    shownKey && shownKey === hoverKey && doc ? tipContent(doc, preview, shownKey, units, tS) : null;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !pointer) return;
    const rect = bounds ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const p = placeTip(rect, pointer, { w: el.offsetWidth || 200, h: el.offsetHeight || 40 });
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  });

  if (!content || !pointer) return null;
  const { head } = content;
  const id = head.id ? <span className="font-mono">{head.id}</span> : null;
  return (
    <div
      ref={box}
      role="tooltip"
      className="pointer-events-none fixed top-0 left-0 z-[70] max-w-[300px] rounded-sm border border-surface-3 bg-surface-1 px-2 py-1.5 text-xs text-text shadow-md"
    >
      <div className="font-medium">
        {head.pre ? (
          <>
            {head.name} {id}
          </>
        ) : (
          <>
            {id}
            {id && head.name ? ' ' : ''}
            {head.name}
          </>
        )}
      </div>
      {content.rows.map((r, i) => (
        <div
          key={i}
          className={
            r.warn ? 'whitespace-normal text-state-warning' : 'whitespace-nowrap text-muted'
          }
        >
          {r.parts
            ? r.parts.map((p, j) => (
                <span key={j} className={j % 2 ? 'font-mono text-text' : ''}>
                  {j ? ' ' : ''}
                  {p}
                </span>
              ))
            : r.text}
        </div>
      ))}
    </div>
  );
}
