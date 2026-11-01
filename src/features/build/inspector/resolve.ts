// The inspector's selection resolver. `find` in src/commands/select.ts covers threats, waypoints,
// sensors, effectors, nodes and areas; height planes, authored events, cards and groups resolve here.
import { find, type Found } from '../../../commands/select';
import type { AuthoredEvent, Card, HeightPlane, Threat, Vignette } from '../../../domain/types';

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
