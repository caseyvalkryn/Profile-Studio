// The quick-add rows: the asset library plus height planes and events, each with its catalog
// values in the data column (legacy/js/51-panel-palette.js rowData) and the S, V and E hints.
import {
  AREA_DEFAULTS,
  EFFECTOR_DEFAULTS,
  NODE_DEFAULTS,
  SENSOR_DEFAULTS,
  THREAT_GROUPS,
  type ThreatArchetype,
} from '../../../domain/catalog';
import type { AuthoredEventType, Vignette } from '../../../domain/types';
import type { Units } from '../../../state/ui';
import { LIBRARY, type LibraryItem } from '../rail/library';
import { EVENT_NAMES, EVENT_TYPES, hDist, spd, vBare } from '../rail/format';
import { ADD_TITLE, type AddGroupId } from './store';

/** What picking a row does. */
export type AddTarget =
  | { kind: 'library'; item: LibraryItem }
  | { kind: 'plane' }
  | { kind: 'event'; type: AuthoredEventType };

export type AddRow = {
  id: string;
  group: AddGroupId;
  label: string;
  /** The data column. */
  data: string;
  /** The data column in words, for the row tooltip (legacy `label, full`). */
  full: string;
  hint?: string;
  band?: string;
  bandNote?: string;
  keywords: string[];
  disabledReason?: string;
  target: AddTarget;
};

/** Shortcut hints on rows, legacy KEY_HINT. */
export const ROW_HINTS: Readonly<Record<string, string>> = {
  'sensor:radar': 'S',
  'area:asset': 'V',
};

/** Height planes start at 120 m, legacy reference plane. */
export const PLANE_DEFAULT = { zM: 120, label: '120 m ceiling' } as const;

/** Cruise height: the midpoint of the altitude band, rounded (legacy cruiseHeight). */
export function cruiseHeight(a: ThreatArchetype): number {
  return Math.round((a.altM[0] + a.altM[1]) / 2);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function bandOf(a: ThreatArchetype): { band: string; bandNote: string } {
  const g = THREAT_GROUPS[a.group];
  return { band: `Group ${a.group}`, bandNote: `${cap(g.weight)}, ${g.alt}, ${g.speed}` };
}

const LIB_GROUP: Record<LibraryItem['group'], AddGroupId> = {
  threats: 'threats',
  sensors: 'sensors',
  effectors: 'effectors',
  nodes: 'nodes',
  areas: 'areas',
};

function systemData(rangeM: number, fovDeg: number, units: Units): [string, string] {
  if (!(rangeM > 0)) return ['', 'no reach'];
  const fov = fovDeg < 360 ? `  ${fovDeg}°` : '';
  return [
    hDist(rangeM, units) + fov,
    hDist(rangeM, units) + (fovDeg < 360 ? `, ${fovDeg}° sector` : ', omni'),
  ];
}

function libraryRow(item: LibraryItem, units: Units): AddRow {
  const type = item.payload.type as string;
  let data = '';
  let full = '';
  let band: { band?: string; bandNote?: string } = {};
  const keywords = [item.search];
  switch (item.group) {
    case 'threats': {
      const a = item.threat!;
      data = `${spd(a.cruiseMs, units)}  ${vBare(cruiseHeight(a), units)}`;
      full = `${spd(a.cruiseMs, units)}, ${vBare(cruiseHeight(a), units)} AGL`;
      band = bandOf(a);
      keywords.push(`group ${a.group}, ${a.airframe}, ${a.role}`);
      break;
    }
    case 'sensors': {
      const d = SENSOR_DEFAULTS[type as keyof typeof SENSOR_DEFAULTS];
      [data, full] = systemData(d.rangeM, d.fovDeg, units);
      break;
    }
    case 'effectors': {
      const d = EFFECTOR_DEFAULTS[type as keyof typeof EFFECTOR_DEFAULTS];
      [data, full] = systemData(d.rangeM, d.fovDeg, units);
      break;
    }
    case 'nodes': {
      const d = NODE_DEFAULTS[type as keyof typeof NODE_DEFAULTS];
      [data, full] = systemData(d.rangeM, 360, units);
      break;
    }
    case 'areas': {
      const z = AREA_DEFAULTS[type as keyof typeof AREA_DEFAULTS].zMaxM;
      data = z > 0 ? vBare(z, units) : '';
      full = z > 0 ? `top ${vBare(z, units)}` : 'on the ground';
      break;
    }
  }
  const hint = ROW_HINTS[item.key];
  return {
    id: `add:${item.key}`,
    group: LIB_GROUP[item.group],
    label: item.label,
    data,
    full,
    ...(hint ? { hint } : {}),
    ...band,
    keywords,
    target: { kind: 'library', item },
  };
}

/** Every Add row in spec group order. Events need a threat. */
export function addRows(doc: Vignette | null, units: Units): AddRow[] {
  const rows = LIBRARY.flatMap((g) => g.items.map((i) => libraryRow(i, units)));
  rows.push({
    id: 'add:plane',
    group: 'planes',
    label: 'Height plane',
    data: vBare(PLANE_DEFAULT.zM, units),
    full: `${vBare(PLANE_DEFAULT.zM, units)} reference line`,
    keywords: ['height plane reference line ceiling'],
    target: { kind: 'plane' },
  });
  const noThreat = !doc || doc.threats.length === 0;
  for (const type of EVENT_TYPES) {
    rows.push({
      id: `add:event:${type}`,
      group: 'events',
      label: EVENT_NAMES[type],
      data: '',
      full: 'event on the selected threat at the time cursor',
      keywords: [`${EVENT_NAMES[type]} event`],
      ...(noThreat ? { disabledReason: 'Add a threat first' } : {}),
      target: { kind: 'event', type },
    });
  }
  return rows;
}

/** The text at the right of a group heading: the group key, or why the group is unavailable. */
export function addGroupHints(doc: Vignette | null): Record<string, string> {
  const noThreat = !doc || doc.threats.length === 0;
  return { [ADD_TITLE.events]: noThreat ? 'Needs a threat' : 'E' };
}
