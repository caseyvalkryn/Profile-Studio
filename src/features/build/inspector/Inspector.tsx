// Build workspace right column: the whole-scene inspector, ported from legacy/mockup-v3.html
// drawInspector onto the v6 document. Every section is always shown; the selected object's row is
// marked and expands with its fields. Each field is one undo step (see Row.tsx).
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { Events } from './Events';
import { Measures } from './Measures';
import { DataProducts, Purpose, Site, Telemetry } from './Profile';
import { Hint } from './Row';
import { Aircraft, Paths } from './Scene';
import { Systems } from './Systems';
import { Planes, Volumes } from './Volumes';

/** The right-column token (`--col-right`, legacy `.right`). */
export const INSPECTOR_WIDTH = 320;

export default function Inspector() {
  const doc = useDocument((s) => s.doc);
  const keys = useUi((s) => s.selectedKeys);
  const stack = useUi((s) => s.stack);
  const inStack = stack && keys.length === 1 && keys[0] === stack.key ? stack : null;

  return (
    <aside
      aria-label="Inspector"
      className="relative flex h-full w-col-right shrink-0 flex-col overflow-y-auto border-l border-surface-3 bg-surface-1 px-3 pt-3 pb-10 text-text"
    >
      {inStack ? (
        <span
          title="Click the same point again for the next object under it"
          className="absolute top-2 right-2.5 font-mono text-micro text-muted"
        >
          {inStack.n} of {inStack.m}
        </span>
      ) : null}
      {doc ? (
        <>
          <Purpose v={doc} />
          <Aircraft v={doc} />
          <Paths v={doc} />
          <Systems v={doc} />
          <Volumes v={doc} />
          <Planes v={doc} />
          <Events v={doc} />
          <Telemetry v={doc} />
          <DataProducts v={doc} />
          <Measures v={doc} />
          <Site v={doc} />
        </>
      ) : (
        <Hint>No profile.</Hint>
      )}
    </aside>
  );
}
