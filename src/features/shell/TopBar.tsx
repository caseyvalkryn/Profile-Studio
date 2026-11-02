// The top bar (legacy `51-panel-topbar.js`, spec section 7): brand, the workspace segment, the
// New split button, the profile name with inline rename, id, undo and redo with the pending
// label, Export, Import, the theme control, Help and the autosave status line. Every button runs
// a registry command, so the bar, the keys and the palette do the same thing. On the Library
// route the Library screen has its own New, Import and Export, so the bar leaves them out (one
// of each per screen, review 9.1 F-20).
import { PanelLeft, PanelRight } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { currentContext, execute, get, shortcutLabel } from '../../commands/registry';
import { useDocument } from '../../state/document';
import { useUi, type Theme } from '../../state/ui';
import { consumeNameFocus, consumeRoute, useLibraryRequests } from '../library/newProfile';
import { Menu } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { toMenuItem } from '../commands/adapter';

/** The three workspaces, in spec section 7 order. */
export const WORKSPACES = [
  { path: '/', name: 'Library' },
  { path: '/build', name: 'Build' },
  { path: '/brief', name: 'Brief' },
] as const;

export const THEME_LABEL: Record<Theme, string> = {
  auto: 'Theme auto',
  light: 'Theme light',
  dark: 'Theme dark',
};

/** Undo and redo titles (legacy): "Undo: <label>" or "Nothing to undo". */
export const undoTitle = (label: string | undefined) =>
  label ? `Undo: ${label}` : 'Nothing to undo';
export const redoTitle = (label: string | undefined) =>
  label ? `Redo: ${label}` : 'Nothing to redo';

/** Re-render on the store fields an enable rule reads, then ask the rule. */
function useWhen(id: string): true | string {
  useDocument((s) => s.doc);
  useDocument((s) => s.past.length + s.future.length);
  useUi((s) => s.selectedKeys);
  const cmd = get(id);
  return cmd ? cmd.when(currentContext()) : `No command ${id}`;
}

/**
 * A bar button that runs one command. A disabled one stays focusable (aria-disabled) so its
 * tooltip can say why.
 */
