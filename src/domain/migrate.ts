// Legacy v4 import (spec section 5). profile -> vignette, aircraft and paths -> threats,
// systems -> sensors, effectors and nodes, volumes -> areas, MOP text -> question note.
// Every free-text field is kept. Text with no field of its own (collection, class, events,
// height planes, path group and identity) goes to report.notes as plain lines.

import {
  defaultSensorModel,
  DEFAULT_PK,
  EFFECTOR_DEFAULTS,
  EFFECTOR_KINDS,
  SENSOR_KINDS,
} from './catalog';
import { newKey } from './ids';
import { parseVignette } from './schema';
import type {
  Area,
  AreaKind,
  Effector,
  EffectorKind,
  MeasureSetting,
  Node,
  Question,
  Sensor,
  SensorKind,
  Threat,
  Vignette,
} from './types';
import { SCHEMA } from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): Obj[] => list(v).filter(isObj);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const AREA_KINDS: readonly string[] = ['asset', 'wez', 'nfz', 'ref'];

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
  note('Collection', str(doc.collection));
  note('Class', str(doc.cls));

  // aircraft -> archetype and cruise; each path becomes one threat
  const aircraft = new Map(objs(scene.aircraft).map((a) => [str(a.id), a]));
  const threats: Threat[] = objs(scene.paths).map((p) => {
    const ac = aircraft.get(str(p.aircraft));
    const speed = numOrNull(p.speed) ?? numOrNull(ac?.cruise);
    const group = str(p.group);
    const identity = str(p.identity);
    if (group || identity)
      note(
        `Threat ${str(p.id)}`,
        [group && `group ${group}`, identity && `identity ${identity}`].filter(Boolean).join(', '),
      );
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

  for (const pl of objs(scene.planes))
    note(`Height plane ${str(pl.id)} at ${num(pl.z)} m`, str(pl.label));
  for (const e of objs(doc.events))
    note(`Event ${str(e.id)} t+${num(e.t)} s ${str(e.type)} on ${str(e.path)}`, str(e.label));

  const purpose = str(doc.purpose);
  const mop = list(doc.mop).map((m) => str(m));
  const questions: Question[] =
    purpose || mop.length
      ? [{ key: newKey(), id: 'Q-01', text: purpose, note: mop.join('\n') }]
      : [];

  const site = isObj(doc.site) ? doc.site : {};
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
    site: { name: str(site.name), lat: 0, lon: 0, elevM: num(site.elev) },
    questions,
    hypotheses: [],
    threats,
    sensors,
    effectors,
    nodes,
    areas,
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
