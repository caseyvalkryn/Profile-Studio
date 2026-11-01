// The scene list, the left column of the Build shell (legacy/js/51-panel-rail.js): every record
// by spec group with its values, an add button per group, selection that follows the store and
// hover that feeds the tip. 232 px wide; `panels.list` shows or hides it.
import { ChevronLeft, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { usePreview, useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { Icon } from '../../../ui/Icon';
import { Tooltip } from '../../../ui/Tooltip';
import { focusRing } from '../../../ui/focus';
import { openQuickAdd } from '../palette/store';
import { paletteCommands } from '../palette/commands';
import { RAIL_ADD_COMMAND, railCommands } from './commands';
import { railGroups, type RailRow } from './rows';

const addCommand = (id: string) => [...railCommands, ...paletteCommands].find((c) => c.id === id);

function Row({ row, selected }: { row: RailRow; selected: boolean }) {
  return (
    <button
      type="button"
      data-key={row.key}
      title={row.warn ?? row.title}
      aria-pressed={selected}
      onClick={() => useUi.getState().setSelection([row.key])}
      onPointerEnter={() => useUi.getState().setHover(row.key)}
      onPointerLeave={() => {
        if (useUi.getState().hoverKey === row.key) useUi.getState().setHover(null);
      }}
      className={`flex min-h-row w-full cursor-default items-center gap-2 px-row-px py-0.5 text-left text-xs ${focusRing} ${
        selected
          ? 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] shadow-[inset_2px_0_0_var(--accent)]'
          : 'hover:bg-surface-3'
      }`}
    >
      <span className="w-col-id shrink-0 truncate font-mono text-[11px] text-text">{row.id}</span>
      {/* a long name wraps to a second line rather than truncating (review 10.R F-07) */}
      <span className="line-clamp-2 min-w-0 flex-1 leading-tight break-words text-muted">
        {row.name}
      </span>
      {row.data || row.warn ? (
        <span
          className={`shrink-0 text-right font-mono text-[11px] whitespace-pre ${
            row.warn ? 'text-state-warning' : 'text-muted'
          }`}
        >
          {row.data}
          {row.warn ? ' ⚠' : ''}
        </span>
      ) : null}
    </button>
  );
}

export function Rail() {
  const show = useUi((s) => s.panels.list);
  const units = useUi((s) => s.units);
  const selectedKeys = useUi((s) => s.selectedKeys);
  const doc = useDocument((s) => s.doc);
  const preview = usePreview();
  const groups = useMemo(() => (doc ? railGroups(doc, units, preview) : []), [doc, units, preview]);
  if (!show) return null;
  const sel = new Set(selectedKeys);
  return (
    <nav
      aria-label="Scene"
      className="flex h-full w-col-list shrink-0 flex-col border-r border-surface-3 bg-surface-1"
    >
      <div className="flex h-row items-center gap-1 px-row-px pt-1">
        <h2 className="flex-1 text-xs font-medium text-text">Scene</h2>
        <Tooltip content="Hide the scene list">
          <button
            type="button"
            onClick={() => useUi.getState().togglePanel('list', false)}
            className={`flex h-[22px] w-[22px] items-center justify-center rounded-sm text-muted hover:bg-surface-3 hover:text-text ${focusRing}`}
          >
            <Icon icon={ChevronLeft} label="Hide the scene list" iconOnly size={12} />
          </button>
        </Tooltip>
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {doc ? null : <p className="px-row-px py-1 text-xs text-muted">No profile.</p>}
        {groups.map((g) => {
          const cmd = addCommand(RAIL_ADD_COMMAND[g.id]);
          const label = cmd?.label ?? `Add to ${g.title}`;
          return (
            <section key={g.id} aria-label={g.title} className="pt-1.5">
              <h3 className="flex h-row items-center gap-1 px-row-px text-[11px] font-medium text-muted">
                <span className="flex-1">{g.title}</span>
                {g.rows.length ? <span className="font-mono">{g.rows.length}</span> : null}
                <Tooltip content={label} {...(cmd?.shortcut ? { shortcut: cmd.shortcut } : {})}>
                  <button
                    type="button"
                    data-add={g.id}
                    onClick={() => openQuickAdd(g.id)}
                    className={`flex h-[22px] w-[22px] items-center justify-center rounded-sm text-muted hover:bg-surface-3 hover:text-text ${focusRing}`}
                  >
                    <Icon icon={Plus} label={label} iconOnly size={12} />
                  </button>
                </Tooltip>
              </h3>
              {g.rows.length === 0 ? (
                <p className="px-row-px pb-1 text-[11px] text-muted">{g.empty}</p>
              ) : (
                g.rows.map((r) => <Row key={r.key} row={r} selected={sel.has(r.key)} />)
              )}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
