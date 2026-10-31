// The inspector's selection resolver. `find` in src/commands/select.ts covers threats, waypoints,
// sensors, effectors, nodes and areas; height planes, authored events, cards and groups resolve here.
import type { Draft } from 'immer';
import { find, type Found } from '../../../commands/select';
import type { AuthoredEvent, Card, HeightPlane, Threat, Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';

/** A group has no record key; its selection key is `group:<letter>`. */
export const GROUP_PREFIX = 'group:';
export function groupKey(letter: string): string {
  return `${GROUP_PREFIX}${letter}`;
}

export type Picked =
  | Found
  | { kind: 'plane'; value: HeightPlane }
  | { kind: 'event'; value: AuthoredEvent }
  | { kind: 'card'; value: Card }
  | { kind: 'group'; letter: string; members: Threat[] };

export function pick(v: Vignette, key: string): Picked | null {
  const f = find(v, key);
  if (f) return f;
  const p = v.planes.find((x) => x.key === key);
  if (p) return { kind: 'plane', value: p };
  const e = v.events.find((x) => x.key === key);
  if (e) return { kind: 'event', value: e };
  const c = v.cards.find((x) => x.key === key);
  if (c) return { kind: 'card', value: c };
  if (key.startsWith(GROUP_PREFIX)) {
    const letter = key.slice(GROUP_PREFIX.length);
    const members = v.threats.filter((t) => t.group === letter);
    if (members.length) return { kind: 'group', letter, members };
  }
  return null;
}

/**
 * The warnings on one authored event (legacy `derived.warnings` with `w.eventId`). Returns `[]`
 * until lane 9.3.1 brings `checkEvents`; that lane rewires this selector.
 */
export function eventWarnings(v: Vignette, eventKey: string): string[] {
  return v.events.some((e) => e.key === eventKey) ? [] : [];
}

/** Edit a height plane, an authored event or a card as one undo step. */
export function editKeyed(
  label: string,
  list: 'planes' | 'events' | 'cards',
  key: string,
  recipe: (r: Draft<HeightPlane & AuthoredEvent & Card>, d: Draft<Vignette>) => void,
): void {
  useDocument.getState().edit(label, (d) => {
    const r = (d[list] as { key: string }[]).find((x) => x.key === key);
    if (r) recipe(r as Draft<HeightPlane & AuthoredEvent & Card>, d);
  });
}
