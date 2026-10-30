// Asset library, the Build workspace's left panel (spec sections 7 and 8, Place).
import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { THREAT_GROUPS, type ThreatGroup } from '../../../domain/catalog';
import { useUi } from '../../../state/ui';
import { Button } from '../../../ui/Button';
import { Tooltip } from '../../../ui/Tooltip';
import { focusRing } from '../../../ui/focus';
import { startAssetDrag } from './dnd';
import {
  filterLibrary,
  itemTip,
  LIBRARY,
  sameArmed,
  threatSummary,
  type GroupId,
  type LibraryItem,
} from './library';

export type AssetsPanelProps = {
  /** Controlled collapse. Leave unset to let the panel keep its own state. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

const svg = (d: ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden
  >
    {d}
  </svg>
);

const GROUP_ICONS: Record<GroupId, ReactNode> = {
  threats: svg(<path d="M8 2 14 13H2Z" />),
  sensors: svg(
    <>
      <circle cx="8" cy="8" r="1.5" />
      <path d="M4 4a6 6 0 0 0 0 8M12 4a6 6 0 0 1 0 8" />
    </>,
  ),
  effectors: svg(
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 1v4M8 11v4M1 8h4M11 8h4" />
    </>,
  ),
  nodes: svg(<rect x="3" y="3" width="10" height="10" rx="1" />),
  areas: svg(<path d="M3 4 12 2 14 11 5 14Z" strokeDasharray="2 2" />),
};

function AssetRow({ item }: { item: LibraryItem }) {
  const units = useUi((s) => s.units);
  const armed = useUi((s) => sameArmed(s.armed, item.armed));

  const toggle = () => {
    const ui = useUi.getState();
    if (armed) {
      ui.setArmed(null);
      ui.setTool('select');
    } else {
      ui.setArmed(item.armed);
      ui.setTool(item.group === 'threats' ? 'path' : 'place');
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };
  const onDragStart = (e: DragEvent) => startAssetDrag(e.dataTransfer, item.payload, item.chip);
  const a = item.threat;

  return (
    <Tooltip content={itemTip(item, units)} side="right">
      <div
        role="button"
        tabIndex={0}
        draggable
        aria-pressed={armed}
        data-asset={item.key}
        onClick={toggle}
        onKeyDown={onKeyDown}
        onDragStart={onDragStart}
        className={`flex cursor-grab flex-col gap-0.5 rounded-sm border-l-2 px-2 py-1 text-sm select-none ${
          armed ? 'border-accent bg-surface-2' : 'border-transparent hover:bg-surface-2'
        } ${focusRing}`}
      >
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {a && !a.rf ? (
            <span role="img" aria-label="RF silent" className="font-mono text-[10px] text-muted">
              ⌀RF
            </span>
          ) : null}
          {a ? (
            <span className="rounded-sm border border-surface-3 px-1 font-mono text-[10px] text-muted">
              G{a.group}
            </span>
          ) : null}
        </span>
        {a ? (
          <span className="font-mono text-[11px] text-muted">{threatSummary(a, units)}</span>
        ) : null}
      </div>
    </Tooltip>
  );
}

function ItemList({ id, items }: { id: GroupId; items: LibraryItem[] }) {
  if (id !== 'threats')
    return (
      <>
        {items.map((i) => (
          <AssetRow key={i.key} item={i} />
        ))}
      </>
    );
  const groups = ([1, 2, 3] as ThreatGroup[])
    .map((g) => ({ g, rows: items.filter((i) => i.threat?.group === g) }))
    .filter((x) => x.rows.length > 0);
  return (
    <>
      {groups.map(({ g, rows }) => (
        <div key={g} role="group" aria-label={`Group ${g}`}>
          <div
            className="px-2 pt-1 text-[11px] text-muted"
            title={`${THREAT_GROUPS[g].weight}, ${THREAT_GROUPS[g].speed}`}
          >
            Group {g}
          </div>
          {rows.map((i) => (
            <AssetRow key={i.key} item={i} />
          ))}
        </div>
      ))}
    </>
  );
}

export default function AssetsPanel({
  collapsed: collapsedProp,
  onCollapsedChange,
}: AssetsPanelProps) {
  const [ownCollapsed, setOwnCollapsed] = useState(false);
  const collapsed = collapsedProp ?? ownCollapsed;
  const setCollapsed = (c: boolean) => {
    setOwnCollapsed(c);
    onCollapsedChange?.(c);
  };
  const [query, setQuery] = useState('');
  const [flyout, setFlyout] = useState<GroupId | null>(null);
  const armed = useUi((s) => s.armed);
  const armedLabel = armed
    ? LIBRARY.flatMap((g) => g.items).find((i) => sameArmed(armed, i.armed))?.label
    : undefined;

  // Escape belongs to the key dispatcher (edit.escape disarms). Here it only closes the flyout,
  // and the key still bubbles on to the dispatcher.
  const onPanelKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && flyout) setFlyout(null);
  };

  const hint = armedLabel ? (
    <div className="border-t border-surface-3 px-2 py-1.5 text-xs text-muted" role="status">
      Click the map to place {armedLabel}. Esc cancels.
    </div>
  ) : null;

  if (collapsed) {
    const open = LIBRARY.find((g) => g.id === flyout);
    return (
      <aside
        aria-label="Asset library"
        onKeyDown={onPanelKey}
        className="relative flex h-full w-10 flex-col items-center gap-1 border-r border-surface-3 bg-surface-1 py-1"
      >
        <Button
          size="sm"
          tooltip="Expand library"
          aria-label="Expand library"
          onClick={() => setCollapsed(false)}
        >
          »
        </Button>
        {LIBRARY.map((g) => (
          <Tooltip key={g.id} content={g.title} side="right">
            <button
              type="button"
              aria-label={g.title}
              aria-expanded={flyout === g.id}
              data-group-icon={g.id}
              onClick={() => setFlyout(flyout === g.id ? null : g.id)}
              className={`flex h-8 w-8 items-center justify-center rounded-sm ${
                flyout === g.id ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2'
              } ${focusRing}`}
            >
              {GROUP_ICONS[g.id]}
            </button>
          </Tooltip>
        ))}
        {open ? (
          <div
            role="region"
            aria-label={open.title}
            className="absolute top-0 left-10 z-40 flex max-h-full w-60 flex-col overflow-y-auto rounded-sm border border-surface-3 bg-surface-1 py-1 shadow-sm"
          >
            <div className="px-2 py-1 text-xs font-medium text-muted">{open.title}</div>
            <ItemList id={open.id} items={open.items} />
            {hint}
          </div>
        ) : null}
      </aside>
    );
  }

  const groups = filterLibrary(query);
  return (
    <aside
      aria-label="Asset library"
      className="flex h-full w-60 flex-col border-r border-surface-3 bg-surface-1"
    >
      <div className="flex items-center gap-1 p-1.5">
        <input
          type="search"
          aria-label="Filter assets"
          placeholder="Filter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`h-6 min-w-0 flex-1 rounded-sm border border-surface-3 bg-surface-0 px-1.5 text-xs text-text placeholder:text-muted ${focusRing}`}
        />
        <Button
          size="sm"
          tooltip="Collapse library"
          aria-label="Collapse library"
          onClick={() => setCollapsed(true)}
        >
          «
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto pb-1">
        {groups.map((g) => (
          <section key={g.id} aria-label={g.title} className="pt-1">
            <h3 className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted">
              {GROUP_ICONS[g.id]}
              {g.title}
            </h3>
            <ItemList id={g.id} items={g.items} />
          </section>
        ))}
        {groups.length === 0 ? <div className="px-2 py-1 text-xs text-muted">No match.</div> : null}
      </div>
      {hint}
    </aside>
  );
}
