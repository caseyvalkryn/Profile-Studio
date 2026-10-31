// The top bar (legacy `51-panel-topbar.js`, spec section 7): brand, the workspace segment, the
// New split button, the profile name with inline rename, id, undo and redo with the pending
// label, Export, Import, the theme control, Help and the autosave status line. Every button runs
// a registry command, so the bar, the keys and the palette do the same thing.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { currentContext, execute, get, shortcutLabel } from '../../commands/registry';
import { useDocument } from '../../state/document';
import { useUi, type Theme } from '../../state/ui';
import { useLibraryRequests } from '../library/newProfile';
import { Menu } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { toMenuItem } from '../commands/adapter';

/** The five workspaces, in spec section 7 order. */
export const WORKSPACES = [
  { path: '/', name: 'Library' },
  { path: '/build', name: 'Build' },
  { path: '/results', name: 'Results' },
  { path: '/report', name: 'Report' },
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
  // New profile asks for the name field (spec section 7, New). The count rises per request.
  const nameFocus = useLibraryRequests((s) => s.nameFocus);
  useEffect(() => {
    if (nameFocus && name !== undefined) {
      input.current?.focus();
      input.current?.select();
    }
  }, [nameFocus, name]);
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

function ProfileId() {
  const doc = useDocument((s) => s.doc);
  if (!doc) return null;
  // Legacy shows "<id> v<n>"; the record has a version only once the domain carries one.
  const v = (doc as { v?: unknown }).v;
  return (
    <span className="ps-t-id" style={{ color: 'var(--ps-t2)' }}>
      {doc.id}
      {typeof v === 'number' ? ` v${v}` : ''}
    </span>
  );
}

/** A command with no router (Cmd+N, the palette) leaves a route request; the bar follows it. */
function useRouteRequests() {
  const navigate = useNavigate();
  const route = useLibraryRequests((s) => s.route);
  useEffect(() => {
    if (route) navigate(route.path);
  }, [route, navigate]);
}

export default function TopBar({ status }: { status?: string | null }) {
  useRouteRequests();
  const undoLabel = useDocument((s) => s.past[s.past.length - 1]?.label);
  const redoLabel = useDocument((s) => s.future[0]?.label);
  const theme = useUi((s) => s.theme);
  const help = useUi((s) => s.shortcutsOpen);
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
        <NewSplit />
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
            Undo
          </BarButton>
          <BarButton id="edit.redo" quiet className="tb-redo" tip={redoTitle(redoLabel)}>
            Redo
          </BarButton>
          <BarButton id="file.export" className="tb-export">
            Export
          </BarButton>
          <BarButton id="file.import" className="tb-import">
            Import
          </BarButton>
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
