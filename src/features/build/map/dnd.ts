// Drag and drop from the asset library (lane 4.2) onto the map. Both lanes use this MIME type
// and payload. `kind` is a group with `type` naming the member (`{ kind: 'sensor', type: 'radar' }`,
// `{ kind: 'threat', type: 'g1-quad-isr' }`), or a member kind on its own (`{ kind: 'radar' }`).
import {
  AREA_KINDS,
  EFFECTOR_KINDS,
  NODE_KINDS,
  SENSOR_KINDS,
  THREAT_ARCHETYPES,
  archetypeById,
} from '../../../domain/catalog';
import type { AreaKind, EffectorKind, NodeKind, SensorKind } from '../../../domain/types';
import type { ArmedItem } from '../../../state/ui';

export const ASSET_MIME = 'application/x-profile-studio-asset';

export type AssetGroup = 'threat' | 'sensor' | 'effector' | 'node' | 'area';
export type DropKind = AssetGroup | SensorKind | EffectorKind | NodeKind | AreaKind;
export type AssetDragPayload = { kind: DropKind; type?: string };

const MEMBERS = {
  sensor: SENSOR_KINDS,
  effector: EFFECTOR_KINDS,
  node: NODE_KINDS,
  area: AREA_KINDS,
} as const;

type MemberGroup = keyof typeof MEMBERS;

const groupOf = (member: string): MemberGroup | null =>
  (Object.keys(MEMBERS) as MemberGroup[]).find((g) =>
    (MEMBERS[g] as readonly string[]).includes(member),
  ) ?? null;

/** The library item a payload names, or null when it names nothing placeable. */
export function toItem(p: AssetDragPayload): ArmedItem | null {
  const { kind, type } = p;
  if (kind === 'threat') {
    const t = type && archetypeById(type) ? type : THREAT_ARCHETYPES[0]?.id;
    return t ? { group: 'threat', type: t } : null;
  }
  const isGroup = kind in MEMBERS;
  const member = isGroup ? type : kind;
  if (!member) return null;
  const group = groupOf(member);
  if (!group || (isGroup && group !== kind)) return null;
  return { group, kind: member } as ArmedItem;
}

/** Parse the DataTransfer string. Null for anything malformed. */
export function parseAssetPayload(raw: string | null | undefined): ArmedItem | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object') return null;
    const o = v as Record<string, unknown>;
    if (typeof o.kind !== 'string') return null;
    return toItem({
      kind: o.kind as DropKind,
      type: typeof o.type === 'string' ? o.type : undefined,
    });
  } catch {
    return null;
  }
}

export function encodeAssetPayload(p: AssetDragPayload): string {
  return JSON.stringify(p);
}
