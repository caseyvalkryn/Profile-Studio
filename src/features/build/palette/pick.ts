// What picking a quick-add row does (legacy/js/51-panel-palette.js pick). Library rows arm
// placement through ui.armed; a height plane is added at once; an event goes on the selected
// threat at the time cursor, else the palette hands the board an event arming shape.
import { find } from '../../../commands/select';
import { newKey } from '../../../domain/ids';
import type { AuthoredEventType, Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { EVENT_NAMES } from '../rail/format';
import type { AddRow } from './rows';
import { PLANE_DEFAULT } from './rows';
import { useQuickAdd } from './store';

/** Lowest unused `<prefix><n>`, as legacy util.uid. */
function uid(prefix: string, ids: readonly string[]): string {
  const used = new Set(ids);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** The threat a selection points at: a selected threat, or the threat of a selected waypoint. */
export function selectedThreatKey(doc: Vignette | null, keys: readonly string[]): string | null {
  if (!doc) return null;
  for (const k of keys) {
    const f = find(doc, k);
    if (f?.kind === 'threat') return f.value.key;
    if (f?.kind === 'waypoint') return f.threat.key;
    const ev = doc.events.find((e) => e.key === k);
    if (ev) return ev.threatKey;
  }
  return null;
}

/** Add a height plane at 120 m and select it (legacy: `P-n added.`). Returns its key. */
export function addHeightPlane(): string | null {
  const { doc, edit } = useDocument.getState();
  if (!doc) return null;
  const key = newKey();
  const id = uid('P', doc.planes.map((p) => p.id));
  edit(`add ${id}`, (d) => {
    d.planes.push({ key, id, label: PLANE_DEFAULT.label, zM: PLANE_DEFAULT.zM });
  });
  useUi.getState().setSelection([key]);
  return key;
}

/** Add an event of `type` on a threat at `tS` (rounded to 0.1 s) and select it. */
export function addEventAt(threatKey: string, tS: number, type: AuthoredEventType): string | null {
  const { doc, edit } = useDocument.getState();
  if (!doc || !doc.threats.some((t) => t.key === threatKey)) return null;
  const key = newKey();
  const id = uid('e', doc.events.map((e) => e.id));
  const t = Math.round(Math.max(0, tS) * 10) / 10;
  edit(`add ${id}`, (d) => {
    d.events.push({ key, id, tS: t, type, label: EVENT_NAMES[type], threatKey, sensorKey: null });
  });
  useUi.getState().setSelection([key]);
  return key;
}

/** Run a picked row. */
export function pickAddRow(row: AddRow): void {
  const ui = useUi.getState();
  const t = row.target;
  if (t.kind === 'library') {
    useQuickAdd.getState().setBoardArmed(null);
    ui.setArmed(t.item.armed);
    ui.setTool(t.item.group === 'threats' ? 'path' : 'place');
    return;
  }
  if (t.kind === 'plane') {
    addHeightPlane();
    return;
  }
  const doc = useDocument.getState().doc;
  const threat = selectedThreatKey(doc, ui.selectedKeys);
  if (threat) {
    addEventAt(threat, ui.tS, t.type);
    return;
  }
  // No threat selected: the board places the event on the threat path the user clicks.
  // Lane 9.2.5 reads `boardArmed` and owns that placement.
  ui.setArmed(null);
  useQuickAdd.getState().setBoardArmed({ group: 'event', type: t.type });
}
