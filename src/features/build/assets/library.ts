// The asset library as rows, built from the catalog. Spec section 7, Build, left panel.
import {
  AREA_DEFAULTS,
  AREA_KINDS,
  AREA_LABELS,
  EFFECTOR_DEFAULTS,
  EFFECTOR_KINDS,
  NODE_DEFAULTS,
  NODE_KINDS,
  SENSOR_DEFAULTS,
  SENSOR_KINDS,
  SYSTEM_LABELS,
  THREAT_ARCHETYPES,
  type ThreatArchetype,
} from '../../../domain/catalog';
import type { ArmedItem, Units } from '../../../state/ui';
import type { AssetDragPayload } from './dnd';
import { compactAltitude, compactSpeed } from '../../shared/units';

export type GroupId = 'threats' | 'sensors' | 'effectors' | 'nodes' | 'areas';

export type LibraryItem = {
  /** Unique row key, such as `threat:g1-quad-isr` or `sensor:radar`. */
  key: string;
  group: GroupId;
  label: string;
  /** Id prefix without the dash, shown on the drag ghost. */
  chip: string;
  payload: AssetDragPayload;
  armed: ArmedItem;
  /** Lower-case text the filter box matches. */
  search: string;
  threat?: ThreatArchetype;
};

export type LibraryGroup = { id: GroupId; title: string; items: LibraryItem[] };

const chipOf = (prefix: string) => prefix.replace(/-$/, '');

const threats: LibraryItem[] = THREAT_ARCHETYPES.map((a) => ({
  key: `threat:${a.id}`,
  group: 'threats',
  label: a.name,
  chip: 'T',
  payload: { kind: 'threat', type: a.id },
  armed: { group: 'threat', type: a.id },
  search:
    `${a.name} ${a.role.replace(/-/g, ' ')} ${a.airframe} group ${a.group} g${a.group} threat`.toLowerCase(),
  threat: a,
}));

const sensors: LibraryItem[] = SENSOR_KINDS.map((k) => ({
  key: `sensor:${k}`,
  group: 'sensors',
  label: SYSTEM_LABELS[k],
  chip: chipOf(SENSOR_DEFAULTS[k].prefix),
  payload: { kind: 'sensor', type: k },
  armed: { group: 'sensor', kind: k },
  search: `${SYSTEM_LABELS[k]} ${k} sensor`.toLowerCase(),
}));

const effectors: LibraryItem[] = EFFECTOR_KINDS.map((k) => ({
  key: `effector:${k}`,
  group: 'effectors',
  label: SYSTEM_LABELS[k],
  chip: chipOf(EFFECTOR_DEFAULTS[k].prefix),
  payload: { kind: 'effector', type: k },
  armed: { group: 'effector', kind: k },
  search: `${SYSTEM_LABELS[k]} ${k} effector`.toLowerCase(),
}));

const nodes: LibraryItem[] = NODE_KINDS.map((k) => ({
  key: `node:${k}`,
  group: 'nodes',
  label: SYSTEM_LABELS[k],
  chip: chipOf(NODE_DEFAULTS[k].prefix),
  payload: { kind: 'node', type: k },
  armed: { group: 'node', kind: k },
  search: `${SYSTEM_LABELS[k]} ${k} c2 and tspi`.toLowerCase(),
}));

const areas: LibraryItem[] = AREA_KINDS.map((k) => ({
  key: `area:${k}`,
  group: 'areas',
  label: AREA_LABELS[k],
  chip: AREA_DEFAULTS[k].prefix,
  payload: { kind: 'area', type: k },
  armed: { group: 'area', kind: k },
  search: `${AREA_LABELS[k]} ${k} area`.toLowerCase(),
}));

/** Groups in spec order. */
export const LIBRARY: readonly LibraryGroup[] = [
  { id: 'threats', title: 'Threats', items: threats },
  { id: 'sensors', title: 'Sensors', items: sensors },
  { id: 'effectors', title: 'Effectors', items: effectors },
  { id: 'nodes', title: 'C2 and TSPI', items: nodes },
  { id: 'areas', title: 'Areas', items: areas },
];

export function filterLibrary(query: string): LibraryGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...LIBRARY];
  return LIBRARY.map((g) => ({ ...g, items: g.items.filter((i) => i.search.includes(q)) })).filter(
    (g) => g.items.length > 0,
  );
}

export function sameArmed(a: ArmedItem | null, b: ArmedItem): boolean {
  if (!a || a.group !== b.group) return false;
  return 'type' in a && 'type' in b
    ? a.type === b.type
    : 'kind' in a && 'kind' in b && a.kind === b.kind;
}

/** Cruise speed and altitude band in the current units. */
export function threatSummary(a: ThreatArchetype, units: Units): string {
  const [lo, hi] = a.altM;
  return `${compactSpeed(a.cruiseMs, units)} · ${compactAltitude(lo, units)} to ${compactAltitude(hi, units)}`;
}

const metres = (m: number) => `${m.toLocaleString('en-US')} m`;

/** One-line tooltip: planning defaults, and the source for a threat (principle 3.3). */
export function itemTip(item: LibraryItem, units: Units): string {
  const p = item.payload.type as string;
  switch (item.group) {
    case 'threats': {
      const a = item.threat!;
      return `Group ${a.group}, max ${compactSpeed(a.vmaxMs, units)}${a.rf ? '' : ', RF silent'}. Source: ${a.src}`;
    }
    case 'sensors': {
      const d = SENSOR_DEFAULTS[p as keyof typeof SENSOR_DEFAULTS];
      return `Planning defaults: range ${metres(d.rangeM)}, FOV ${d.fovDeg}°, confirm ${d.confirmS} s`;
    }
    case 'effectors': {
      const d = EFFECTOR_DEFAULTS[p as keyof typeof EFFECTOR_DEFAULTS];
      return `Planning defaults: range ${metres(d.rangeM)}, FOV ${d.fovDeg}°, time to effect ${d.timeToEffectS} s`;
    }
    case 'nodes':
      return 'Planning defaults: no detection range';
    case 'areas': {
      const z = AREA_DEFAULTS[p as keyof typeof AREA_DEFAULTS].zMaxM;
      return z > 0
        ? `Planning defaults: top ${compactAltitude(z, units)}`
        : 'Planning defaults: ground level, no top';
    }
  }
}
