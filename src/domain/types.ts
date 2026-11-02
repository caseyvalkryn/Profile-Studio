// Domain types, spec section 5. Units stored: metres, seconds, metres per second.
// Every asset, waypoint and question carries `key`: a UUID minted at creation that
// never changes. `id` is the display id (RDR-1, T1, DA, Q-01) and can be renamed.
// References between records use `key`, never `id` or an array index.

export const SCHEMA = 'profile-studio/7' as const;
/** The stamp before collection, class and version, with the run fields (spec section 5). */
export const SCHEMA_V6 = 'profile-studio/6' as const;
/** The stamp before height planes, authored events, snapshots, cards and debrief (spec section 5). */
export const SCHEMA_V5 = 'profile-studio/5' as const;

export type SensorKind = 'radar' | 'rf' | 'eoir' | 'acoustic';
export type EffectorKind = 'ew' | 'kinetic' | 'de';
export type NodeKind = 'c2' | 'tspi';
export type AreaKind = 'asset' | 'wez' | 'nfz' | 'ref';
export type Op = '>=' | '<=';

/** The profile classes (spec section 5, legacy C.CLASSES). */
export const PROFILE_CLASSES = [
  'Counter-UAS',
  'Multi-aircraft',
  'One-way attack',
  'Surrogate',
  'Custom',
] as const;
export type ProfileClass = (typeof PROFILE_CLASSES)[number];

export type Vignette = {
  schema: typeof SCHEMA;
  id: string;
  name: string;
  updated: string;
  /** The Library group; '' when none. A v6 record takes its site name. */
  collection: string;
  class: ProfileClass;
  /** Rises by one on each committed edit; undo does not lower it. Starts at 1. */
  version: number;
  site: { name: string; lat: number; lon: number; elevM: number };
  questions: Question[]; // Q-01 ...
  threats: Threat[];
  sensors: Sensor[];
  effectors: Effector[];
  nodes: Node[]; // C2 and TSPI stations
  areas: Area[];
  planes: HeightPlane[];
  events: AuthoredEvent[]; // the planned row
  snapshots: number[]; // seconds; envelopes draw at these times when the time cursor is off
  cards: Card[]; // the brief
  debrief: Debrief | null; // flown data
  chainTime: { decisionS: number; assignS: number }; // Target step inputs
  measures: MeasureSetting[]; // the rows this vignette scores, with thresholds
  report: ReportDraft;
};

/** `Q-nn`: what the test must answer. `note` holds supporting text, such as legacy MOP lines. */
export type Question = { key: string; id: string; text: string; note: string };

export type Threat = {
  key: string;
  id: string;
  type: string; // catalog archetype id
  path: Waypoint[];
  speedMs?: number; // overrides the archetype cruise speed
  group: string; // '' when none, a letter otherwise (legacy path.group)
};

export type Waypoint = { key: string; x: number; y: number; z: number; holdS: number };

/** Radar Pd: Swerling case against SNR over range. SNR is `refSnrDb` for `refRcsM2` at `refRangeM`. */
export type RadarPd = {
  kind: 'swerling';
  swerling: 0 | 1 | 2 | 3 | 4;
  refRangeM: number;
  refRcsM2: number;
  refSnrDb: number;
  pfa: number;
};

/** RF, EO/IR and acoustic Pd: logistic curve, 0.5 at `r50M`, spread `widthM`. */
export type LogisticPd = { kind: 'logistic'; r50M: number; widthM: number };

export type SensorModel = {
  pd: RadarPd | LogisticPd;
  scanS: number; // one look per scan
  trackM: number; // track initiation: M detections of N looks
  trackN: number;
  coastS: number; // track loss after this gap
  idDwellS: number; // dwell before classification and identification
  pCorrectId: number;
  trackErrorM: number; // Gaussian position noise, 1 sigma
};

export type Sensor = {
  key: string;
  id: string;
  kind: SensorKind;
  x: number;
  y: number;
  z: number;
  rangeM: number;
  minRangeM: number;
  fovDeg: number;
  bearingDeg: number;
  elMinDeg: number;
  elMaxDeg: number;
  model: SensorModel;
  entered: Record<string, Entered>;
};

