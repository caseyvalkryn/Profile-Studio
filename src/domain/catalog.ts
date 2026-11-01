// Catalog transcribed from legacy/js/10-catalog.js as typed data.
// Spec section 2 names: threat (legacy aircraft), sensor and effector (legacy system), area (legacy volume).

import type {
  AreaKind,
  AuthoredEventType,
  EffectorKind,
  LayerId,
  NodeKind,
  SensorKind,
  SensorModel,
} from './types';

export type ThreatGroup = 1 | 2 | 3;

export type ThreatArchetype = {
  id: string;
  group: ThreatGroup;
  name: string;
  airframe: string;
  role: string;
  cruiseMs: number;
  vmaxMs: number;
  altM: [number, number];
  enduranceMin: [number, number];
  prop: string;
  link: string;
  sig: string;
  /** False for archetypes that do not emit RF (legacy NO_RF). */
  rf: boolean;
  behaviors: string[];
  src: string;
};

/** Group 1 to 3 limits, as printed in legacy C.GROUPS. */
export const THREAT_GROUPS: Record<ThreatGroup, { weight: string; alt: string; speed: string }> = {
  '1': {
    weight: 'under 20 lb',
    alt: 'under 1,200 ft AGL',
    speed: 'under 100 kt',
  },
  '2': {
    weight: '21 to 55 lb',
    alt: 'under 3,500 ft AGL',
    speed: 'under 250 kt',
  },
  '3': {
    weight: '56 to 1,320 lb',
    alt: 'under 18,000 ft MSL',
    speed: 'under 250 kt',
  },
};

