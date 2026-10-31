// The app frame (legacy `legacy/css/app.css` and `50-panels.js` slots): the top bar, then the
// columns: the rail (asset list, 232 px), the centre (the workspace over the strip) and the
// right column (inspector, 320 px). A slot renders only when a workspace gives it content and
// its `ui.panels` field is on. The overlay host takes popovers and the tip; the phone bottom
// sheet takes the side panels at 600 px and narrower. The shell also mounts the dialogs, the
// toast, the palette and the cheat sheet once.
import { useState, type ReactNode } from 'react';
import { useUi } from '../../state/ui';
import CommandHost from '../commands/CommandHost';
import ExportDialog from './ExportDialog';
import ImportDialog from './ImportDialog';
import Toast from './Toast';
import TopBar from './TopBar';
import './shell.css';

export type SheetTab = { id: string; label: string; content: ReactNode };

export type ShellProps = {
  status?: string | null;
  /** Left column content (Build's asset list). */
  rail?: ReactNode;
  /** Right column content (Build's inspector). */
  right?: ReactNode;
  /** Bottom strip under the centre (timeline, chart, readout). */
  strip?: ReactNode;
  /** Phone tabs: each opens the bottom sheet on its content. */
  sheet?: readonly SheetTab[];
  children: ReactNode;
};

/** The phone tab bar and bottom sheet (legacy `.app-tabs` and `#sheet`). */
function BottomSheet({ tabs }: { tabs: readonly SheetTab[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const tab = tabs.find((t) => t.id === open);
  return (
    <>
      <div className="ps-tabs" role="group" aria-label="Panels">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className="ps-btn"
            aria-pressed={open === t.id}
            onClick={() => setOpen(open === t.id ? null : t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={`ps-sheet${tab ? ' open' : ''}${full ? ' full' : ''}`} aria-hidden={!tab}>
        <button
          type="button"
          className="ps-sheet-handle"
          aria-label={full ? 'Half height' : 'Full height'}
          onClick={() => setFull(!full)}
        />
        <div className="ps-sheet-body">{tab?.content}</div>
      </div>
    </>
  );
}

export default function Shell({ status, rail, right, strip, sheet, children }: ShellProps) {
  const panels = useUi((s) => s.panels);
  return (
    <div className="ps-app" data-tabs={sheet?.length ? '' : undefined}>
      {panels.topbar ? <TopBar status={status} /> : null}
      <div className="ps-cols">
        {rail && panels.list ? (
          <aside className="ps-rail" aria-label="Asset list">
            {rail}
          </aside>
        ) : null}
        <div className="ps-centre">
          <div className="ps-main">{children}</div>
          {strip && panels.timeline ? <div className="ps-strip">{strip}</div> : null}
        </div>
        {right && panels.inspector ? (
          <aside className="ps-right" aria-label="Inspector">
            {right}
          </aside>
        ) : null}
      </div>
      <div className="ps-overlay" id="ps-overlay" />
      {sheet?.length ? <BottomSheet tabs={sheet} /> : null}
      <ExportDialog />
      <ImportDialog />
      <Toast />
      <CommandHost />
    </div>
  );
}

/** Brief until lane 9.4 ports it. */
export function BriefPlaceholder() {
  return (
    <main
      aria-label="Brief"
      className="flex flex-1 flex-col items-center justify-center bg-surface-0 text-sm text-muted"
    >
      <p className="m-0">Brief arrives in lane 9.4.</p>
    </main>
  );
}
