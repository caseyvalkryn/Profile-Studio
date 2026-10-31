// Runtime validation for the domain types (spec section 5). Each schema is typed against its
// TypeScript type, so the two cannot drift.

import { z } from 'zod';
import { AUTHORED_EVENT_TYPES, LAYER_IDS, RATES } from './catalog';
import { migrateV5ToV6 } from './migrateV5';
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
  Hypothesis,
  MeasureSetting,
  Node,
  Question,
  ReportDraft,
  RunRow,
  RunSummary,
  Sensor,
  SensorModel,
  Threat,
  Vignette,
  Waypoint,
} from './types';
import { SCHEMA } from './types';

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

export const nodeSchema: z.ZodType<Node> = z.object({
  key,
  id: z.string(),
  kind: z.enum(['c2', 'tspi']),
  x: num,
  y: num,
  z: num,
  rangeM: num.min(0),
});

// zMinM may equal zMaxM: legacy footprints (asset, ref) are flat at zmax 0.
export const areaSchema: z.ZodType<Area> = z
  .object({
    key,
    id: z.string(),
    kind: z.enum(['asset', 'wez', 'nfz', 'ref']),
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
// rate menu, every beat inside the clip.
export const clipSchema: z.ZodType<Clip> = z
  .object({
    t0S: num,
    t1S: num,
    rate: num.refine((r) => RATES.includes(r), 'The clip rate is not in the rate menu.'),
    beatsS: z.array(num),
  })
  .refine((c) => c.t0S < c.t1S, {
    message: 'The clip start must be before the clip end.',
    path: ['t1S'],
  })
  .refine((c) => c.beatsS.every((b) => b >= c.t0S && b <= c.t1S), {
    message: 'A beat is outside the clip.',
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
  displays: z.object({ timeline: z.boolean(), chart: z.boolean(), readout: z.boolean() }),
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

export const hypothesisSchema: z.ZodType<Hypothesis> = z.object({
  key,
  id: z.string(),
  question: z.string(),
  measure: z.string(),
  op,
  value: num,
  prediction: z.object({ low: num, high: num }).nullable(),
  lockedAt: z.string().nullable(),
});

const numOrNull = num.nullable();

export const runRowSchema: z.ZodType<RunRow> = z.object({
  run: z.number().int().min(0),
  threat: z.string(),
  stage_reached: z.enum(['none', 'detect', 'track', 'classify', 'identify', 'engage', 'defeat']),
  detect_range_m: numOrNull,
  detect_alt_m: numOrNull,
  track_continuity_pct: numOrNull,
  track_error_m: numOrNull,
  id_range_m: numOrNull,
  id_time_s: numOrNull,
  identified_ok: z.boolean().nullable(),
  engagement_range_m: numOrNull,
  time_to_intercept_s: numOrNull,
  outcome: z.enum(['Success', 'Miss', 'No Attempt']),
});

export const runSummarySchema: z.ZodType<RunSummary> = z.object({
  key,
  id: z.string(),
  createdAt: z.string(),
  n: z.number().int().min(0),
  seed: z.number().int(),
  rows: z.array(runRowSchema),
  predictions: z
    .array(
      z.object({
        hypothesis: z.string(),
        measure: z.string().optional(),
        op: op.optional(),
        value: num.optional(),
        low: num,
        high: num,
      }),
    )
    .optional(),
  note: z.string().optional(),
});

export const reportDraftSchema: z.ZodType<ReportDraft> = z.object({
  summary: z.string(),
  notes: z.string(),
  dataSources: z.array(z.string()),
  truth: z.object({ source: z.string(), intervalS: num.min(0), stationKeys: z.array(z.string()) }),
  slides: z.array(z.object({ key, name: z.string(), caption: z.string(), notes: z.string() })),
  sections: z.record(z.string(), z.string()).optional(),
  charts: z.array(z.string()).optional(),
});

export const vignetteSchema: z.ZodType<Vignette> = z.object({
  schema: z.literal(SCHEMA),
  id: z.string().min(1, 'The vignette has no id.'),
  name: z.string(),
  updated: z.string(),
  site: z.object({
    name: z.string(),
    lat: num.min(-90).max(90),
    lon: num.min(-180).max(180),
    elevM: num,
  }),
  questions: z.array(questionSchema),
  hypotheses: z.array(hypothesisSchema),
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
  runs: z.array(runSummarySchema),
  report: reportDraftSchema,
  sweep: z
    .object({
      factors: z
        .array(
          z.object({
            kind: z.enum([
              'threat-speed',
              'threat-altitude',
              'approach-bearing',
              'sensor-range',
              'sensor-position-offset',
            ]),
            levels: z.array(num).min(1),
            target: z.string().optional(),
          }),
        )
        .min(1)
        .max(2),
    })
    .optional(),
});

/**
 * Parse and validate a vignette. A `profile-studio/5` record is migrated to v6 first
 * (migrateV5ToV6). Throws an Error whose message lists each problem and its path.
 */
export function parseVignette(input: unknown): Vignette {
  const r = vignetteSchema.safeParse(migrateV5ToV6(input));
  if (!r.success) throw new Error(`This is not a valid vignette.\n${z.prettifyError(r.error)}`);
  return r.data;
}

/** True for a valid v6 record only; a v5 record needs parseVignette to migrate it. */
export function isVignette(input: unknown): input is Vignette {
  return vignetteSchema.safeParse(input).success;
}