export const THREAT_ARCHETYPES: readonly ThreatArchetype[] = [
  {
    id: 'g1-quad-isr',
    group: 1,
    name: 'Quadrotor ISR',
    airframe: 'multirotor',
    role: 'isr',
    cruiseMs: 12,
    vmaxMs: 21,
    altM: [30, 400],
    enduranceMin: [20, 55],
    prop: 'electric',
    link: 'RF 2.4/5.8 GHz + GNSS, return home on loss',
    sig: 'Sub-0.05 m² RCS; the video downlink is the main cue',
    rf: true,
    behaviors: [
      'hover and stare',
      'ingress below 120 m',
      'waypoint orbit',
      'payload drop from hover',
    ],
    src: 'https://drdrone.ca/pages/dji-mavic-3-technical-specifications',
  },
  {
    id: 'g1-fpv-rf',
    group: 1,
    name: 'FPV attack, RF manual',
    airframe: 'multirotor',
    role: 'one-way-attack',
    cruiseMs: 25,
    vmaxMs: 42,
    altM: [2, 100],
    enduranceMin: [3, 15],
    prop: 'electric',
    link: '900 MHz or 2.4 GHz control, 5.8 GHz video, manual pilot',
    sig: 'Smallest RCS in the catalog; analog video is the primary RF cue',
    rf: true,
    behaviors: [
      'nap of the earth ingress',
      'terminal dive',
      'route ambush loiter',
      'machine vision terminal lock',
    ],
    src: 'https://euromaidanpress.com/2024/01/25/how-fpv-drones-became-ukraine-top-weapon/',
  },
  {
    id: 'g1-fpv-fiber',
    group: 1,
    name: 'FPV attack, fiber optic',
    airframe: 'multirotor',
    role: 'one-way-attack',
    cruiseMs: 15,
    vmaxMs: 30,
    altM: [2, 60],
    enduranceMin: [5, 20],
    prop: 'electric',
    link: 'Fiber tether 10 to 20 km, no RF emission',
    sig: 'Zero RF signature; RF detection and jamming do not apply',
    rf: false,
    behaviors: [
      'RF silent ingress',
      'GPS denied manual flight',
      'terrain and culvert follow',
      'land, wait, relaunch',
    ],
    src: 'https://news.liga.net/en/amp/politics/news/defense-ministry-approves-new-ukrainian-fiber-optic-drone-photos-and-specifications',
  },
  {
    id: 'g1-swarm-quad',
    group: 1,
    name: 'Swarm element quadrotor',
    airframe: 'multirotor',
    role: 'swarm-element',
    cruiseMs: 14,
    vmaxMs: 25,
    altM: [30, 300],
    enduranceMin: [10, 30],
    prop: 'electric',
    link: 'Mesh RF + GNSS waypoint, onboard autonomy',
    sig: 'Each element near invisible; the aggregate saturates trackers',
    rf: true,
    behaviors: [
      'mass launch',
      'formation ingress then split',
      'multi axis time on target',
      'retask on attrition',
    ],
    src: 'https://defensescoop.com/?p=77283',
  },
  {
    id: 'g2-heavy-multirotor',
    group: 2,
    name: 'Heavy lift multirotor bomber',
    airframe: 'multirotor',
    role: 'strike',
    cruiseMs: 12,
    vmaxMs: 22,
    altM: [50, 400],
    enduranceMin: [20, 40],
    prop: 'electric',
    link: 'RF + GNSS, often relayed over LTE or SATCOM',
    sig: 'Largest rotorcraft RCS, loud low frequency acoustic',
    rf: true,
    behaviors: [
      'night approach 100 to 400 m',
      'hover drop',
      'mothership release of FPVs',
      'slow loaded transit',
    ],
    src: 'https://rubryka.com/en/2026/01/30/dron-bomber-vampire/',
  },
  {
    id: 'g2-vtol-isr',
    group: 2,
    name: 'VTOL fixed wing ISR',
    airframe: 'vtol-hybrid',
    role: 'isr',
    cruiseMs: 17,
    vmaxMs: 25,
    altM: [300, 1800],
    enduranceMin: [120, 180],
    prop: 'electric',
    link: 'RF datalink + GNSS',
    sig: 'Small RCS, distinct rotor acoustic in transition',
    rf: true,
    behaviors: ['vertical launch from a clearing', 'persistent racetrack', 'standoff 20 to 50 km'],
    src: 'https://www.janes.com/',
  },
  {
    id: 'g2-fw-isr',
    group: 2,
    name: 'Fixed wing ISR, catapult',
    airframe: 'fixed-wing',
    role: 'isr',
    cruiseMs: 25,
    vmaxMs: 42,
    altM: [500, 2000],
    enduranceMin: [240, 960],
    prop: 'piston',
    link: 'RF datalink to 120 km + GNSS/INS autonomous',
    sig: 'Small RCS; piston engine gives acoustic and IR cue',
    rf: true,
    behaviors: [
      'racetrack orbit 1 to 2 km AGL',
      'artillery spotting',
      'ISR plus relay pair',
      'GPS denied dead reckoning',
    ],
    src: 'https://www.globalsecurity.org/military/world/russia/orlan-10-specs.htm',
  },
  {
    id: 'g2-lm-xwing',
    group: 2,
    name: 'Loitering munition, X wing',
    airframe: 'fixed-wing',
    role: 'loitering-munition',
    cruiseMs: 27,
    vmaxMs: 80,
    altM: [100, 3000],
    enduranceMin: [30, 60],
    prop: 'electric',
    link: 'RF video link, man in the loop terminal + GNSS/INS',
    sig: 'Low RCS, quiet loiter; terminal dive to 80 m/s compresses the window',
    rf: true,
    behaviors: [
      'catapult launch',
      'loiter 30 to 40 min',
      'operator lock then steep dive',
      'cued by separate ISR',
    ],
    src: 'https://www.globalsecurity.org/military/world/russia/lancet-specs.htm',
  },
  {
    id: 'g3-delta-owa',
    group: 3,
    name: 'Delta wing one way attack, piston',
    airframe: 'delta-wing',
    role: 'one-way-attack',
    cruiseMs: 46,
    vmaxMs: 52,
    altM: [50, 4000],
    enduranceMin: [300, 840],
    prop: 'piston',
    link: 'GNSS/INS autonomous, no link',
    sig: 'Low RCS for size; loud piston acoustic; RF silent unless modem fitted',
    rf: false,
    behaviors: [
      'terrain following ingress 50 to 200 m',
      'dogleg route',
      'climb then steep terminal dive',
      'salvo, multi axis arrival',
    ],
    src: 'https://missilethreat.csis.org/missile/shahed-131-and-136/',
  },
  {
    id: 'g3-foam-decoy',
    group: 3,
    name: 'Foam delta wing decoy',
    airframe: 'delta-wing',
    role: 'decoy',
    cruiseMs: 35,
    vmaxMs: 44,
    altM: [100, 3000],
    enduranceMin: [120, 240],
    prop: 'piston',
    link: 'GNSS waypoint + mesh modem relay',
    sig: 'Lowest RCS of the delta wings yet shaped to read as an attack track',
    rf: true,
    behaviors: [
      'lead the strike to saturate defenses',
      'mesh relay',
      'decoy formation around real OWA',
    ],
    src: 'https://en.wikipedia.org/wiki/Gerbera_(drone)',
  },
  {
    id: 'g3-jet-owa',
    group: 3,
    name: 'Turbine one way attack',
    airframe: 'delta-wing',
    role: 'one-way-attack',
    cruiseMs: 95,
    vmaxMs: 125,
    altM: [100, 9000],
    enduranceMin: [120, 300],
    prop: 'turbine',
    link: 'GNSS/INS autonomous, optional terminal seeker',
    sig: 'Highest IR signature; closing speed halves the engagement window',
    rf: false,
    behaviors: [
      'high speed dash',
      'high cruise then dive',
      'low terminal run',
      'mixed salvo with piston OWA and decoys',
    ],
    src: 'https://missilethreat.csis.org/missile/shahed-238/',
  },
  {
    id: 'g3-vtol-hybrid',
    group: 3,
    name: 'VTOL hybrid fixed wing, ISR or strike',
    airframe: 'vtol-hybrid',
    role: 'isr',
    cruiseMs: 30,
    vmaxMs: 40,
    altM: [300, 3000],
    enduranceMin: [120, 300],
    prop: 'hybrid',
    link: 'RF + GNSS/INS, autonomous on link loss',
    sig: 'Moderate RCS at 3 to 5 m span; rotor acoustic in transition',
    rf: true,
    behaviors: [
      'vertical launch from a confined site',
      'long range autonomous ingress',
      'vertical terminal descent',
    ],
    src: 'https://www.muginuav.com/mugin-5-pro-5000mm-vtol-uav-platform-8-motor-mounts/',
  },
  {
    id: 'g3-target-piston',
    group: 3,
    name: 'Piston target drone, surrogate',
    airframe: 'fixed-wing',
    role: 'surrogate',
    cruiseMs: 33,
    vmaxMs: 65,
    altM: [100, 4900],
    enduranceMin: [60, 480],
    prop: 'piston',
    link: 'RF command link + GPS autopilot, scripted profiles',
    sig: 'Surrogate for Group 2 and 3 fixed wing; RCS and IR can be augmented',
    rf: true,
    behaviors: [
      'catapult launch',
      'straight and level presentation',
      'low ingress 100 to 300 m',
      'weave',
      'augmented RCS or towed target',
    ],
    src: 'https://designation-systems.net/dusrm/m-170.html',
  },
];

