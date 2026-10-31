import * as RD from '@radix-ui/react-dialog';
import { Command, defaultFilter } from 'cmdk';
import { useState, type DragEvent } from 'react';
import { popIn } from './focus';
import { Kbd } from './Kbd';
import type { PaletteItem } from './types';

/**
 * A palette row. Beyond a command it may carry a data column (catalog values, mono, right
 * aligned), a shortcut hint, a band subheader inside its group, extra search words and a drag
 * start. This is the legacy quick-add row (legacy/js/51-panel-palette.js).
 */
export type PaletteRow = PaletteItem & {
  /** Values in the data column, such as `3.0 nm  90°`. */
  data?: string;
  /** A shortcut hint for this row, such as `S` on the 3D radar row. */
  hint?: string;
  /** The row's tooltip. */
  title?: string;
  /** Subheader inside the group, such as `Group 1`. Shown while the search is empty. */
  band?: string;
  /** Quiet text beside the band, such as the group limits. */
  bandNote?: string;
  /** More words the search matches, beside the label and the group. */
  keywords?: string[];
  /** Makes the row draggable; the palette closes when a drag starts. */
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
};

export type PaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteRow[];
  placeholder?: string;
  /** The dialog's accessible title. */
  title?: string;
  /**
   * Open on these groups: while the search is empty only they show, with an All button. Typing
   * searches every row, as the legacy quick-add does.
   */
  focusGroups?: readonly string[];
  /** Called by the All button; the caller clears `focusGroups`. */
  onShowAll?: () => void;
  /** Text at the right of a group heading, such as the `E` key on Events. */
  groupHints?: Readonly<Record<string, string>>;
  emptyText?: string;
};

function groupsOf(items: PaletteRow[]): [string, PaletteRow[]][] {
  const map = new Map<string, PaletteRow[]>();
  for (const item of items) {
    const list = map.get(item.group);
    if (list) list.push(item);
    else map.set(item.group, [item]);
  }
  return [...map.entries()];
}

/** Match on the label, group and keywords only, never on the internal ID. */
const filter = (_value: string, search: string, keywords?: string[]) =>
  defaultFilter(keywords?.join(' ') ?? '', search);

const headingClass =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted';

function Heading({ group, hint }: { group: string; hint?: string }) {
  if (!hint) return <>{group}</>;
  return (
    <span className="flex items-center gap-2">
      <span className="flex-1">{group}</span>
      {hint.length <= 2 ? <Kbd shortcut={hint} /> : <span>{hint}</span>}
    </span>
  );
}

/**
 * The command palette (Cmd+K): every command, grouped, with its shortcut. A caller may open it on
 * some groups (the quick-add opens on Sensors for S) and give rows a data column and a hint.
 */
export function Palette({
  open,
  onOpenChange,
  items,
  placeholder = 'Type a command',
  title = 'Command palette',
  focusGroups,
  onShowAll,
  groupHints,
  emptyText = 'No matching command',
}: PaletteProps) {
  const [search, setSearch] = useState('');
  const focused = Boolean(focusGroups?.length) && search.trim() === '';
  const shown = focused ? items.filter((i) => focusGroups!.includes(i.group)) : items;
  const change = (next: boolean) => {
    if (!next) setSearch('');
    onOpenChange(next);
  };
  return (
    <RD.Root open={open} onOpenChange={change}>
      <RD.Portal>
        <RD.Content
          aria-describedby={undefined}
          className={`fixed top-[15%] left-1/2 z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-md border border-surface-3 bg-surface-1 text-sm text-text shadow-lg outline-none ${popIn}`}
        >
          <RD.Title className="sr-only">{title}</RD.Title>
          <Command label={title} filter={filter} loop>
            <div className="flex items-center border-b border-surface-3">
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder={placeholder}
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-text outline-none placeholder:text-muted"
              />
              {focused && onShowAll ? (
                <button
                  type="button"
                  onClick={onShowAll}
                  className="mr-2 h-6 rounded-sm px-2 text-xs text-muted hover:bg-surface-2 hover:text-text"
                >
                  All
                </button>
              ) : null}
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-1">
              <Command.Empty className="px-2 py-3 text-muted">{emptyText}</Command.Empty>
              {groupsOf(shown).map(([group, list]) => (
                <Command.Group
                  key={group}
                  value={group}
                  heading={<Heading group={group} hint={groupHints?.[group]} />}
                  className={headingClass}
                >
                  {list.map((item, i) => {
                    const band =
                      search.trim() === '' && item.band && item.band !== list[i - 1]?.band ? (
                        <div
                          key={`band:${item.band}`}
                          className="flex items-baseline gap-2 px-2 pt-1.5 pb-0.5 text-[11px]"
                        >
                          <span className="font-medium text-text">{item.band}</span>
                          {item.bandNote ? (
                            <span className="truncate text-muted">{item.bandNote}</span>
                          ) : null}
                        </div>
                      ) : null;
                    return [
                      band,
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        keywords={[item.label, item.group, ...(item.keywords ?? [])]}
                        disabled={Boolean(item.disabledReason)}
                        title={item.title}
                        draggable={item.onDragStart ? true : undefined}
                        onDragStart={
                          item.onDragStart
                            ? (e) => {
                                item.onDragStart!(e);
                                change(false);
                              }
                            : undefined
                        }
                        onSelect={() => {
                          item.onSelect();
                          change(false);
                        }}
                        className="flex h-8 cursor-default items-center gap-4 rounded-sm px-2 select-none data-[disabled=true]:text-muted data-[selected=true]:bg-surface-2 data-[selected=true]:ring-1 data-[selected=true]:ring-accent"
                      >
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.disabledReason ? (
                          <span className="truncate text-xs text-muted">{item.disabledReason}</span>
                        ) : null}
                        {item.data ? (
                          <span className="min-w-col-data text-right font-mono text-[11px] whitespace-pre text-muted">
                            {item.data}
                          </span>
                        ) : null}
                        {item.hint ? <Kbd shortcut={item.hint} /> : null}
                        {item.shortcut ? <Kbd shortcut={item.shortcut} /> : null}
                      </Command.Item>,
                    ];
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
