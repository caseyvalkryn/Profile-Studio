// Placement (spec section 8, Place): drops and armed clicks. Systems, nodes and areas go through
// the registry's "Add here" commands, which mint `key` with newKey() and `id` with nextId inside
// one document edit. A threat starts path drawing; commitPath writes the path as one edit.
import { registerCommands } from '../../../commands/commands';
import { currentContext, execute } from '../../../commands/registry';
import { archetypeById } from '../../../domain/catalog';
import { newKey, nextId } from '../../../domain/ids';
import type { Threat, Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';
import { useUi, type ArmedItem } from '../../../state/ui';
import type { XY } from './frame';
import type { PathDraft } from './pathDraw';

registerCommands();

export type PlaceResult = { key: string } | { draw: string } | { error: string };

/** Place an item at `p` (map metres). A threat returns `draw` with its type instead. */
export function placeItem(item: ArmedItem, p: XY): PlaceResult {
  if (item.group === 'threat') return { draw: item.type };
  const ok = execute(`map.add.${item.kind}`, currentContext({ x: p.x, y: p.y }));
  if (ok !== true) return { error: ok };
  const key = useUi.getState().selectedKeys[0];
  return key ? { key } : { error: 'Nothing placed' };
}

function displayIds(d: Vignette): string[] {
  return [d.threats, d.sensors, d.effectors, d.nodes, d.areas].flatMap((l) =>
    l.map((x: { id: string }) => x.id),
  );
}

/** Write a finished path draft: a new threat, or the new path of an existing one. One undo step. */
export function commitPath(draft: PathDraft): string | null {
  const store = useDocument.getState();
  if (!store.doc || draft.points.length === 0) return null;
  const z0 = archetypeById(draft.type)?.altM[0] ?? 100;
  let key: string | null = null;
  if (draft.extend) {
    const tKey = draft.extend;
    store.edit('Draw path', (d) => {
      const t = d.threats.find((x) => x.key === tKey);
      if (!t) return;
      const z = t.path[t.path.length - 1]?.z ?? z0;
      const keep = t.path.length;
      for (const p of draft.points.slice(keep))
        t.path.push({ key: newKey(), x: p.x, y: p.y, z, holdS: 0 });
      key = t.key;
    });
  } else {
    store.edit('Add threat', (d) => {
      const t: Threat = {
        key: newKey(),
        id: nextId('threat', displayIds(d as Vignette)),
        type: draft.type,
        path: draft.points.map((p) => ({ key: newKey(), x: p.x, y: p.y, z: z0, holdS: 0 })),
        group: '',
      };
      d.threats.push(t);
      key = t.key;
    });
  }
  const ui = useUi.getState();
  if (key) ui.setSelection([key]);
  ui.setTool('select');
  ui.setArmed(null);
  return key;
}
