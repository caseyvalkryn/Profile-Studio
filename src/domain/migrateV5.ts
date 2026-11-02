// v5 to v6, v6 to v7 and v7 to v8 (spec section 5, upgrade rule 4). A v5 record gains empty height planes, authored
// events, snapshots and cards, a null debrief, and `group: ''` on each threat. Area bottoms and
// tops already exist in v5 (`zMinM`, `zMaxM`) and are kept; a missing one takes 0 for the bottom
// and the kind default for the top (legacy C.VOL_DEFAULTS). A v6 record gains `collection` (its
// site name), `class` 'Custom' and `version` 1, and loses the run fields (hypotheses, runs, sweep,
// and on `report` everything but notes, dataSources and truth). A v7 record takes the v8 stamp
// and nothing else (v8 adds the `range` area kind). Kept apart from migrate.ts so
// schema.ts can call it without an import cycle; migrate.ts re-exports it.

import { AREA_DEFAULTS } from './catalog';
import type { AreaKind } from './types';
import { SCHEMA, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7 } from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Return a `profile-studio/8` copy of a `profile-studio/5`, `/6` or `/7` record. Any other input
 * comes back unchanged, so callers can pass every record through it before validation.
 */
export function migrateToV8(doc: unknown): unknown {
  const v6 = migrateV5ToV6(doc);
  const v7 = isObj(v6) && v6.schema === SCHEMA_V6 ? migrateV6ToV7(v6) : v6;
  return migrateV7ToV8(v7);
}

/** v7 to v8: the stamp only; any other input unchanged. */
export function migrateV7ToV8(doc: unknown): unknown {
  return isObj(doc) && doc.schema === SCHEMA_V7 ? { ...doc, schema: SCHEMA } : doc;
}

/** Return a `profile-studio/6` copy of a `profile-studio/5` record; any other input unchanged. */
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
    schema: SCHEMA_V6,
    threats,
    areas,
    planes: [],
    events: [],
    snapshots: [],
    cards: [],
    debrief: null,
  };
}

/**
 * v6 to v7: `collection` takes the site name when the record has none (the site keeps its name),
 * `class` 'Custom', `version` 1; the run fields go.
 */
function migrateV6ToV7(doc: Obj): Obj {
  const rest = { ...doc };
  for (const k of ['hypotheses', 'runs', 'sweep']) delete rest[k];
  const site = isObj(doc.site) ? doc.site : {};
  const report = isObj(doc.report)
    ? { notes: doc.report.notes, dataSources: doc.report.dataSources, truth: doc.report.truth }
    : doc.report;
  return {
    ...rest,
    schema: SCHEMA_V7,
    collection:
      typeof doc.collection === 'string'
        ? doc.collection
        : typeof site.name === 'string'
          ? site.name
          : '',
    class: typeof doc.class === 'string' ? doc.class : 'Custom',
    version: typeof doc.version === 'number' ? doc.version : 1,
    report,
  };
}
