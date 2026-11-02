// Runtime validation for the domain types (spec section 5). Each schema is typed against its
// TypeScript type, so the two cannot drift.

import { z } from 'zod';
import { AUTHORED_EVENT_TYPES, LAYER_IDS, NODE_DEFAULTS, RATES } from './catalog';
import { migrateToV8 } from './migrateV5';
import type {
  Area,
  AuthoredEvent,
  Card,
  CardView,
  Clip,
  Debrief,
  Effector,
  HeightPlane,
  Entered,
  MeasureSetting,
  Node,
  NodeKind,
  Question,
  ReportDraft,
  Sensor,
  SensorModel,
  Threat,
  Vignette,
  Waypoint,
} from './types';
import { PROFILE_CLASSES, SCHEMA } from './types';

const num = z.number().finite();
const key = z.string().min(1);
const op = z.enum(['>=', '<=']);

export const waypointSchema: z.ZodType<Waypoint> = z.object({
  key,
  x: num,
  y: num,
  z: num,
  holdS: num.min(0),
});

export const questionSchema: z.ZodType<Question> = z.object({
  key,
  id: z.string(),
  text: z.string(),
  note: z.string(),
});

export const threatSchema: z.ZodType<Threat> = z.object({
  key,
  id: z.string(),
  type: z.string(),
  path: z.array(waypointSchema),
  speedMs: num.positive().optional(),
  group: z.string(),
});

export const enteredSchema: z.ZodType<Entered> = z.object({
  value: z.union([num, z.boolean(), z.string()]),
  source: z.string().min(1, 'An entered value needs a source note.'),
});

export const sensorModelSchema: z.ZodType<SensorModel> = z.object({
  pd: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('swerling'),
      swerling: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      refRangeM: num.positive(),
      refRcsM2: num.positive(),
      refSnrDb: num,
      pfa: num.gt(0).lt(1),
    }),
    z.object({ kind: z.literal('logistic'), r50M: num.positive(), widthM: num.positive() }),
  ]),
  scanS: num.positive(),
  trackM: z.number().int().min(1),
  trackN: z.number().int().min(1),
  coastS: num.min(0),
  idDwellS: num.min(0),
  pCorrectId: num.min(0).max(1),
  trackErrorM: num.min(0),
});

const entered = z.record(z.string(), enteredSchema);

// A sector is open at 0 and closed at 360: 360 is omnidirectional, 0 sees nothing.
const fov = num.gt(0, 'fovDeg must be above 0; 360 is omnidirectional.').max(360);

export const sensorSchema: z.ZodType<Sensor> = z
  .object({
    key,
    id: z.string(),
    kind: z.enum(['radar', 'rf', 'eoir', 'acoustic']),
    x: num,
    y: num,
    z: num,
    rangeM: num.min(0),
    minRangeM: num.min(0),
    fovDeg: fov,
    bearingDeg: num,
    elMinDeg: num.min(-90).max(90),
    elMaxDeg: num.min(-90).max(90),
    model: sensorModelSchema,
    entered,
  })
  .refine((s) => s.elMinDeg < s.elMaxDeg, {
    message: 'elMinDeg must be below elMaxDeg.',
    path: ['elMaxDeg'],
  })
  .refine((s) => s.minRangeM <= s.rangeM, {
    message: 'minRangeM must not exceed rangeM.',
    path: ['minRangeM'],
  });

export const effectorSchema: z.ZodType<Effector> = z.object({
  key,
  id: z.string(),
  kind: z.enum(['ew', 'kinetic', 'de']),
  x: num,
  y: num,
  z: num,
  rangeM: num.min(0),
  fovDeg: fov,
  bearingDeg: num,
  timeToEffectS: num.min(0),
  pk: num.min(0).max(1),
  entered,
});

// A stored v6 node from before fovDeg and bearingDeg existed gets the catalog defaults.
// A node's fovDeg may be 0, the legacy default (a zero-width sector).
export const nodeSchema: z.ZodType<Node> = z.preprocess(
  (n) => {
    if (n == null || typeof n !== 'object') return n;
    const d = NODE_DEFAULTS[(n as { kind?: unknown }).kind as NodeKind] as
      (typeof NODE_DEFAULTS)[NodeKind] | undefined;
    if (!d) return n;
    return { fovDeg: d.fovDeg, bearingDeg: d.bearingDeg, ...n };
  },
  z.object({
    key,
    id: z.string(),
    kind: z.enum(['c2', 'tspi']),
    x: num,
    y: num,
    z: num,
    rangeM: num.min(0),
    fovDeg: num.min(0).max(360),
    bearingDeg: num,
  }),
);

// zMinM may equal zMaxM: legacy footprints (asset, ref) are flat at zmax 0.
export const areaSchema: z.ZodType<Area> = z
  .object({
    key,
    id: z.string(),
    kind: z.enum(['asset', 'wez', 'nfz', 'ref', 'range']),
    label: z.string(),
    pts: z.array(z.tuple([num, num])).min(3, 'An area needs three or more vertices.'),
    zMinM: num,
    zMaxM: num,
  })
  .refine((a) => a.zMinM <= a.zMaxM, {
    message: 'zMinM must not exceed zMaxM.',
    path: ['zMaxM'],
  });

