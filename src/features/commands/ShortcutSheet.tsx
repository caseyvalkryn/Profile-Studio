// The cheat sheet (?), legacy `51-panel-help.js`: a non-modal panel on the right with the key
// table of the current workspace, generated from the registry in legacy order (`sheet.ts`).
// Escape closes it through edit.escape, the one Escape owner. The palette shows the same
// `shortcutLabel`, so the two always agree (acceptance 12.10).
import { useEffect, useRef } from 'react';
import { useUi, type Workspace } from '../../state/ui';
import { sheetRows } from './sheet';

export const WORKSPACE_NAMES: Record<Workspace, string> = {
  library: 'Library',
  build: 'Build',
  brief: 'Brief',
};

export const sheetTitle = (w: Workspace) => `Keys in ${WORKSPACE_NAMES[w]}`;

export default function ShortcutSheet() {
  const open = useUi((s) => s.shortcutsOpen);
  const workspace = useUi((s) => s.workspace);
  const closeBtn = useRef<HTMLButtonElement>(null);
  // Legacy focuses Close when the sheet opens, so Enter or Space closes it from the keyboard.
  useEffect(() => {
    if (open) closeBtn.current?.focus();
  }, [open]);
  if (!open) return null;
  const rows = sheetRows(workspace);
  const close = () => useUi.getState().setShortcutsOpen(false);
  return (
    <div className="hp-pop" role="dialog" aria-modal="false" aria-labelledby="hp-title">
      <div className="hp-head">
        <h2 id="hp-title" className="ps-t-title">
          {sheetTitle(workspace)}
        </h2>
        <button type="button" className="ps-btn quiet" ref={closeBtn} onClick={close}>
          Close
        </button>
      </div>
      <div className="hp-body">
        <table className="hp-tbl">
          <tbody>
            {rows.map((r) => (
              <tr key={r.ids.join(' ')}>
                <td className="hp-k ps-t-data">{r.keys}</td>
                <td className="hp-l ps-t-body">{r.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ps-hint" style={{ marginTop: 12 }}>
          Press ? or Escape to close this sheet.
        </p>
      </div>
    </div>
  );
}
