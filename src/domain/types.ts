// Domain types, spec section 5. Units stored: metres, seconds, metres per second.
// Every asset, waypoint, question and hypothesis carries `key`: a UUID minted at creation that
// never changes. `id` is the display id (RDR-1, T1, DA, Q-01, H-01) and can be renamed.
// References between records use `key`, never `id` or an array index.

export const SCHEMA = 'profile-studio/6' as const;
/** The stamp before height planes, authored events, snapshots, cards and debrief (spec section 5). */
export const SCHEMA_V5 = 'profile-studio/5' as const;

export type SensorKind = 'radar' | 'rf' | 'eoir' | 'acoustic';
export type EffectorKind = 'ew' | 'kinetic' | 'de';
export type NodeKind = 'c2' | 'tspi';
export type AreaKind = 'asset' | 'wez' | 'nfz' | 'ref';
export type Op = '>=' | '<=';

export type Vignette = {
  schema: typeof SCHEMA;
  id: string;
  name: string;
  updated: string;
  site: { name: string; lat: number; lon: number; elevM: number };
  questions: Question[]; // Q-01 ...
  hypotheses: Hypothesis[]; // H-01 ...
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
  runs: RunSummary[]; // stored results, newest first
  report: ReportDraft;
  /** The sweep the vignette is built for (spec section 6.4); absent for a single-run vignette. */
  sweep?: { factors: SweepFactor[] };
};

/** Sweep factor kinds, spec section 6.4. */
export type SweepFactorKind =
  | 'threat-speed'
  | 'threat-altitude'
  | 'approach-bearing'
  | 'sensor-range'
  | 'sensor-position-offset';

export type SweepFactor = {
  kind: SweepFactorKind;
  /** Levels in the factor's unit: m/s, m AGL, degrees, m, m. */
  levels: number[];
  /** Threat or sensor id the factor applies to; every one of that kind when absent. */
  target?: string;
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

/** A card's playback from `t0S` to `t1S` at `rate`, stopping at each beat. */
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

export type Hypothesis = {
  key: string;
  id: string;
  question: string; // question key
  measure: string; // DroneScore ID
  op: Op;
  value: number;
  prediction: { low: number; high: number } | null;
  lockedAt: string | null;
};

export type Entered = { value: number | boolean | string; source: string }; // source note is required

export type StageReached =
  'none' | 'detect' | 'track' | 'classify' | 'identify' | 'engage' | 'defeat';

export type Outcome = 'Success' | 'Miss' | 'No Attempt';

/** One per threat per replicate; DroneScore field names. */
export type RunRow = {
  run: number;
  threat: string;
  stage_reached: StageReached;
  detect_range_m: number | null;
  detect_alt_m: number | null;
  track_continuity_pct: number | null;
  track_error_m: number | null;
  id_range_m: number | null;
  id_time_s: number | null;
  identified_ok: boolean | null;
  engagement_range_m: number | null;
  time_to_intercept_s: number | null;
  outcome: Outcome;
};

/** One run: N replicates with one seed. */
export type RunSummary = {
  key: string;
  id: string;
  createdAt: string;
  n: number;
  seed: number;
  rows: RunRow[];
  /**
   * Hypothesis predictions as they stood at run start, by hypothesis key. `measure`, `op` and
   * `value` record the hypothesis statement; runs stored before they existed lack them.
   */
  predictions?: {
    hypothesis: string;
    measure?: string;
    op?: Op;
    value?: number;
    low: number;
    high: number;
  }[];
  /** Set when the vignette was edited while the run was in flight. */
  note?: string;
};

/** One brief view carried into the AAR (legacy brief card text). */
export type ReportSlide = { key: string; name: string; caption: string; notes: string };

export type ReportDraft = {
  summary: string;
  notes: string;
  dataSources: string[];
  truth: { source: string; intervalS: number; stationKeys: string[] };
  slides: ReportSlide[];
  /** AAR section notes, by section id (report/draft.ts SECTIONS). */
  sections?: Partial<Record<string, string>>;
  /** Measure ids picked as AAR charts, in pick order. */
  charts?: string[];
};
