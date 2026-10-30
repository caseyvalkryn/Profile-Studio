import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { registerCommands } from './commands/commands';
import { bindKeys } from './commands/keys';
import BuildWorkspace from './features/build/BuildWorkspace';
import { openStartVignette } from './features/build/devVignette';
import CommandHost from './features/commands/CommandHost';
import { MapSnapshot } from './features/shared/MapSnapshot';
import { useDocument } from './state/document';
import { startAutosave } from './state/persist';
import { TooltipProvider } from './ui/Tooltip';

registerCommands();

const ResultsWorkspace = lazy(() => import('./features/results/ResultsWorkspace'));
const ReportWorkspace = lazy(() => import('./features/report/ReportWorkspace'));
const ReportChart = lazy(() => import('./features/results/ReportChart'));

const WORKSPACES = [
  { path: '/', name: 'Library' },
  { path: '/build', name: 'Build' },
  { path: '/results', name: 'Results' },
  { path: '/report', name: 'Report' },
] as const;

function Placeholder({ name }: { name: string }) {
  return (
    <main className="flex flex-1 items-center justify-center text-muted" aria-label={name}>
      {name}
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

function workspace(name: string): ReactNode {
  if (name === 'Build') return <BuildWorkspace />;
  if (name === 'Results') return <ResultsWorkspace />;
  if (name === 'Report') return <Report />;
  return <Placeholder name={name} />;
}

/** Root effects: keys, autosave and the start-up vignette. Returns the autosave status line. */
function useRootEffects(): string | null {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => bindKeys(window), []);
  useEffect(
    () =>
      startAutosave(undefined, () =>
        setStatus('Autosave failed. Changes since the last save are kept in this tab only.'),
      ),
    [],
  );
  useEffect(() => {
    void openStartVignette();
  }, []);
  return status;
}

export function App() {
  const status = useRootEffects();
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <header className="flex h-9 shrink-0 items-center gap-4 border-b border-surface-3 bg-surface-1 px-3">
          <span className="text-sm font-medium">Profile Studio</span>
          <nav className="flex h-full items-stretch gap-1" aria-label="Workspaces">
            {WORKSPACES.map((w) => (
              <NavLink
                key={w.path}
                to={w.path}
                end
                className={({ isActive }) =>
                  `flex items-center border-b-2 px-2 text-sm ${
                    isActive
                      ? 'border-accent text-text'
                      : 'border-transparent text-muted hover:text-text'
                  }`
                }
              >
                {w.name}
              </NavLink>
            ))}
          </nav>
          {status ? (
            <span role="status" className="ml-auto truncate text-xs text-muted">
              {status}
            </span>
          ) : null}
        </header>
        <Suspense fallback={<Loading />}>
          <Routes>
            {WORKSPACES.map((w) => (
              <Route key={w.path} path={w.path} element={workspace(w.name)} />
            ))}
          </Routes>
        </Suspense>
        <CommandHost />
      </div>
    </TooltipProvider>
  );
}
