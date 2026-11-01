// The five layer toggles of the Brief notes panel (`legacy/mockup-v3.html` LAYER_DEFS, line 232)
// are the Build bar's table (src/features/build/bar/layers.ts), read here as groups over a card's
// stored layers: a group is on when every member is on; a toggle writes every member.
import type { LayerId } from '../../domain/types';
import { LAYER_TOGGLES, layerOn } from '../build/bar/layers';

export type LayerGroup = { id: string; label: string; members: readonly LayerId[] };

export const LAYER_GROUPS: readonly LayerGroup[] = LAYER_TOGGLES.map((t) => ({
  id: t.id,
  label: t.label,
  members: t.layers,
}));

/** True when every member of the group is on; a missing id takes the board default. */
export function groupOn(layers: Partial<Record<LayerId, boolean>>, g: LayerGroup): boolean {
  return g.members.every((id) => layerOn(layers, id));
}

/** The layers with every member of the group set to `on`. */
export function withGroup(
  layers: Partial<Record<LayerId, boolean>>,
  g: LayerGroup,
  on: boolean,
): Partial<Record<LayerId, boolean>> {
  const next = { ...layers };
  for (const id of g.members) next[id] = on;
  return next;
}
