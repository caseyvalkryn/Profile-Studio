// The Build workspace (spec section 7, Build). A thin top bar, the asset library on the left, the
// map (or the Elevation view) in the centre, the inspector on the right and the timeline along the
// bottom. The map takes all the space the panels leave (principle 5.1).
import { lazy, Suspense, useId } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { currentContext, execute, get, shortcutLabel } from '../../commands/registry';
import { useDocument } from '../../state/document';
import { useActiveRun, useRuns } from '../../state/runs';
import { useUi } from '../../state/ui';
import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import { focusRing } from '../../ui/focus';
import AssetsPanel from './assets/AssetsPanel';
import Inspector from './inspector/Inspector';
import ProfileView from './profile/ProfileView';
import Timeline from './timeline/Timeline';

// MapLibre is most of the Build code, so the map loads as its own chunk.
const MapView = lazy(() => import('./map/MapView'));

/**
 * The timeline panel: its 1 px top border, the 32 px control bar, the 20 px time axis and two
 * threat rows of 64 px (review 7.R F-08). More rows scroll under the sticky axis.
 */
export const TIMELINE_HEIGHT = 1 + 32 + 20 + 2 * 64;

/** Re-render on any store change a command's enable rule reads, then ask the rule. */
function useWhen(id: string): true | string {
  useDocument((s) => s.doc);
  useUi((s) => s.selectedKeys);
  useRuns((s) => s.results);
  useRuns((s) => s.sweep);
  const cmd = get(id);
  return cmd ? cmd.when(currentContext()) : `No command ${id}`;
}

/**
 * A top-bar button that runs one command. When the command cannot run, the button stays
 * focusable and its tooltip and description say why.
 */
