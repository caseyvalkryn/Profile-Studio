// Legacy v4 import (spec section 5). profile -> vignette, aircraft and paths -> threats,
// systems -> sensors, effectors and nodes, volumes -> areas, MOP text -> question note.
// Height planes, authored events, snapshots, cards, the data list and debrief map to their own
// v6 fields (upgrade rule 1); references by legacy id become references by key. Every free-text
// field is kept. Collection becomes the site name when that is empty, else a question note line.
// Other text with no field of its own (class, path identity, system status, site datum) goes to
// report.notes as plain lines.

import {
  AUTHORED_EVENT_TYPES,
  defaultSensorModel,
  DEFAULT_PK,
  EFFECTOR_DEFAULTS,
  EFFECTOR_KINDS,
  LAYER_IDS,
  SENSOR_KINDS,
} from './catalog';
import { newKey } from './ids';
import { parseVignette } from './schema';
import type {
  Area,
  AreaKind,
  AuthoredEvent,
  AuthoredEventType,
  Card,
  CardView,
  Debrief,
  Effector,
  EffectorKind,
  HeightPlane,
  LayerId,
  MeasureSetting,
  Node,
  Question,
  Sensor,
  SensorKind,
  Threat,
  Vignette,
} from './types';
import { SCHEMA } from './types';

export { migrateV5ToV6 } from './migrateV5';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): Obj[] => list(v).filter(isObj);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const AREA_KINDS: readonly string[] = ['asset', 'wez', 'nfz', 'ref'];

/** Legacy C.EV_TYPES keys to the spec names: legacy `id` is `identify`. */
export function eventTypeOf(legacy: string): AuthoredEventType | null {
  const t = legacy === 'id' ? 'identify' : legacy;
  return (AUTHORED_EVENT_TYPES as readonly string[]).includes(t) ? (t as AuthoredEventType) : null;
}

/** Legacy card `cam.proj` to the v6 view kind. */
const VIEW_OF: Record<string, CardView['kind']> = { plan: 'plan', elev: 'elevation', axon: '3d' };

/**
 * The view an imported card opens at when the legacy card holds no zoom or pan (no legacy card
 * does: legacy renders every card fitted to the scene at zoom 1, pan 0, select.js cardView).
 */
export const LEGACY_CARD_VIEW = { centre: { x: 0, y: 0 }, zoom: 1, yawDeg: -35, pitchDeg: 55 };

/**
 * Measures an imported vignette scores until the user edits them: one row per F2T2EA step
 * the run can produce, with planning thresholds (spec section 8: templates open with
 * thresholds as planning values). Units are the DroneScore canonical units (measures.ts).
 */
export const DEFAULT_MEASURES: readonly MeasureSetting[] = [
  { id: '1.1.1', op: '>=', threshold: 90, unit: '%' }, // Probability of Detection
  { id: '1.1.2', op: '>=', threshold: 3000, unit: 'm' }, // Detection Range (ground)
  { id: '2.1.2', op: '>=', threshold: 80, unit: '%' }, // Probability of Correct Identification
  { id: '3.1.2', op: '>=', threshold: 70, unit: '%' }, // Probability of Kill
];

/** Legacy v4 has no Target chain time; the import leaves 0/0 and says so in report.notes. */
export const TARGET_TIME_NOTE = 'Target time not set: decisionS and assignS are 0.';