export type Effector = {
  key: string;
  id: string;
  kind: EffectorKind;
  x: number;
  y: number;
  z: number;
  rangeM: number;
  fovDeg: number;
  bearingDeg: number;
  timeToEffectS: number;
  pk: number;
  entered: Record<string, Entered>;
};

/** C2 node or TSPI station. */
export type Node = {
  key: string;
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  z: number;
  rangeM: number;
  /** Legacy default 0 (a zero-width sector); 360 or more is the full ring. */
  fovDeg: number;
  bearingDeg: number;
};

/** Defended asset, engagement zone, no-fly area or reference pattern. `pts` are [x, y] metres. */
export type Area = {
  key: string;
  id: string;
  kind: AreaKind;
  label: string;
  pts: [number, number][];
  zMinM: number;
  zMaxM: number;
};

/** A reference altitude drawn across the scene. */
export type HeightPlane = { key: string; id: string; label: string; zM: number };

export type AuthoredEventType =
  | 'detect'
  | 'track'
  | 'identify'
  | 'engage'
  | 'split'
  | 'merge'
  | 'loiter'
  | 'terminal'
  | 'checkpoint';

/**
 * A planned kill-chain event at a time on a flight path. `sensorKey` is the key of the sensor,
 * effector or node the event names (legacy `system`), or null.
 */
export type AuthoredEvent = {
  key: string;
  id: string;
  tS: number;
  type: AuthoredEventType;
  label: string;
  threatKey: string;
  sensorKey: string | null;
};

export type LayerId =
  'reach' | 'events' | 'envelopes' | 'tracks' | 'telemetry' | 'labels' | 'rings' | 'target';

/**
 * A card's camera. `centre` is the pan from the fitted view in metres and `zoom` the factor on
 * it; `{x: 0, y: 0}` and 1 are the legacy card view (fit to the scene).
 */
export type CardView = {
  kind: 'plan' | 'elevation' | '3d';
  centre: { x: number; y: number };
  zoom: number;
  yawDeg: number;
  pitchDeg: number;
  ref: string; // 'asset', or the key of the system the range origin sits on
  elevationMode: 'alongPath' | 'fromAsset';
};

/**
 * A card's slice (the UI word; "clip" is the record's): the time range `t0S` to `t1S` that the
 * card loops at `rate` (one of the strip's eight rates), stopping at each beat. Opening the card
 * sets the loop, the rate and the time to `t0S` (lane 13.2). The app writes `beatsS` empty;
 * imported beats inside the range are kept.
 */
export type Clip = { t0S: number; t1S: number; rate: number; beatsS: number[] };

/** A saved way of looking: view, layers, time, focus, caption, notes. Never a picture. */
export type Card = {
  key: string;
  id: string;
  name: string;
  view: CardView;
  layers: Partial<Record<LayerId, boolean>>;
  displays: { timeline: boolean; chart: boolean; readout: boolean };
  clip: Clip | null;
  focus: string[]; // keys
  tS: number | null; // null: time off
  caption: string;
  notes: string;
};

/** A flown TSPI sample: t, x, y, z. */
export type TspiSample = [number, number, number, number];

export type DebriefEvent = {
  tS: number;
  type: AuthoredEventType;
  threatKey: string;
  sensorKey: string | null;
};

/** Flown TSPI and events loaded after a range run. `tspi` is keyed by threat key. */
export type Debrief = {
  source: string;
  loadedAt: string;
  tspi: Record<string, TspiSample[]>;
  events: DebriefEvent[];
};

export type MeasureSetting = {
  id: string /* DroneScore ID */;
  op: Op;
  threshold: number;
  unit: string;
};

export type Entered = { value: number | boolean | string; source: string }; // source note is required

/**
 * The profile's report fields. `dataSources` is the data products list, `truth` the telemetry
 * (the inspector's Telemetry section) and `notes` the import's plain lines that have no field of
 * their own (the board reads identity, status and datum from them).
 */
export type ReportDraft = {
  notes: string;
  dataSources: string[];
  truth: { source: string; intervalS: number; stationKeys: string[] };
};
