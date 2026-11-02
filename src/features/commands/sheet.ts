// The shortcut sheet's rows per workspace (spec section 8: generated from the registry per
// workspace). Rows follow the legacy key table order in `legacy/js/46-keys.js`; keys and the
// enabled set come from the registry, so a row shows only commands that are registered and
// active in the workspace. A row of several commands joins their keys with ", " (legacy
// `alts(...).map(pretty).join(", ")`). Keyed commands no row names follow at the end.
import { all, activeIn, get, shortcutLabel } from '../../commands/registry';
import type { Command } from '../../commands/types';
import type { Workspace } from '../../state/ui';

type RowSpec = { ids: readonly string[]; label?: string };

const row = (ids: string | readonly string[], label?: string): RowSpec => ({
  ids: typeof ids === 'string' ? [ids] : ids,
  label,
});

const CHIPS = [1, 2, 3, 4, 5].map((n) => `layer.chip${n}`);

/** Legacy order of `46-keys.js`, with the spec section 8 keys. */
const ORDER: readonly RowSpec[] = [
  row('build.quickAdd'),
  row('build.addSensor'),
  row('build.addArea'),
  row('build.addEvent'),
  row('build.formation'),
  row(['view.plan', 'view.elevation', 'view.3d'], 'Plan, Elevation, 3D'),
  row('time.playPause'),
  // The arrows step time at the shell; while the board stage has focus they nudge the selection.
  row(['time.back1', 'time.forward1'], 'Step 1 s; on the focused board, nudge the selection'),
  row(['time.back10', 'time.forward10'], 'Step 10 s'),
  row(['time.start', 'time.end'], 'Time to start or end'),
  row('time.cursor'),
  row(['time.prevEvent', 'time.nextEvent'], 'Previous or next key point'),
  row('view.units', 'nm ft kt or km m m/s'),
  row('map.gridSnap'),
  row('map.measure'),
  row(CHIPS, 'Layer toggle by number'),
  row('view.fit', 'Fit the board'),
  row(['view.zoomIn', 'view.zoomOut'], 'Zoom'),
  row(['edit.nextOfKind', 'edit.prevOfKind'], 'Next or previous object of the same kind'),
  row('edit.delete'),
  row('edit.duplicate'),
  row('card.save'),
  row('edit.undo'),
  row('edit.redo'),
  row('edit.copy', 'Copy the selected object'),
  row('edit.paste'),
  row('panel.inspector'),
  row('panel.sides'),
  row('help.shortcuts'),
  row('edit.escape', 'Cancel, close or go back'),
  row('brief.next'),
  row('brief.back'),
  row('brief.space'),
  row(['brief.first', 'brief.last'], 'First card or last card'),
  row('brief.play'),
  row('brief.snapshot'),
  row(['brief.plan', 'brief.elevation', 'brief.3d'], 'Plan, Elevation, 3D camera'),
  row(['brief.zoomIn', 'brief.zoomOut'], 'Zoom the card'),
  row('brief.timeline'),
];

export type SheetRow = { keys: string; label: string; ids: string[] };

/** Keys of a run of commands: "1 to 9", "Shift+1 to 8" for a long run, else joined by ", ". */
function keysOf(cmds: Command[], mac?: boolean): string {
  const labels = cmds.map((c) => shortcutLabel(c, mac));
  if (labels.length > 3) {
    const last = labels[labels.length - 1]!.split('+').pop();
    return `${labels[0]} to ${last}`;
  }
  return labels.join(', ');
}

/** The sheet rows for a workspace, in legacy order. */
export function sheetRows(workspace: Workspace, mac?: boolean): SheetRow[] {
  const live = (id: string) => {
    const c = get(id);
    return c?.shortcut && activeIn(c, workspace) ? c : null;
  };
  const named = new Set<string>();
  const rows: SheetRow[] = [];
  for (const spec of ORDER) {
    const cmds = spec.ids.map(live).filter((c): c is Command => c !== null);
    spec.ids.forEach((id) => named.add(id));
    if (!cmds.length) continue;
    rows.push({
      keys: keysOf(cmds, mac),
      label: spec.label ?? cmds[0]!.label,
      ids: cmds.map((c) => c.id),
    });
  }
  for (const c of all())
    if (c.shortcut && !named.has(c.id) && activeIn(c, workspace))
      rows.push({ keys: shortcutLabel(c, mac), label: c.label, ids: [c.id] });
  return rows;
}