export const heightPlaneSchema: z.ZodType<HeightPlane> = z.object({
  key,
  id: z.string(),
  label: z.string(),
  zM: num,
});

const eventType = z.enum(AUTHORED_EVENT_TYPES, {
  message: 'The event type is not in the catalog.',
});

export const authoredEventSchema: z.ZodType<AuthoredEvent> = z.object({
  key,
  id: z.string(),
  tS: num,
  type: eventType,
  label: z.string(),
  threatKey: key,
  sensorKey: key.nullable(),
});

// Legacy card rules (legacy/js/11-schema.js validate): the start before the end, a rate from the
// rate menu, every beat inside the slice.
export const clipSchema: z.ZodType<Clip> = z
  .object({
    t0S: num,
    t1S: num,
    rate: num.refine((r) => RATES.includes(r), 'The slice rate is not in the rate menu.'),
    beatsS: z.array(num),
  })
  .refine((c) => c.t0S < c.t1S, {
    message: 'The slice start must be before the slice end.',
    path: ['t1S'],
  })
  .refine((c) => c.beatsS.every((b) => b >= c.t0S && b <= c.t1S), {
    message: 'A beat is outside the slice.',
    path: ['beatsS'],
  });

export const cardViewSchema: z.ZodType<CardView> = z.object({
  kind: z.enum(['plan', 'elevation', '3d'], {
    message: 'The view is not plan, elevation or 3D.',
  }),
  centre: z.object({ x: num, y: num }),
  zoom: num.positive(),
  yawDeg: num,
  pitchDeg: num,
  ref: key,
  elevationMode: z.enum(['alongPath', 'fromAsset']),
});

export const cardSchema: z.ZodType<Card> = z.object({
  key,
  id: z.string(),
  name: z.string(),
  view: cardViewSchema,
  layers: z.partialRecord(z.enum(LAYER_IDS), z.boolean()),
  displays: z.object({
    timeline: z.boolean(),
    chart: z.boolean(),
    readout: z.boolean(),
    // added 2026-11-02 without a stamp change: a missing field reads false
    emphasis: z.boolean().default(false),
    hidden: z.boolean().default(false),
  }),
  clip: clipSchema.nullable(),
  focus: z.array(key),
  tS: num.nullable(),
  caption: z.string(),
  notes: z.string(),
});

export const debriefSchema: z.ZodType<Debrief> = z.object({
  source: z.string(),
  loadedAt: z.string(),
  tspi: z.record(
    key,
    z.array(z.tuple([num, num, num, num], { message: 'A TSPI sample needs t, x, y and z.' })),
  ),
  events: z.array(
    z.object({ tS: num, type: eventType, threatKey: key, sensorKey: key.nullable() }),
  ),
});

export const measureSettingSchema: z.ZodType<MeasureSetting> = z.object({
  id: z.string(),
  op,
  threshold: num,
  unit: z.string(),
});

export const reportDraftSchema: z.ZodType<ReportDraft> = z.object({
  notes: z.string(),
  dataSources: z.array(z.string()),
  truth: z.object({ source: z.string(), intervalS: num.min(0), stationKeys: z.array(z.string()) }),
});

export const vignetteSchema: z.ZodType<Vignette> = z.object({
  schema: z.literal(SCHEMA),
  id: z.string().min(1, 'The profile has no id.'),
  name: z.string(),
  updated: z.string(),
  collection: z.string(),
  class: z.enum(PROFILE_CLASSES, { message: 'The class is not in the catalog.' }),
  version: z.number().int().min(1),
  site: z.object({
    name: z.string(),
    lat: num.min(-90).max(90),
    lon: num.min(-180).max(180),
    elevM: num,
  }),
  questions: z.array(questionSchema),
  threats: z.array(threatSchema),
  sensors: z.array(sensorSchema),
  effectors: z.array(effectorSchema),
  nodes: z.array(nodeSchema),
  areas: z.array(areaSchema),
  planes: z.array(heightPlaneSchema),
  events: z.array(authoredEventSchema),
  snapshots: z.array(num),
  cards: z.array(cardSchema),
  debrief: debriefSchema.nullable(),
  chainTime: z.object({ decisionS: num.min(0), assignS: num.min(0) }),
  measures: z.array(measureSettingSchema),
  report: reportDraftSchema,
});

/**
 * Parse and validate a vignette. A `profile-studio/5`, `/6` or `/7` record is migrated to v8
 * first (migrateToV8). Throws an Error whose message lists each problem and its path.
 */
export function parseVignette(input: unknown): Vignette {
  const r = vignetteSchema.safeParse(migrateToV8(input));
  if (!r.success) throw new Error(`This is not a valid profile.\n${z.prettifyError(r.error)}`);
  return r.data;
}

/** True for a valid v8 record only; a v5, v6 or v7 record needs parseVignette to migrate it. */
export function isVignette(input: unknown): input is Vignette {
  return vignetteSchema.safeParse(input).success;
}
