import * as RD from '@radix-ui/react-dialog';
import { Command, defaultFilter } from 'cmdk';
import { popIn } from './focus';
import { Kbd } from './Kbd';
import type { PaletteItem } from './types';

export type PaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  placeholder?: string;
};

function groupsOf(items: PaletteItem[]): [string, PaletteItem[]][] {
  const map = new Map<string, PaletteItem[]>();
  for (const item of items) {
    const list = map.get(item.group);
    if (list) list.push(item);
    else map.set(item.group, [item]);
  }
  return [...map.entries()];
}

/** Match on the label and group only, never on the internal ID. */
const filter = (_value: string, search: string, keywords?: string[]) =>
  defaultFilter(keywords?.join(' ') ?? '', search);

/** The command palette (Cmd+K): every command, grouped, with its shortcut. */
export function Palette({
  open,
  onOpenChange,
  items,
  placeholder = 'Type a command',
}: PaletteProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Content
          aria-describedby={undefined}
          className={`fixed top-[15%] left-1/2 z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-md border border-surface-3 bg-surface-1 text-sm text-text shadow-lg outline-none ${popIn}`}
        >
          <RD.Title className="sr-only">Command palette</RD.Title>
          <Command label="Command palette" filter={filter} loop>
            <Command.Input
              placeholder={placeholder}
              className="h-10 w-full border-b border-surface-3 bg-transparent px-3 text-sm text-text outline-none placeholder:text-muted"
            />
            <Command.List className="max-h-80 overflow-y-auto p-1">
              <Command.Empty className="px-2 py-3 text-muted">No matching command</Command.Empty>
              {groupsOf(items).map(([group, list]) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted"
                >
                  {list.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.id}
                      keywords={[item.label, item.group]}
                      disabled={Boolean(item.disabledReason)}
                      onSelect={() => {
                        item.onSelect();
                        onOpenChange(false);
                      }}
                      className="flex h-8 cursor-default items-center gap-4 rounded-sm px-2 select-none data-[disabled=true]:text-muted data-[selected=true]:bg-surface-2 data-[selected=true]:ring-1 data-[selected=true]:ring-accent"
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.disabledReason ? (
                        <span className="truncate text-xs text-muted">{item.disabledReason}</span>
                      ) : null}
                      {item.shortcut ? <Kbd shortcut={item.shortcut} /> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
