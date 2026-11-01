// The five layer toggles of the mockup (`legacy/mockup-v3.html` LAYER_DEFS, line 232) over the
// board's eight chip layers (src/board/layers.ts LAYER_LABELS). A group is on when every member
// is on; a toggle writes every member. Tracks and Rings are not in a group and keep their value.
// Lane 10.3 builds the same table for the Build bar; the orchestrator dedupes after the merge.
import type { LayerId } from '../../domain/types';
import { defaultLayers } from '../../board';

export type LayerGroup = { id: string; label: string; members: readonly LayerId[] };

export const LAYER_GROUPS: readonly LayerGroup[] = [
  { id: 'reach', label: 'Reach', members: ['reach'] },
  { id: 'events', label: 'Events', members: ['events'] },
  { id: 'envelopes', label: 'Envelopes', members: ['envelopes'] },
  // The target TSPI cross is flown data, so it follows Telemetry.
  { id: 'telemetry', label: 'Telemetry', members: ['telemetry', 'target'] },
  { id: 'labels', label: 'Labels', members: ['labels'] },
];

/** True when every member of the group is on; a missing id takes the board default. */
export function groupOn(layers: Partial<Record<LayerId, boolean>>, g: LayerGroup): boolean {
  const def = defaultLayers();
  return g.members.every((id) => layers[id] ?? def[id]);
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
