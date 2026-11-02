// The Build focus (2026-11-02, user request): the selection made the focus, the rest of the
// board dim, faint (Emphasis) or hidden. The stored focus is the user's keys; the view expands
// it so a threat keeps its events, a sensor keeps its events and the threats they sit on, and an
// event keeps its threat (the renderer adds an event's path by itself). A card stores the
// expanded keys, so the Brief draws the same picture with no expansion of its own.
import type { Card, Vignette } from '../../../domain/types';

export type FocusLevel = 'dim' | 'faint' | 'hidden';

/** The levels in the order Shift+H cycles them. */
export const FOCUS_LEVELS: readonly FocusLevel[] = ['faint', 'hidden', 'dim'];

export const FOCUS_LEVEL_LABEL: Record<FocusLevel, string> = {
  dim: 'rest dim',
  faint: 'rest faint',
  hidden: 'rest hidden',
};

export function nextFocusLevel(level: FocusLevel): FocusLevel {
  const i = FOCUS_LEVELS.indexOf(level);
  return FOCUS_LEVELS[(i + 1) % FOCUS_LEVELS.length]!;
}

/** The host class the board CSS reads; none at the dim level (the renderer's own `.dim`). */
export function focusClass(level: FocusLevel, on: boolean): string {
  if (!on || level === 'dim') return '';
  return level === 'faint' ? 'focus-faint' : 'focus-hidden';
}

/** A card's level from its displays, and the displays a level writes. */
export function levelOfCard(d: Card['displays']): FocusLevel {
  return d.hidden ? 'hidden' : d.emphasis ? 'faint' : 'dim';
}

export function displaysOfLevel(level: FocusLevel): Pick<Card['displays'], 'emphasis' | 'hidden'> {
  return { emphasis: level !== 'dim', hidden: level === 'hidden' };
}

/** The focus keys with their dependants, in a stable order, each key once; waypoints dropped. */
export function expandFocus(v: Vignette, keys: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  const threatKeys = new Set(v.threats.map((t) => t.key));
  const sensorKeys = new Set(v.sensors.map((s) => s.key));
  const eventKeys = new Set(v.events.map((e) => e.key));
  for (const k of keys) {
    if (threatKeys.has(k)) {
      add(k);
      for (const e of v.events) if (e.threatKey === k) add(e.key);
    } else if (sensorKeys.has(k)) {
      add(k);
      for (const e of v.events)
        if (e.sensorKey === k) {
          add(e.key);
          add(e.threatKey);
        }
    } else if (eventKeys.has(k)) {
      add(k);
      const e = v.events.find((x) => x.key === k)!;
      add(e.threatKey);
    } else if (
      v.effectors.some((x) => x.key === k) ||
      v.nodes.some((x) => x.key === k) ||
      v.areas.some((x) => x.key === k) ||
      v.planes.some((x) => x.key === k)
    )
      add(k);
  }
  return out;
}

/** Display ids of the expanded focus, for the renderer. */
export function focusIds(v: Vignette, keys: readonly string[]): string[] {
  const idOf = new Map<string, string>();
  for (const list of [v.threats, v.sensors, v.effectors, v.nodes, v.areas, v.planes, v.events])
    for (const r of list) idOf.set(r.key, r.id);
  return expandFocus(v, keys)
    .map((k) => idOf.get(k))
    .filter((id): id is string => id !== undefined);
}

/** The chip's text: the first three ids, then "and n more". */
export function focusLabel(v: Vignette, keys: readonly string[]): string {
  const idOf = new Map<string, string>();
  for (const list of [v.threats, v.sensors, v.effectors, v.nodes, v.areas, v.planes, v.events])
    for (const r of list) idOf.set(r.key, r.id);
  const ids = keys.map((k) => idOf.get(k)).filter((id): id is string => id !== undefined);
  if (ids.length <= 3) return ids.join(', ');
  return `${ids.slice(0, 3).join(', ')} and ${ids.length - 3} more`;
}

/** Two key lists name the same set. */
export function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((k) => s.has(k));
}
