// The command palette with the quick-add as its Add groups. Cmd+K lists the commands and the Add
// rows; A opens it on the Add groups; S, V and E open it on Sensors, Areas and Events. Lane 9.2.6
// mounts this in place of the shell's plain Palette.
import { useEffect, useMemo } from 'react';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { Palette, type PaletteRow } from '../../../ui/Palette';
import type { PaletteItem } from '../../../ui/types';
import { startAssetDrag } from '../rail/dnd';
import { pickAddRow } from './pick';
import { addGroupHints, addRows, type AddRow } from './rows';
import { ADD_TITLE, focusTitles, useQuickAdd } from './store';

/** An Add row as a palette row. */
export function toPaletteRow(r: AddRow): PaletteRow {
  const t = r.target;
  return {
    id: r.id,
    label: r.label,
    group: ADD_TITLE[r.group],
    data: r.data,
    title: r.full ? `${r.label}, ${r.full}` : r.label,
    keywords: r.keywords,
    onSelect: () => pickAddRow(r),
    ...(r.hint ? { hint: r.hint } : {}),
    ...(r.band ? { band: r.band } : {}),
    ...(r.bandNote ? { bandNote: r.bandNote } : {}),
    ...(r.disabledReason ? { disabledReason: r.disabledReason } : {}),
    ...(t.kind === 'library'
      ? { onDragStart: (e) => startAssetDrag(e.dataTransfer, t.item.payload, t.item.chip) }
      : {}),
  };
}

export type QuickAddPaletteProps = {
  /** The registry commands as palette items (paletteItems from the commands adapter). */
  items: PaletteItem[];
};

export function QuickAddPalette({ items }: QuickAddPaletteProps) {
  const open = useUi((s) => s.paletteOpen);
  const units = useUi((s) => s.units);
  const doc = useDocument((s) => s.doc);
  const scope = useQuickAdd((s) => s.scope);
  const add = useMemo(() => addRows(doc, units).map(toPaletteRow), [doc, units]);
  const quick = scope !== null;
  const focus = focusTitles(scope);
  // Any close (Escape, a pick, the store) ends the quick-add scope, so Cmd+K opens the full list.
  useEffect(() => {
    if (!open) useQuickAdd.getState().setScope(null);
  }, [open]);
  return (
    <Palette
      open={open}
      onOpenChange={(next) => {
        useUi.getState().setPaletteOpen(next);
      }}
      items={quick ? add : [...items, ...add]}
      title={quick ? 'Quick add' : 'Command palette'}
      placeholder={quick ? 'Search' : 'Type a command'}
      emptyText={quick ? 'Nothing matches. Clear the search.' : 'No matching command'}
      groupHints={addGroupHints(doc)}
      {...(focus ? { focusGroups: focus } : {})}
      {...(quick && scope !== 'add'
        ? { onShowAll: () => useQuickAdd.getState().setScope('add') }
        : {})}
    />
  );
}
