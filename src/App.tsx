import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { registerCommands } from './commands/commands';
import { bindKeys } from './commands/keys';
import BuildWorkspace from './features/build/BuildWorkspace';
import LibraryScreen from './features/library/LibraryScreen';
import { TEMPLATES } from './domain/templates';
import { MapSnapshot } from './features/shared/MapSnapshot';
import Shell, { BriefPlaceholder } from './features/shell/Shell';
import { bindTheme } from './features/shell/theme';
import { WORKSPACES } from './features/shell/TopBar';
import { useDocument } from './state/document';
import { listVignettes, loadVignette, startAutosave } from './state/persist';
import { useUi, type Workspace as WorkspaceId } from './state/ui';
import { focusRing } from './ui/focus';
import { TooltipProvider } from './ui/Tooltip';

registerCommands();

const ResultsWorkspace = lazy(() => import('./features/results/ResultsWorkspace'));
const ReportWorkspace = lazy(() => import('./features/report/ReportWorkspace'));
const ReportChart = lazy(() => import('./features/results/ReportChart'));

type WorkspaceName = (typeof WORKSPACES)[number]['name'];

/** Build, Results and Report need an open profile. Without one, point to the Library. */
function NoProfile({ name }: { name: string }) {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-2 bg-surface-0 text-sm text-muted"
      aria-label={name}
    >
      <p className="m-0">No profile open.</p>
      <Link to="/" className={`text-text underline hover:text-accent ${focusRing}`}>
        Open one from the Library
      </Link>
    </main>
  );
}

function Loading() {
  return <div className="flex-1 bg-surface-0" />;
}

const renderChart = (measureId: string, runKey: string) => (
  <Suspense fallback={null}>
    <ReportChart measureId={measureId} runKey={runKey} />
  </Suspense>
);

function ReportMap() {
  const doc = useDocument((s) => s.doc);
  return doc ? <MapSnapshot vignette={doc} /> : null;
}

const renderMap = () => <ReportMap />;

function Report() {
  return (
    <main className="min-h-0 flex-1 overflow-auto bg-surface-0" aria-label="Report">
      <ReportWorkspace renderChart={renderChart} renderMap={renderMap} />
    </main>
  );
}

function Workspace({ name, ready }: { name: WorkspaceName; ready: boolean }) {
  const hasDoc = useDocument((st) => st.doc !== null);
  // The route sets the workspace, so keys, the palette and the sheet follow it.
  useEffect(() => useUi.getState().setWorkspace(name.toLowerCase() as WorkspaceId), [name]);
  if (name === 'Library') return <LibraryScreen templates={TEMPLATES} />;
  if (name === 'Brief') return <BriefPlaceholder />;
  if (!hasDoc) return ready ? <NoProfile name={name} /> : <Loading />;
  if (name === 'Build') return <BuildWorkspace />;
  if (name === 'Results') return <ResultsWorkspace />;
  return <Report />;
}

/**
 * Open the newest stored profile, if any, unless one is already open. Storage can fail
 * (private window, tests); then nothing opens and the Library is the start.
 */
async function openNewestStored(): Promise<void> {
  try {
    const newest = (await listVignettes())[0];
    const v = newest ? await loadVignette(newest.id) : null;
    if (v && !useDocument.getState().doc) useDocument.getState().open(v);
  } catch {
    // No IndexedDB: start with nothing open.
  }
}

/**
 * Root effects: keys, the theme, autosave and the start-up profile. Returns the autosave status line and
 * whether the start-up read has finished.
 */
function useRootEffects(): { status: string | null; ready: boolean } {
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => bindKeys(window), []);
  useEffect(() => bindTheme(), []);
  useEffect(
    () =>
      startAutosave(undefined, () =>
        setStatus('Autosave failed. Changes since the last save are kept in this tab only.'),
      ),
    [],
  );
  useEffect(() => {
    let live = true;
    void openNewestStored().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return { status, ready };
}

export function App() {
  const { status, ready } = useRootEffects();
  return (
    <TooltipProvider>
      <Shell status={status}>
        <Suspense fallback={<Loading />}>
          <Routes>
            {WORKSPACES.map((w) => (
              <Route
                key={w.path}
                path={w.path}
                element={<Workspace name={w.name} ready={ready} />}
              />
            ))}
          </Routes>
        </Suspense>
      </Shell>
    </TooltipProvider>
  );
}
