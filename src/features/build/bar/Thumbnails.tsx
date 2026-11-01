// The two cameras not in view (mockup `.thumbs`, line 392): each is render.scene in thumb mode at
// 300 x 170 over the board's document, yaw, pitch, reference, layers and time. A click switches
// ui.view. The svg is memoised on the document, time, layers and camera, so a selection or a
// hover does not re-render it.
import { useMemo } from 'react';
import { VIEW_TO_CAM, render } from '../../../board';
import { useDocument } from '../../../state/document';
import { useUi, type View } from '../../../state/ui';
import { focusRing } from '../../../ui/focus';
import { boardDerived, boardScene } from '../board/derived';
import { useBoard } from '../board/store';

export const THUMB_SIZE = { W: 300, H: 170 } as const;

export const VIEW_LABELS: Record<View, string> = {
  plan: 'Plan',
  elevation: 'Elevation',
  '3d': '3D',
};

const ORDER: View[] = ['plan', 'elevation', '3d'];

function Thumb({ view }: { view: View }) {
  const doc = useDocument((s) => s.doc);
  const t = useUi((s) => (s.timeOn ? s.tS : null));
  const units = useUi((s) => s.units);
  const elevationMode = useUi((s) => s.elevationMode);
  const yaw = useBoard((s) => s.yaw);
  const pitch = useBoard((s) => s.pitch);
  const ref = useBoard((s) => s.ref);
  const layers = useBoard((s) => s.layers);

  const svg = useMemo(() => {
    if (!doc) return '';
    const out = render.scene(
      boardScene(doc),
      { proj: VIEW_TO_CAM[view], yaw, pitch, ref, layers, t, units, elevationMode, focus: [] },
      THUMB_SIZE,
      { derived: boardDerived(doc), thumb: true, edit: false },
    ).svg;
    return out.replace('<svg', '<svg aria-hidden="true" focusable="false"');
  }, [doc, view, yaw, pitch, ref, layers, t, units, elevationMode]);

  const label = VIEW_LABELS[view];
  return (
    <button
      type="button"
      aria-label={`${label} thumbnail`}
      data-testid="thumb"
      data-view={view}
      onClick={() => useUi.getState().setView(view)}
      className={`flex min-w-0 flex-col overflow-hidden rounded border border-surface-3 bg-surface-1 text-left ${focusRing}`}
    >
      <span
        className="block aspect-[300/170] w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <span className="border-t border-surface-3 px-2 py-1 text-micro font-medium text-muted">
        {label}
      </span>
    </button>
  );
}

export default function Thumbnails() {
  const current = useUi((s) => s.view);
  return (
    <div
      role="group"
      aria-label="Other views"
      className="mt-2.5 grid shrink-0 grid-cols-3 gap-2.5"
      data-testid="thumbs"
    >
      {ORDER.filter((v) => v !== current).map((v) => (
        <Thumb key={v} view={v} />
      ))}
    </div>
  );
}
