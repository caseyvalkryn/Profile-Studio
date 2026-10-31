// v5 to v6 (spec section 5, upgrade rule 4). A v5 record gains empty height planes, authored
// events, snapshots and cards, a null debrief, and `group: ''` on each threat. Area bottoms and
// tops already exist in v5 (`zMinM`, `zMaxM`) and are kept; a missing one takes 0 for the bottom
// and the kind default for the top (legacy C.VOL_DEFAULTS). Kept apart from migrate.ts so
// schema.ts can call it without an import cycle; migrate.ts re-exports it.

import { AREA_DEFAULTS } from './catalog';
import type { AreaKind } from './types';
import { SCHEMA, SCHEMA_V5 } from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Return a `profile-studio/6` copy of a `profile-studio/5` record. Any other input comes back
 * unchanged, so callers can pass every record through it before validation.
 */
export function migrateV5ToV6(doc: unknown): unknown {
  if (!isObj(doc) || doc.schema !== SCHEMA_V5) return doc;
  const threats = Array.isArray(doc.threats)
    ? doc.threats.map((t: unknown) =>
        isObj(t) ? { ...t, group: typeof t.group === 'string' ? t.group : '' } : t,
      )
    : doc.threats;
  const areas = Array.isArray(doc.areas)
    ? doc.areas.map((a: unknown) => {
        if (!isObj(a)) return a;
        const top = AREA_DEFAULTS[a.kind as AreaKind]?.zMaxM ?? 0;
        return { ...a, zMinM: fin(a.zMinM) ? a.zMinM : 0, zMaxM: fin(a.zMaxM) ? a.zMaxM : top };
      })
    : doc.areas;
  return {
    ...doc,
    schema: SCHEMA,
    threats,
    areas,
    planes: [],
    events: [],
    snapshots: [],
    cards: [],
    debrief: null,
  };
}
