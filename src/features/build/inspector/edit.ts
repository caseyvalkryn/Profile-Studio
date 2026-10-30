// Edits through the document store. One call is one undo step with its label.
import type { Draft } from 'immer';
import { find } from '../../../commands/select';
import type { Area, Effector, Node, Sensor, Threat, Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';

type Records = { threat: Threat; sensor: Sensor; effector: Effector; node: Node; area: Area };

/** Edit the record with `key` of `kind` as one undo step. */
export function editRecord<K extends keyof Records>(
  label: string,
  kind: K,
  key: string,
  recipe: (r: Draft<Records[K]>, doc: Draft<Vignette>) => void,
): void {
  useDocument.getState().edit(label, (d) => {
    const f = find(d, key);
    if (f && f.kind === kind) recipe(f.value as Draft<Records[K]>, d);
  });
}

/** Every display id in the vignette, for the rename check. */
export function displayIds(v: Vignette): string[] {
  return [
    ...v.threats.map((r) => r.id),
    ...v.sensors.map((r) => r.id),
    ...v.effectors.map((r) => r.id),
    ...v.nodes.map((r) => r.id),
    ...v.areas.map((r) => r.id),
  ];
}

/** Why a rename is refused, or null when the new id is free. */
export function renameRefusal(v: Vignette, current: string, next: string): string | null {
  const id = next.trim();
  if (id === '') return 'An id cannot be blank.';
  if (id !== current && displayIds(v).includes(id)) return `${id} is already in use.`;
  return null;
}
