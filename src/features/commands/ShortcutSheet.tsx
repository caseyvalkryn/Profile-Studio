// The shortcut sheet (?): every command that has a key, grouped, read from the registry. The
// palette shows the same `shortcutLabel`, so the two always agree (acceptance 12.10).
import * as RD from '@radix-ui/react-dialog';
import { all, shortcutLabel } from '../../commands/registry';
import type { CommandGroup } from '../../commands/types';
import { useUi } from '../../state/ui';
import { popIn } from '../../ui/focus';
import { Kbd } from '../../ui/Kbd';
import { GROUP_LABELS } from './adapter';

const ORDER: CommandGroup[] = ['run', 'edit', 'view', 'time', 'map', 'file', 'help'];

export default function ShortcutSheet() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);
  const keyed = open ? all().filter((c) => c.shortcut) : [];
  const groups = ORDER.map((g) => ({ g, list: keyed.filter((c) => c.group === g) })).filter(
    (x) => x.list.length > 0,
  );
  return (
    <RD.Root open={open} onOpenChange={setOpen}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <RD.Content
          aria-describedby={undefined}
          className={`fixed top-[10%] left-1/2 z-50 max-h-[80vh] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto rounded-md border border-surface-3 bg-surface-1 p-4 text-sm text-text shadow-lg outline-none ${popIn}`}
        >
          <RD.Title className="mb-3 text-sm font-medium">Keyboard shortcuts</RD.Title>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {groups.map(({ g, list }) => (
              <section key={g} aria-label={GROUP_LABELS[g]}>
                <h3 className="mb-1 text-xs text-muted">{GROUP_LABELS[g]}</h3>
                <ul className="flex flex-col gap-0.5">
                  {list.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{c.label}</span>
                      <Kbd shortcut={shortcutLabel(c)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
