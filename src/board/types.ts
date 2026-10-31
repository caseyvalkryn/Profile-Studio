// Board types. The port of the legacy board (legacy/js/40 to 44) is literal, so the legacy
// internal names stay: elev and axon for the elevation and 3D cameras, volumes for areas,
// systems for sensors, effectors and nodes, aircraft and paths for threats. Records are keyed by
// display id, as legacy is; every record also carries `key`, the v6 UUID.
import type { Pt3, TimedPoint } from '../engine/geo';
import type { TspiSample } from '../domain/types';
import type { ElevationMode, Units } from '../state/ui';

export type CamKind = 'plan' | 'elev' | 'axon';

export type SystemStatus = 'active' | 'inactive' | 'degraded';
export type Identity = 'hostile' | 'suspect' | 'unknown' | 'pending' | 'neutral' | 'friend';

export type SystemRec = {
  key: string;
  id: string;
  kind: string; // radar | rf | eoir | acoustic | ew | kinetic | de | c2 | tspi
  x: number;
  y: number;
  z: number;
  range: number;
  rmin: number;
  fov: number;
  bearing: number;
  elMin: number;
  elMax: number;
  status: SystemStatus;
  zmin: number;
  zmax: number | null;
};

export type PathPt = { key: string; x: number; y: number; z: number; hold: number };

export type PathRec = {
  key: string;
  id: string;
  aircraft: string;
  group: string;
  identity: Identity;
  pts: PathPt[];
  speed: number | null;
};

export type AircraftRec = { key: string; id: string; arch: string; cruise: number | null };

export type VolumeRec = {
  key: string;
  id: string;
  kind: string; // asset | wez | nfz | ref
  label: string;
  pts: [number, number][];
  zmin: number;
  zmax: number;
};

export type PlaneRec = { key: string; id: string; label: string; z: number };

/** Legacy event: `type` is the legacy catalog key (`id` for identify); `path`, `system` display ids. */
export type EventRec = {
  key: string;
  id: string;
  type: string;
  t: number;
  label: string;
  path: string;
  system: string | null;
};

export type CardCam = {
  proj: CamKind;
  yaw: number;
  pitch: number;
  ref: string; // 'asset' or a system display id
  elevationMode: ElevationMode;
};

export type CardRec = {
  key: string;
  id: string;
  name: string;
  cam: CardCam;
  layers: Partial<Record<string, boolean>>;
  focus: string[]; // display ids
  t: number | null;
  caption: string;
  notes: string;
};

export type SceneObjects = {
  systems: SystemRec[];
  volumes: VolumeRec[];
  aircraft: AircraftRec[];
  paths: PathRec[];
  planes: PlaneRec[];
};

/** The legacy record shape the board reads (legacy `profile` in ctx). */
export type Scene = {
  id: string;
  name: string;
  scene: SceneObjects;
  events: EventRec[];
  snapshots: number[];
  cards: CardRec[];
  telemetry: { interval: number; stations: string[]; tspi: string };
  site: { datum: 'AGL' | 'MSL'; elev: number; name: string };
  units: Units;
  /** Flown TSPI keyed by path display id. */
  debrief: { tspi: Record<string, TspiSample[]> } | null;
};

export type TrackSpan = { state: string; t0: number; t1: number };
export type FirstSee = { t: number | null; pos?: Pt3 | null; r?: number };
export type Envelope = { members: string[]; hull: ([number, number] | { x: number; y: number })[] };
export type FlownSample = { t: number; x: number; y: number; z: number };

/**
 * The derived fields the board layers read, keyed by display id. Structural, so the legacy
 * derive output (fixtures/legacy-derive) and the MVP engine adapter both fit. The functions are
 * optional: legacy layers guard each with a typeof check and draw nothing for a missing one.
 */
export type DerivedView = {
  /** Timed waypoints per path id. Read by paths, tracks, events, telemetry, handles. */
  timed: Record<string, TimedPoint[]>;
  /** Track lifecycle spans per path id (state pending | unknown | identity | coast | lost). Read by tracks. */
  trackLine?: Record<string, TrackSpan[]>;
  /** First-see per path id, per system id. Read by events (first-see ticks). */
  first?: Record<string, Record<string, FirstSee>>;
  /** First effector per path id. Read by tracks (engagement marks when the event names no system). */
  firstEffector?: Record<string, { system: string; t: number } | null>;
  /** Plan warnings; `eventId` puts a warning triangle on that bead. Read by events. */
  warnings?: { eventId?: string | null }[];
  /** Flown data per path id. Read by telemetry. */
  flown?: Record<string, { timed?: (TimedPoint | FlownSample)[] }>;
  /** Raid group per path id. Read by envelopes for the hull id. */
  groupOf?: Record<string, string>;
  /** Range origin when originAt is absent. Read by cameras and the render context. */
  origin?: Pt3;
  originAt?: (ref: string, path: string | null, t: number | null) => Pt3;
  /** Path ids a system holds at t. Read by reach (solid ring with a tint). */
  holdsAt?: (systemId: string, t: number) => string[];
  /** Sensor ids covering a path at t. Read by tracks (sensor-to-track lines). */
  coveringAt?: (pathId: string, t: number) => string[];
  /** Raid hulls at t. Read by envelopes and tracks (raid collapse). */
  envelopesAt?: (t: number) => Envelope[];
};

export type Size = { W: number; H: number };

export type Sel = { kind: string | null; id: string | null; i?: number | null };

/** Hit record, legacy shape plus `key` (the v6 UUID of the object, null for a group hull). */
export type Hit = {
  kind: string;
  id: string;
  key: string | null;
  i: number | null;
  role: string | null;
  sx: number;
  sy: number;
  r: number;
  handle?: boolean;
  poly?: number[][];
  seg?: number[][];
};
