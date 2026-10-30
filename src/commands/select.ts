// Resolve selection keys to records in a vignette.
import type { Draft } from 'immer';
import type { Area, Effector, Node, Sensor, Threat, Vignette, Waypoint } from '../domain/types';

export type Found =
  | { kind: 'threat'; value: Threat }
  | { kind: 'waypoint'; value: Waypoint; threat: Threat; index: number }
  | { kind: 'sensor'; value: Sensor }
  | { kind: 'effector'; value: Effector }
  | { kind: 'node'; value: Node }
  | { kind: 'area'; value: Area };

export function find(v: Vignette | Draft<Vignette>, key: string): Found | null {
  const doc = v as Vignette;
  for (const t of doc.threats) {
    if (t.key === key) return { kind: 'threat', value: t };
    const i = t.path.findIndex((w) => w.key === key);
    const w = t.path[i];
    if (w) return { kind: 'waypoint', value: w, threat: t, index: i };
  }
  const s = doc.sensors.find((x) => x.key === key);
  if (s) return { kind: 'sensor', value: s };
  const e = doc.effectors.find((x) => x.key === key);
  if (e) return { kind: 'effector', value: e };
  const n = doc.nodes.find((x) => x.key === key);
  if (n) return { kind: 'node', value: n };
  const a = doc.areas.find((x) => x.key === key);
  if (a) return { kind: 'area', value: a };
  return null;
}

export function selected(v: Vignette | null, keys: readonly string[]): Found[] {
  if (!v) return [];
  return keys.map((k) => find(v, k)).filter((f): f is Found => f !== null);
}
