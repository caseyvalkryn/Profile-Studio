import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { registerCommands } from './commands/commands';
import { bindKeys } from './commands/keys';
import BuildWorkspace from './features/build/BuildWorkspace';
import { openStartVignette } from './features/build/devVignette';
import CommandHost from './features/commands/CommandHost';
import { startAutosave } from './state/persist';
import { TooltipProvider } from './ui/Tooltip';

registerCommands();

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
        <Routes>
          {WORKSPACES.map((w) => (
            <Route
              key={w.path}
              path={w.path}
              element={w.name === 'Build' ? <BuildWorkspace /> : <Placeholder name={w.name} />}
            />
          ))}
        </Routes>
        <CommandHost />
      </div>
    </TooltipProvider>
  );
}
