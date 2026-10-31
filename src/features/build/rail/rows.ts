// The scene list as rows, by spec group, with the legacy values per row
// (legacy/js/51-panel-rail.js): threats show speed and height, sensors and effectors range and
// sector, areas their top, height planes their height, events their time.
import { archetypeById, SYSTEM_LABELS } from '../../../domain/catalog';
import type { Vignette } from '../../../domain/types';
import type { Preview } from '../../../engine/preview';
import type { Units } from '../../../state/ui';
import type { AddGroupId } from '../palette/store';
import { ADD_TITLE } from '../palette/store';
import { EVENT_LETTERS, hDist, spd, tText, vBare, vHeight } from './format';

export type RailRow = {
  /** The record key: selection and hover use it. */
  key: string;
  /** The id column. */
  id: string;
  /** The name column. */
  name: string;
  /** The data column, mono, right aligned. */
  data: string;
  /** The row's tooltip. */
  title: string;
  /** Set when the row carries a warning; the text says what is wrong. */
  warn?: string;
};

export type RailGroup = { id: AddGroupId; title: string; rows: RailRow[]; empty: string };

/** Empty-group hints; the key words follow the legacy rail. */
const EMPTY: Record<AddGroupId, string> = {
  threats: 'Press A to add.',
  sensors: 'Add a sensor to see detection.',
  effectors: 'Add an effector to see reach.',
  nodes: 'None.',
  areas: 'Press V to add.',
  planes: 'None.',
  events: 'Press E to add an event on the selected threat.',
};

function systemData(rangeM: number, fovDeg: number, units: Units): string {
  if (!(rangeM > 0)) return '';
  return hDist(rangeM, units) + (fovDeg < 360 ? `  ${Math.round(fovDeg)}°` : '');
}

/** Every record of the vignette in spec group order. */
export function railGroups(doc: Vignette, units: Units, preview: Preview | null): RailGroup[] {
  const threatId = new Map(doc.threats.map((t) => [t.key, t.id]));
  const group = (id: AddGroupId, rows: RailRow[]): RailGroup => ({
    id,
    title: ADD_TITLE[id],
    rows,
    empty: EMPTY[id],
  });
  return [
    group(
      'threats',
      doc.threats.map((t) => {
        const a = archetypeById(t.type);
        const speed = t.speedMs ?? preview?.threats[t.key]?.speedMs ?? a?.cruiseMs ?? 0;
        const z = t.path[0]?.z ?? 0;
        const one = t.path.length < 2;
        const name = (a?.name ?? t.type) + (t.group ? `, group ${t.group}` : '');
        return {
          key: t.key,
          id: t.id,
          name,
          data: `${spd(speed, units)}  ${vBare(z, units)}`,
          title: `${t.id}, ${name}, ${t.path.length} waypoints`,
          ...(one ? { warn: `${t.id} needs two waypoints.` } : {}),
        };
      }),
    ),
    group(
      'sensors',
      doc.sensors.map((s) => ({
        key: s.key,
        id: s.id,
        name: SYSTEM_LABELS[s.kind],
        data: systemData(s.rangeM, s.fovDeg, units),
        title: `${s.id}, ${SYSTEM_LABELS[s.kind]}`,
      })),
    ),
    group(
      'effectors',
      doc.effectors.map((e) => ({
        key: e.key,
        id: e.id,
        name: SYSTEM_LABELS[e.kind],
        data: systemData(e.rangeM, e.fovDeg, units),
        title: `${e.id}, ${SYSTEM_LABELS[e.kind]}`,
      })),
    ),
    group(
      'nodes',
      doc.nodes.map((n) => ({
        key: n.key,
        id: n.id,
        name: SYSTEM_LABELS[n.kind],
        data: systemData(n.rangeM, 360, units),
        title: `${n.id}, ${SYSTEM_LABELS[n.kind]}`,
      })),
    ),
    group(
      'areas',
      doc.areas.map((a) => ({
        key: a.key,
        id: a.id,
        name: a.label,
        data: a.zMaxM > 0 ? vBare(a.zMaxM, units) : '',
        title: `${a.id}, ${a.label}`,
      })),
    ),
    group(
      'planes',
      doc.planes.map((p) => ({
        key: p.key,
        id: p.id,
        name: p.label || 'Height plane',
        data: vHeight(p.zM, units),
        title: `${p.id}, ${p.label || 'Height plane'}`,
      })),
    ),
    group(
      'events',
      [...doc.events]
        .sort((a, b) => a.tS - b.tS)
        .map((e) => ({
          key: e.key,
          id: `${e.id} ${EVENT_LETTERS[e.type]}`,
          name: threatId.get(e.threatKey) ?? '',
          data: tText(e.tS),
          title: `${e.id}, ${e.label}`,
        })),
    ),
  ];
}