/** Import a legacy `profile-studio/4` record. Throws a readable Error if it is not one. */
export function importLegacyV4(doc: unknown): Vignette {
  if (!isObj(doc) || !isObj(doc.scene))
    throw new Error('This is not a profile record. Check the JSON.');
  if (doc.schema !== 'profile-studio/4')
    throw new Error('The record stamp is not profile-studio/4.');

  const scene = doc.scene;
  const notes: string[] = [];
  const note = (label: string, text: string) => {
    if (text) notes.push(`${label}: ${text}`);
  };
  note('Class', str(doc.cls));

  // aircraft -> archetype and cruise; each path becomes one threat
  const aircraft = new Map(objs(scene.aircraft).map((a) => [str(a.id), a]));
  const threats: Threat[] = objs(scene.paths).map((p) => {
    const ac = aircraft.get(str(p.aircraft));
    const speed = numOrNull(p.speed) ?? numOrNull(ac?.cruise);
    const identity = str(p.identity);
    if (identity) note(`Threat ${str(p.id)}`, `identity ${identity}`);
    const t: Threat = {
      key: newKey(),
      id: str(p.id),
      type: str(ac?.arch, str(p.aircraft)),
      path: objs(p.pts).map((w) => ({
        key: newKey(),
        x: num(w.x),
        y: num(w.y),
        z: num(w.z),
        holdS: num(w.hold),
      })),
      group: str(p.group),
    };
    if (speed != null) t.speedMs = speed;
    return t;
  });

  const sensors: Sensor[] = [];
  const effectors: Effector[] = [];
  const nodes: Node[] = [];
  const keyOfSystem = new Map<string, string>();
  for (const s of objs(scene.systems)) {
    const kind = str(s.kind);
    const id = str(s.id);
    const key = newKey();
    keyOfSystem.set(id, key);
    const pos = { x: num(s.x), y: num(s.y), z: num(s.z) };
    const rangeM = num(s.range);
    if ((SENSOR_KINDS as readonly string[]).includes(kind)) {
      sensors.push({
        key,
        id,
        kind: kind as SensorKind,
        ...pos,
        rangeM,
        minRangeM: num(s.rmin),
        fovDeg: num(s.fov, 360),
        bearingDeg: num(s.bearing),
        elMinDeg: num(s.elMin, -90),
        elMaxDeg: num(s.elMax, 90),
        model: defaultSensorModel(kind as SensorKind, rangeM > 0 ? rangeM : 1000),
        entered: {},
      });
    } else if ((EFFECTOR_KINDS as readonly string[]).includes(kind)) {
      effectors.push({
        key,
        id,
        kind: kind as EffectorKind,
        ...pos,
        rangeM,
        fovDeg: num(s.fov, 360),
        bearingDeg: num(s.bearing),
        timeToEffectS: EFFECTOR_DEFAULTS[kind as EffectorKind].timeToEffectS,
        pk: DEFAULT_PK,
        entered: {},
      });
    } else if (kind === 'c2' || kind === 'tspi' || kind === 'truth') {
      nodes.push({ key, id, kind: kind === 'c2' ? 'c2' : 'tspi', ...pos, rangeM });
    } else {
      throw new Error(`${id} has the kind ${kind} that is not in the catalog.`);
    }
    if (s.status && s.status !== 'active') note(`System ${id}`, `status ${str(s.status)}`);
  }

  const areas: Area[] = objs(scene.volumes).map((v) => {
    const kind = str(v.kind);
    if (!AREA_KINDS.includes(kind))
      throw new Error(`${str(v.id)} has the kind ${kind} that is not in the catalog.`);
    return {
      key: newKey(),
      id: str(v.id),
      kind: kind as AreaKind,
      label: str(v.label),
      pts: list(v.pts).map((p) => {
        const xy = list(p);
        return [num(xy[0]), num(xy[1])] as [number, number];
      }),
      zMinM: num(v.zmin),
      zMaxM: num(v.zmax),
    };
  });

  // Numbers on the new fields read as NaN when missing, so validation rejects them as legacy did.
  const planes: HeightPlane[] = objs(scene.planes).map((pl) => ({
    key: newKey(),
    id: str(pl.id),
    label: str(pl.label),
    zM: num(pl.z, NaN),
  }));

  const keyOfPath = new Map(threats.map((t) => [t.id, t.key]));
  const threatKeyOf = (owner: string, pathId: string): string => {
    const k = keyOfPath.get(pathId);
    if (k === undefined) throw new Error(`${owner} refers to path ${pathId} that does not exist.`);
    return k;
  };
  const typeOf = (owner: string, type: string): AuthoredEventType => {
    const t = eventTypeOf(type);
    if (!t) throw new Error(`${owner} has the type ${type} that is not in the catalog.`);
    return t;
  };

  const events: AuthoredEvent[] = objs(doc.events).map((e) => {
    const id = str(e.id);
    const system = e.system == null ? null : str(e.system);
    const sensorKey = system == null ? null : (keyOfSystem.get(system) ?? null);
    if (system != null && sensorKey == null)
      throw new Error(`${id} refers to system ${system} that does not exist.`);
    return {
      key: newKey(),
      id,
      tS: num(e.t, NaN),
      type: typeOf(id, str(e.type)),
      label: str(e.label),
      threatKey: threatKeyOf(id, str(e.path)),
      sensorKey,
    };
  });

  // Legacy focus and camera ids may name an event, path, system, volume or plane.
  const keyOfId = new Map<string, string>();
  for (const list of [planes, areas, [...keyOfSystem].map(([id, key]) => ({ id, key })), threats])
    for (const x of list) keyOfId.set(x.id, x.key);
  for (const e of events) keyOfId.set(e.id, e.key);

  const cards: Card[] = objs(doc.cards).map((c) => {
    const id = str(c.id);
    const cam = isObj(c.cam) ? c.cam : {};
    const kind = VIEW_OF[str(cam.proj, 'plan')];
    if (!kind) throw new Error(`${id} has a camera that is not plan, elev or axon.`);
    const ref = str(cam.ref, 'asset');
    const layersIn = isObj(c.layers) ? c.layers : {};
    const layers: Partial<Record<LayerId, boolean>> = {};
    for (const l of LAYER_IDS) if (typeof layersIn[l] === 'boolean') layers[l] = layersIn[l];
    const d = isObj(c.displays) ? c.displays : {};
    const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt);
    const k = isObj(c.clip) ? c.clip : null;
    return {
      key: newKey(),
      id,
      name: str(c.name),
      view: {
        kind,
        centre: {
          x: num(cam.px, LEGACY_CARD_VIEW.centre.x),
          y: num(cam.py, LEGACY_CARD_VIEW.centre.y),
        },
        zoom: num(cam.zoom, LEGACY_CARD_VIEW.zoom),
        yawDeg: num(cam.yaw, LEGACY_CARD_VIEW.yawDeg),
        pitchDeg: num(cam.pitch, LEGACY_CARD_VIEW.pitchDeg),
        // 'asset' and 'asset-edge' stay; a system id becomes its key; a missing system reads
        // 'asset', as legacy Sl.originId does.
        ref: ref === 'asset' || ref === 'asset-edge' ? ref : (keyOfSystem.get(ref) ?? 'asset'),
        // Legacy elevation is the From asset reading (artifact-study decision 6).
        elevationMode: 'fromAsset',
      },
      layers,
      displays: {
        timeline: bool(d.timeline, true),
        chart: bool(d.chart, false),
        readout: bool(d.readout, false),
      },
      clip: k && {
        t0S: num(k.t0, NaN),
        t1S: num(k.t1, NaN),
        rate: num(k.rate, NaN),
        beatsS: list(k.beats).map((b) => num(b, NaN)),
      },
      // An id that names nothing is dropped, as legacy drops focus on delete.
      focus: list(c.focus)
        .map((f) => keyOfId.get(str(f)))
        .filter((x): x is string => x !== undefined),
      tS: numOrNull(c.t),
      caption: str(c.caption),
      notes: str(c.notes),
    };
  });

  let debrief: Debrief | null = null;
  if (isObj(doc.debrief)) {
    const db = doc.debrief;
    const tspi: Debrief['tspi'] = {};
    for (const [pathId, samples] of Object.entries(isObj(db.tspi) ? db.tspi : {})) {
      const k = keyOfPath.get(pathId);
      if (k === undefined) throw new Error(`Debrief refers to path ${pathId} that does not exist.`);
      const ok =
        Array.isArray(samples) &&
        samples.every(
          (q) => Array.isArray(q) && q.length === 4 && q.every((n) => typeof n === 'number'),
        );
      if (!ok) throw new Error(`Debrief TSPI for ${pathId} needs t, x, y, z samples.`);
      tspi[k] = (samples as [number, number, number, number][]).map((q) => [...q]);
    }
    debrief = {
      source: str(db.source),
      loadedAt: str(db.loadedAt),
      tspi,
      events: objs(db.events).map((e) => {
        const system = e.system == null ? null : str(e.system);
        return {
          tS: num(e.t, NaN),
          type: typeOf('A debrief event', str(e.type)),
          threatKey: threatKeyOf('A debrief event', str(e.path)),
          sensorKey: system == null ? null : (keyOfSystem.get(system) ?? null),
        };
      }),
    };
  }

  const purpose = str(doc.purpose);
  const mop = list(doc.mop).map((m) => str(m));
  const questions: Question[] =
    purpose || mop.length
      ? [{ key: newKey(), id: 'Q-01', text: purpose, note: mop.join('\n') }]
      : [];

  const site = isObj(doc.site) ? doc.site : {};
  // Collection has no field of its own. It names the site when the site has no name (the Library
  // groups by site name); otherwise it goes on the question note, else on the report notes.
  const collection = str(doc.collection);
  let siteName = str(site.name);
  if (collection && !siteName) siteName = collection;
  else if (collection && questions[0]) {
    const q = questions[0];
    q.note = q.note ? `${q.note}\nCollection: ${collection}` : `Collection: ${collection}`;
  } else note('Collection', collection);
  if (str(site.datum) === 'MSL') note('Site datum', 'MSL');
  notes.push(TARGET_TIME_NOTE);
  notes.push('Site origin not set: lat 0, lon 0.');
  const tele = isObj(doc.telemetry) ? doc.telemetry : {};
  const meta = isObj(doc.meta) ? doc.meta : {};

  const v: Vignette = {
    schema: SCHEMA,
    id: str(doc.id, 'PROF-1'),
    name: str(doc.name),
    updated: str(meta.updated) || str(meta.created) || new Date().toISOString(),
    site: { name: siteName, lat: 0, lon: 0, elevM: num(site.elev) },
    questions,
    hypotheses: [],
    threats,
    sensors,
    effectors,
    nodes,
    areas,
    planes,
    events,
    snapshots: list(doc.snapshots).map((t) => num(t, NaN)),
    cards,
    debrief,
    chainTime: { decisionS: 0, assignS: 0 },
    measures: DEFAULT_MEASURES.map((m) => ({ ...m })),
    runs: [],
    report: {
      summary: '',
      notes: notes.join('\n'),
      dataSources: list(doc.data).map((d) => str(d)),
      truth: {
        source: str(tele.tspi) || str(tele.truth),
        intervalS: num(tele.interval, 20),
        stationKeys: list(tele.stations)
          .map((id) => keyOfSystem.get(str(id)))
          .filter((k): k is string => k !== undefined),
      },
      slides: objs(doc.cards).map((c) => ({
        key: newKey(),
        name: str(c.name),
        caption: str(c.caption),
        notes: str(c.notes),
      })),
    },
  };
  return parseVignette(v);
}