function BarButton({
  id,
  children,
  quiet,
  tip,
  className = '',
  pressed,
  ariaLabel,
}: {
  id: string;
  children: ReactNode;
  quiet?: boolean;
  tip?: string;
  className?: string;
  pressed?: boolean;
  ariaLabel?: string;
}) {
  const ok = useWhen(id);
  const cmd = get(id);
  const disabled = ok !== true;
  return (
    <Tooltip
      content={tip ?? (disabled ? ok : (cmd?.label ?? ''))}
      shortcut={cmd ? shortcutLabel(cmd) : ''}
      side="bottom"
    >
      <button
        type="button"
        className={`ps-btn${quiet ? ' quiet' : ''} ${className}`}
        aria-disabled={disabled || undefined}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) execute(id);
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** New, with a menu arrow for "From template" (spec section 7, New). Both run by command id. */
function NewSplit() {
  const ok = useWhen('profile.new');
  const fromTemplate = get('profile.newFromTemplate');
  const ctx = currentContext();
  const items = fromTemplate
    ? [
        {
          ...toMenuItem(fromTemplate, ctx, { pointer: null, onArg: () => {} }),
          label: 'From template',
        },
      ]
    : [];
  return (
    <span className="tb-split">
      <BarButton id="profile.new" tip={ok === true ? 'New profile' : ok}>
        New
      </BarButton>
      <Menu
        items={items}
        align="start"
        trigger={
          <button type="button" className="ps-btn" aria-label="New from template">
            <span aria-hidden="true">▾</span>
          </button>
        }
      />
    </span>
  );
}

/** The profile name, renamed in place. Enter commits, Escape reverts; one commit is one undo step. */
function ProfileName() {
  const name = useDocument((s) => s.doc?.name);
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // New profile asks for the name field (spec section 7, New). The request is consumed once, so
  // a later rename or undo leaves focus where it is (review 9.1 F-02).
  const nameFocus = useLibraryRequests((s) => s.nameFocus);
  useEffect(() => {
    if (!nameFocus) return;
    input.current?.focus();
    input.current?.select();
    consumeNameFocus();
  }, [nameFocus]);
  const commit = () => {
    const v = draft?.trim();
    setDraft(null);
    if (name !== undefined && v && v !== name)
      useDocument.getState().edit('Rename profile', (d) => {
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
    <>
      <label className="ps-sr" htmlFor="tb-name">
        Profile name
      </label>
      <input
        id="tb-name"
        ref={input}
        className="ps-input ps-t-title tb-name"
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={name === undefined}
        value={draft ?? name ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </>
  );
}

/**
 * The mono id beside the name (mockup lines 201 and 377: "PROF-1 v3"). The version is not on the
 * record yet; lane 10.5 adds `version` and the orchestrator appends " v<n>" inside this span.
 */
/** "PROF-1 v3": the id and the version counter, as the mockup's `p-id` (line 377). */
function ProfileId() {
  const id = useDocument((s) => s.doc?.id);
  const version = useDocument((s) => s.doc?.version);
  if (id === undefined) return null;
  return (
    <span className="tb-id">
      {id} v{version ?? 1}
    </span>
  );
}

/**
 * A command with no router (Cmd+N, the palette) leaves a route request; the bar takes it once and
 * navigates (review 9.1 F-01). The effect depends on the request only: `navigate` changes with
 * every location, and re-running on it pinned the router to the requested path.
 */
function useRouteRequests() {
  const navigate = useNavigate();
  const route = useLibraryRequests((s) => s.route);
  useEffect(() => {
    const r = route && consumeRoute();
    if (r) void navigate(r.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [route]);
}

export default function TopBar({ status }: { status?: string | null }) {
  useRouteRequests();
  const onLibrary = useLocation().pathname === '/';
  const undoLabel = useDocument((s) => s.past[s.past.length - 1]?.label);
  const redoLabel = useDocument((s) => s.future[0]?.label);
  const theme = useUi((s) => s.theme);
  const help = useUi((s) => s.shortcutsOpen);
  const onBrief = useLocation().pathname === '/brief';
  const listOpen = useUi((s) => s.panels.list);
  const inspectorOpen = useUi((s) => s.panels.inspector);
  return (
    <header className="ps-top">
      <div className="tb-bar">
        <span className="tb-brand ps-t-title">Profile Studio</span>
        <nav className="ps-seg" aria-label="Workspaces">
          {WORKSPACES.map((w) => (
            <NavLink key={w.path} to={w.path} end className="ps-btn">
              {w.name}
            </NavLink>
          ))}
        </nav>
        {onLibrary ? null : <NewSplit />}
        <div className="tb-prof">
          <ProfileName />
          <ProfileId />
        </div>
        <div className="tb-acts">
          {status ? (
            <span role="status" className="tb-status ps-t-sub" title={status}>
              {status}
            </span>
          ) : null}
          <BarButton id="edit.undo" quiet className="tb-undo" tip={undoTitle(undoLabel)}>
            {/* spec section 8: the button names the pending step (review 10.R N-14) */}
            <span className="truncate">{undoLabel ? undoTitle(undoLabel) : 'Undo'}</span>
          </BarButton>
          <BarButton id="edit.redo" quiet className="tb-redo" tip={redoTitle(redoLabel)}>
            <span className="truncate">{redoLabel ? redoTitle(redoLabel) : 'Redo'}</span>
          </BarButton>
          {onLibrary ? null : (
            <>
              <BarButton id="file.export" className="tb-export">
                Export
              </BarButton>
              <BarButton id="file.import" className="tb-import">
                Import
              </BarButton>
            </>
          )}
          {/* The side panels, one click each (2026-11-02): the asset list in Build; the
              inspector in Build, which is the notes panel in Brief. */}
          {onLibrary || onBrief ? null : (
            <BarButton
              id="panel.list"
              quiet
              pressed={listOpen}
              ariaLabel="Asset list"
              className="tb-panel [&>svg]:size-4"
            >
              <PanelLeft aria-hidden="true" />
            </BarButton>
          )}
          {onLibrary ? null : (
            <BarButton
              id="panel.inspector"
              quiet
              pressed={inspectorOpen}
              ariaLabel={onBrief ? 'Notes panel' : 'Inspector'}
              tip={onBrief ? 'Notes panel open or closed' : undefined}
              className="tb-panel [&>svg]:size-4"
            >
              <PanelRight aria-hidden="true" />
            </BarButton>
          )}
          <BarButton id="view.theme" quiet className="tb-theme">
            {THEME_LABEL[theme]}
          </BarButton>
          <BarButton id="help.shortcuts" quiet pressed={help} ariaLabel="Help">
            ?
          </BarButton>
        </div>
      </div>
    </header>
  );
}
