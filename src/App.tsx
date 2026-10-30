import { NavLink, Route, Routes } from 'react-router-dom';

const WORKSPACES = [
  { path: '/', name: 'Library' },
  { path: '/build', name: 'Build' },
  { path: '/results', name: 'Results' },
  { path: '/report', name: 'Report' },
] as const;

function Workspace({ name }: { name: string }) {
  return (
    <main className="flex flex-1 items-center justify-center text-muted" aria-label={name}>
      {name}
    </main>
  );
}

export function App() {
  return (
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
      </header>
      <Routes>
        {WORKSPACES.map((w) => (
          <Route key={w.path} path={w.path} element={<Workspace name={w.name} />} />
        ))}
      </Routes>
    </div>
  );
}
