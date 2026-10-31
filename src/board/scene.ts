// toScene: the v6 Vignette as the legacy record the board layers read (the inverse of
// importLegacyV4 on the fields the board draws). The port is literal, so the legacy internal
// names stay: systems (sensors, effectors, nodes), volumes (areas), aircraft and paths (threats),
// elev and axon cameras. Records are keyed by display id; each carries `key`, the v6 UUID.
//
// Fields v6 has no slot for come back from the report.notes lines the import writes:
// "Threat T1: identity neutral", "System X: status inactive", "Site datum: MSL".
import { EFFECTOR_KINDS, NODE_DEFAULTS, SENSOR_KINDS } from '../domain/catalog';
import type { Vignette } from '../domain/types';
import type {
  CamKind,
  CardRec,
  EventRec,
  Identity,
  PathRec,
  Scene,
  SystemRec,
  SystemStatus,
} from './types';

const PROJ_OF: Record<string, CamKind> = { plan: 'plan', elevation: 'elev', '3d': 'axon' };
const IDENTITIES: readonly string[] = [
  'hostile',
  'suspect',
  'unknown',
  'pending',
  'neutral',
  'friend',
];

function notesOf(v: Vignette) {
  const identity = new Map<string, Identity>();
  const status = new Map<string, SystemStatus>();
  let datum: 'AGL' | 'MSL' = 'AGL';
  for (const line of (v.report?.notes || '').split('\n')) {
    let m = /^Threat (.+): identity ([a-z]+)$/.exec(line);
    if (m && IDENTITIES.includes(m[2]!)) identity.set(m[1]!, m[2] as Identity);
    m = /^System (.+): status (inactive|degraded)$/.exec(line);
    if (m) status.set(m[1]!, m[2] as SystemStatus);
    if (line === 'Site datum: MSL') datum = 'MSL';
  }
  return { identity, status, datum };
}

function build(v: Vignette): Scene {
  const n = notesOf(v);
  const st = (id: string): SystemStatus => n.status.get(id) ?? 'active';
  const systems: SystemRec[] = [];
  for (const s of v.sensors)
    systems.push({
      key: s.key,
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      z: s.z,
      range: s.rangeM,
      rmin: s.minRangeM,
      fov: s.fovDeg,
      bearing: s.bearingDeg,
      elMin: s.elMinDeg,
      elMax: s.elMaxDeg,
      status: st(s.id),
      zmin: 0,
      zmax: null,
    });
  for (const s of v.effectors)
    systems.push({
      key: s.key,
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      z: s.z,
      range: s.rangeM,
      rmin: 0,
      fov: s.fovDeg,
      bearing: s.bearingDeg,
      elMin: -90,
      elMax: 90,
      status: st(s.id),
      zmin: 0,
      zmax: null,
    });
  for (const s of v.nodes)
    systems.push({
      key: s.key,
      id: s.id,
      kind: s.kind,
      x: s.x,
      y: s.y,
      z: s.z,
      range: s.rangeM,
      rmin: 0,
      fov: NODE_DEFAULTS[s.kind].fovDeg,
      bearing: 0,
      elMin: -90,
      elMax: 90,
      status: st(s.id),
      zmin: 0,
      zmax: null,
    });
  const sysId = new Map(systems.map((s) => [s.key, s.id]));
  // one aircraft per threat: v6 has no shared airframe record
  const aircraft = v.threats.map((t) => ({
    key: t.key,
    id: t.id,
    arch: t.type,
    cruise: t.speedMs ?? null,
  }));
  const paths: PathRec[] = v.threats.map((t) => ({
    key: t.key,
    id: t.id,
    aircraft: t.id,
    group: t.group,
    identity: n.identity.get(t.id) ?? 'hostile',
    pts: t.path.map((w) => ({ key: w.key, x: w.x, y: w.y, z: w.z, hold: w.holdS })),
    speed: t.speedMs ?? null,
  }));
  const pathId = new Map(v.threats.map((t) => [t.key, t.id]));
  const volumes = v.areas.map((a) => ({
    key: a.key,
    id: a.id,
    kind: a.kind,
    label: a.label,
    pts: a.pts.map((p) => [p[0], p[1]] as [number, number]),
    zmin: a.zMinM,
    zmax: a.zMaxM,
  }));
  const planes = v.planes.map((p) => ({ key: p.key, id: p.id, label: p.label, z: p.zM }));
  const events: EventRec[] = v.events.map((e) => ({
    key: e.key,
    id: e.id,
    type: e.type === 'identify' ? 'id' : e.type,
    t: e.tS,
    label: e.label,
    path: pathId.get(e.threatKey) ?? '',
    system: e.sensorKey == null ? null : (sysId.get(e.sensorKey) ?? null),
  }));
  const idOfKey = new Map<string, string>();
  for (const list of [systems, volumes, planes, paths, events])
    for (const x of list) idOfKey.set(x.key, x.id);
  const cards: CardRec[] = v.cards.map((c) => ({
    key: c.key,
    id: c.id,
    name: c.name,
    cam: {
      proj: PROJ_OF[c.view.kind] ?? 'plan',
      yaw: c.view.yawDeg,
      pitch: c.view.pitchDeg,
      ref:
        c.view.ref === 'asset' || c.view.ref === 'asset-edge'
          ? c.view.ref
          : (sysId.get(c.view.ref) ?? 'asset'),
      elevationMode: c.view.elevationMode,
    },
    layers: { ...c.layers },
    focus: c.focus.map((k) => idOfKey.get(k)).filter((x): x is string => x !== undefined),
    t: c.tS,
    caption: c.caption,
    notes: c.notes,
  }));
  let debrief: Scene['debrief'] = null;
  if (v.debrief) {
    const tspi: Record<string, [number, number, number, number][]> = {};
    for (const [k, list] of Object.entries(v.debrief.tspi)) {
      const id = pathId.get(k);
      if (id !== undefined) tspi[id] = list;
    }
    debrief = { tspi };
  }
  const truth = v.report?.truth;
  return {
    id: v.id,
    name: v.name,
    scene: { systems, volumes, aircraft, paths, planes },
    events,
    snapshots: v.snapshots.slice(),
    cards,
    telemetry: {
      interval: truth?.intervalS ?? 20,
      stations: (truth?.stationKeys ?? [])
        .map((k) => sysId.get(k))
        .filter((x): x is string => x !== undefined),
      tspi: truth?.source ?? '',
    },
    site: { datum: n.datum, elev: v.site.elevM, name: v.site.name },
    units: 'nav',
    debrief,
  };
}

const memo = new WeakMap<Vignette, Scene>();

/** The legacy record for a vignette, memoised by the Vignette reference. */
export function toScene(v: Vignette): Scene {
  let s = memo.get(v);
  if (!s) {
    s = build(v);
    memo.set(v, s);
  }
  return s;
}

export function isSensorKind(kind: string): boolean {
  return (SENSOR_KINDS as readonly string[]).includes(kind);
}

export function isEffectorKind(kind: string): boolean {
  return (EFFECTOR_KINDS as readonly string[]).includes(kind);
}
