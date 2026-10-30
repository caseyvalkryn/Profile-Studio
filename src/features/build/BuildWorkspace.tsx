// The Build workspace (spec section 7, Build). A thin top bar, the asset library on the left, the
// map (or the profile) in the centre, the inspector on the right and the timeline along the
// bottom. The map takes all the space the panels leave (principle 5.1).
import { lazy, Suspense, useEffect, useId, useState, type KeyboardEvent } from 'react';
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

export const TIMELINE_HEIGHT = 160;

/** Re-render on any store change a command's enable rule reads, then ask the rule. */
function useWhen(id: string): true | string {
  useDocument((s) => s.doc);
  useUi((s) => s.selectedKeys);
  useRuns((s) => s.results);
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

/** The vignette name, edited in place. One commit is one undo step. */
function NameField() {
  const name = useDocument((s) => s.doc?.name);
  const [draft, setDraft] = useState<string | null>(null);
  if (name === undefined) return <span className="text-sm text-muted">No vignette open</span>;
  const commit = () => {
    const v = draft?.trim();
    setDraft(null);
    if (v && v !== name)
      useDocument.getState().edit('Rename vignette', (d) => {
        d.name = v;
      });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(null);
    }
  };
  return (
    <input
      aria-label="Vignette name"
      value={draft ?? name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      size={Math.max(8, Math.min(40, (draft ?? name).length + 1))}
      className={`h-6 min-w-0 rounded-sm bg-transparent px-1 text-sm font-medium text-text hover:bg-surface-2 ${focusRing}`}
    />
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

/** How long the "run done" note stays in the top bar. */
export const RUN_DONE_MS = 6000;

/** After a run ends, says so for a few seconds and links to Results (review F-08). */
function RunDone() {
  const run = useActiveRun();
  const runId = useDocument((s) => s.doc?.runs.find((r) => r.key === run?.key)?.id);
  const inRouter = useInRouterContext();
  const doneKey = run?.status === 'done' ? run.key : null;
  const [shown, setShown] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  if (doneKey !== seen) {
    setSeen(doneKey);
    setShown(doneKey);
  }
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), RUN_DONE_MS);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown || shown !== doneKey) return null;
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

function BuildBar() {
  const question = useDocument((s) => s.doc?.questions.find((q) => q.text.trim())?.text);
  const units = useUi((s) => s.units);
  const view = useUi((s) => s.view);
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-surface-3 bg-surface-1 px-2">
      <NameField />
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
      <CommandButton id="view.units" label={units === 'nav' ? 'nm · ft · kt' : 'km · m · m/s'} />
      <div className="flex items-center gap-0.5" role="group" aria-label="View">
        <CommandButton id="view.plan" label="Plan" pressed={view === 'plan'} />
        <CommandButton id="view.profile" label="Profile" pressed={view === 'profile'} />
      </div>
    </div>
  );
}

export default function BuildWorkspace() {
  const view = useUi((s) => s.view);
  return (
    <main aria-label="Build" className="flex min-h-0 flex-1 flex-col">
      <BuildBar />
      <div className="flex min-h-0 flex-1">
        <AssetsPanel />
        <section aria-label="Map" className="relative min-w-0 flex-1 bg-surface-0">
          {view === 'profile' ? (
            <ProfileView />
          ) : (
            <Suspense fallback={<div className="h-full w-full bg-surface-0" />}>
              <MapView />
            </Suspense>
          )}
        </section>
        <Inspector />
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