export const NO_RF_ARCHETYPES: readonly string[] = ['g1-fpv-fiber', 'g3-delta-owa', 'g3-jet-owa'];

export function archetypeById(id: string): ThreatArchetype | undefined {
  return THREAT_ARCHETYPES.find((a) => a.id === id);
}

export type SystemKind = SensorKind | EffectorKind | NodeKind;

/** Legacy C.SYS_KINDS, split into sensor, effector and node kinds. */
export const SENSOR_KINDS: readonly SensorKind[] = ['radar', 'rf', 'eoir', 'acoustic'];
export const EFFECTOR_KINDS: readonly EffectorKind[] = ['ew', 'kinetic', 'de'];
export const NODE_KINDS: readonly NodeKind[] = ['c2', 'tspi'];

export const SYSTEM_LABELS: Record<SystemKind, string> = {
  radar: '3D radar',
  rf: 'RF detector',
  eoir: 'EO/IR',
  acoustic: 'Acoustic',
  ew: 'RF effector',
  kinetic: 'Kinetic effector',
  de: 'Directed energy',
  c2: 'C2 node',
  tspi: 'TSPI station',
};

/** Legacy C.SYS_DEFAULTS. confirmS and timeToEffectS are planning defaults, not measured values. */
export const SENSOR_DEFAULTS: Record<
  SensorKind,
  { rangeM: number; fovDeg: number; prefix: string; confirmS: number }