function CommandButton({
  id,
  label,
  variant,
  pressed,
}: {
  id: string;
  label: string;
  variant?: 'quiet' | 'accent';
  pressed?: boolean;
}) {
  const ok = useWhen(id);
  const reasonId = useId();
  const cmd = get(id);
  const disabled = ok !== true;
  return (
    <Tooltip
      content={disabled ? ok : (cmd?.label ?? label)}
      shortcut={cmd ? shortcutLabel(cmd) : ''}
    >
      <button
        type="button"
        aria-disabled={disabled || undefined}
        aria-pressed={pressed}
        aria-describedby={disabled ? reasonId : undefined}
        onClick={() => {
          if (!disabled) execute(id);
        }}
        className={`inline-flex h-6 shrink-0 items-center rounded-sm px-2 text-xs select-none ${
          variant === 'accent'
            ? 'border border-accent bg-accent text-accent-text hover:opacity-90'
            : pressed
              ? 'bg-surface-2 text-text'
              : 'text-muted hover:bg-surface-2 hover:text-text'
        } ${disabled ? 'cursor-default opacity-50' : ''} ${focusRing}`}
      >
        {label}
        {disabled ? (
          <span id={reasonId} className="sr-only">
            {ok}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}

/** Run progress with a cancel, shown in place of nothing while a run is in flight. */
function RunProgress() {
  const run = useActiveRun();
  if (!run || run.status !== 'running') return null;
  const { done, total } = run.progress;
  return (
    <span className="flex items-center gap-1.5" role="status" aria-label="Run progress">
      <span className="font-mono text-xs text-muted tabular-nums">
        {done}/{total}
      </span>
      <Button
        size="sm"
        tooltip="Stop waiting for this run"
        onClick={() => useRuns.getState().cancel()}
      >
        Cancel
      </Button>
    </span>
  );
}

/**
 * After a run ends, says so and links to Results (review F-08). The note stays until the user
 * opens Results or edits the vignette (review FR-03); the runs store clears it on an edit, and
 * ResultsWorkspace clears it when it mounts (review 7.R F-05).
 */
function RunDone() {
  const run = useActiveRun();
  const noteKey = useRuns((s) => s.doneNoteKey);
  const docId = useDocument((s) => s.doc?.id);
  const runId = useDocument((s) => s.doc?.runs.find((r) => r.key === run?.key)?.id);
  const inRouter = useInRouterContext();
  // Only for a run of the open vignette (review 6 F-08).
  const shown =
    run?.status === 'done' && run.docId === docId && run.key === noteKey ? run.key : null;
  if (!shown) return null;
  const label = `${runId ? `Run ${runId}` : 'Run'} done`;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
      {label}
      {inRouter ? (
        <Link to="/results" className={`rounded-sm text-text underline ${focusRing}`}>
          View results
        </Link>
      ) : null}
    </span>
  );
}

/**
 * Sweep state for the open vignette, with a link to Results when it is done (review 6 F-02). The
 * done note follows the run-done rule in the runs store: an edit, undo or redo, or opening
 * Results, clears it (review 7.R F-12).
 */
function SweepStatus() {
  const sweep = useRuns((s) => s.sweep);
  const noteKey = useRuns((s) => s.sweepNoteKey);
  const docId = useDocument((s) => s.doc?.id);
  const inRouter = useInRouterContext();
  if (!sweep || sweep.docId !== docId) return null;
  if (sweep.status === 'running')
    return (
      <span
        className="text-xs whitespace-nowrap text-muted"
        role="status"
        aria-label="Sweep progress"
      >
        Sweep running
        {sweep.progress ? (
          <>
            {' '}
            <span className="font-mono tabular-nums">
              {sweep.progress.done}/{sweep.progress.total}
            </span>{' '}
            test points
          </>
        ) : null}
      </span>
    );
  if (sweep.status !== 'done' || sweep.key !== noteKey) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
      Sweep done
      {inRouter ? (
        <Link to="/results" className={`rounded-sm text-text underline ${focusRing}`}>
          View results
        </Link>
      ) : null}
    </span>
  );
}

function BuildBar() {
  const question = useDocument((s) => s.doc?.questions.find((q) => q.text.trim())?.text);
  const hasSweep = useDocument((s) => (s.doc?.sweep?.factors.length ?? 0) > 0);
  const units = useUi((s) => s.units);
  const view = useUi((s) => s.view);
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-surface-3 bg-surface-1 px-2">
      {question ? (
        <span className="min-w-0 flex-1 truncate text-xs text-muted" title={question}>
          {question}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <RunProgress />
      <RunDone />
      <CommandButton id="run.start" label="Run" variant="accent" />
      {hasSweep ? (
        <>
          <SweepStatus />
          <CommandButton id="run.sweep" label="Run sweep" />
        </>
      ) : null}
      <CommandButton id="view.units" label={units === 'nav' ? 'nm · ft · kt' : 'km · m · m/s'} />
      <div className="flex items-center gap-0.5" role="group" aria-label="View">
        <CommandButton id="view.plan" label="Plan" pressed={view === 'plan'} />
        <CommandButton id="view.elevation" label="Elevation" pressed={view === 'elevation'} />
      </div>
    </div>
  );
}

export default function BuildWorkspace() {
  const view = useUi((s) => s.view);
  // I and \ show and hide the side panels through `ui.panels` (legacy, review 9.1 F-04).
  const showList = useUi((s) => s.panels.list);
  const showInspector = useUi((s) => s.panels.inspector);
  return (
    <main aria-label="Build" className="flex min-h-0 flex-1 flex-col">
      <BuildBar />
      <div className="flex min-h-0 flex-1">
        {showList ? <AssetsPanel /> : null}
        <section aria-label="Map" className="relative min-w-0 flex-1 bg-surface-0">
          {view === 'elevation' ? (
            <ProfileView />
          ) : (
            <Suspense fallback={<div className="h-full w-full bg-surface-0" />}>
              <MapView />
            </Suspense>
          )}
        </section>
        {showInspector ? <Inspector /> : null}
      </div>
      <section
        aria-label="Timeline"
        style={{ height: TIMELINE_HEIGHT }}
        className="shrink-0 border-t border-surface-3 bg-surface-1"
      >
        <Timeline />
      </section>
    </main>
  );
}