> = {
  radar: { rangeM: 4000, fovDeg: 360, prefix: 'RDR-', confirmS: 3 },
  rf: { rangeM: 3000, fovDeg: 360, prefix: 'RF-', confirmS: 2 },
  eoir: { rangeM: 2500, fovDeg: 30, prefix: 'EO-', confirmS: 4 },
  acoustic: { rangeM: 800, fovDeg: 360, prefix: 'AC-', confirmS: 3 },
};

export const EFFECTOR_DEFAULTS: Record<
  EffectorKind,
  { rangeM: number; fovDeg: number; prefix: string; timeToEffectS: number }
> = {
  ew: { rangeM: 1500, fovDeg: 360, prefix: 'EW-', timeToEffectS: 10 },
  kinetic: { rangeM: 3000, fovDeg: 360, prefix: 'KIN-', timeToEffectS: 8 },
  de: { rangeM: 1000, fovDeg: 360, prefix: 'DE-', timeToEffectS: 6 },
};

export const NODE_DEFAULTS: Record<
  NodeKind,
  { rangeM: number; fovDeg: number; bearingDeg: number; prefix: string }
> = {
  c2: { rangeM: 0, fovDeg: 0, bearingDeg: 0, prefix: 'C2-' },
  tspi: { rangeM: 0, fovDeg: 0, bearingDeg: 0, prefix: 'TM-' },
};

/** Legacy C.VOL_KINDS and C.VOL_DEFAULTS. zMaxM is the default top in metres. */
export const AREA_KINDS: readonly AreaKind[] = ['asset', 'wez', 'nfz', 'ref'];
export const AREA_LABELS: Record<AreaKind, string> = {
  asset: 'Defended asset',
  wez: 'Engagement zone',
  nfz: 'No-fly area',
  ref: 'Reference pattern',
};
export const AREA_DEFAULTS: Record<AreaKind, { zMaxM: number; prefix: string }> = {
  asset: { zMaxM: 0, prefix: 'DA' },
  wez: { zMaxM: 1200, prefix: 'WEZ' },
  nfz: { zMaxM: 150, prefix: 'NFZ' },
  ref: { zMaxM: 0, prefix: 'REF' },
};

/** Seconds inside the EO/IR field of view to count as a positive ID. */
export const ID_DWELL = 5;
/** Seconds a track survives a sensor gap before it reads as lost. */
export const COAST_S = 10;
/** Playback rates (legacy C.RATES). */
export const RATES: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
/** Authored event types (legacy C.EV_TYPES; legacy `id` is `identify`). */
export const AUTHORED_EVENT_TYPES = [
  'detect',
  'track',
  'identify',
  'engage',
  'split',
  'merge',
  'loiter',
  'terminal',
  'checkpoint',
] as const satisfies readonly AuthoredEventType[];
/** Card layer ids in legacy Sc.LAYER_KEYS order. */
export const LAYER_IDS = [
  'reach',
  'events',
  'envelopes',
  'tracks',
  'telemetry',
  'labels',
  'rings',
  'target',
] as const satisfies readonly LayerId[];

// ---- MVP planning defaults. Not in legacy; the engine lanes may tune them. ----

/** Default sensor model per kind (spec section 6 item 2). */
export function defaultSensorModel(kind: SensorKind, rangeM: number): SensorModel {
  const shared = {
    scanS: 1,
    trackM: 3,
    trackN: 5,
    coastS: COAST_S,
    idDwellS: ID_DWELL,
    pCorrectId: 0.9,
  };
  if (kind === 'radar') {
    return {
      ...shared,
      pd: {
        kind: 'swerling',
        swerling: 1,
        refRangeM: rangeM,
        refRcsM2: 0.01,
        refSnrDb: 13,
        pfa: 1e-6,
      },
      trackErrorM: 10,
    };
  }
  const trackErrorM = { rf: 50, eoir: 5, acoustic: 30 }[kind];
  return {
    ...shared,
    pd: { kind: 'logistic', r50M: 0.8 * rangeM, widthM: 0.1 * rangeM },
    trackErrorM,
  };
}

/** Default probability of kill for a new effector. */
export const DEFAULT_PK = 0.8;
