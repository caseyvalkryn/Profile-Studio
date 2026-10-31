// Layer registry, legacy 42-layers.js one to one. A layer is
// { id, label, order, chip, defaultOn, cameras, inputs, draw(ctx) }. Registering an id again
// replaces the earlier entry. Added to legacy: `inputs`, the ctx fields the layer reads, so the
// wiring lane knows which fragments a change rewrites. The port is literal, so the camera names
// stay elev and axon.
import type { Pt3 } from '../engine/geo';
import type { LayerId } from '../domain/types';
import type { Cam } from './cameras';
import type { BoardUnits } from './format';
import type { Box, Symbols } from './symbols';
import type { S as SFn } from './svg';
import type { CamKind, DerivedView, Hit, Scene, SceneObjects, Sel } from './types';

/** Label candidate: { p: priority (0 first), box, svg, always, id }; `n` is set to the queue index. */
export type LabelCand = {
  p: number;
  id: string | null;
  box: Box | null;
  svg: string;
  always?: boolean;
  n?: number;
};

export type Placing = {
  kind: string;
  sysKind?: string;
  arch?: string;
  pts?: ({ x: number; y: number; z?: number } | number[])[];
  cur?: { x: number; y: number; z?: number } | number[] | null;
  at?: { x: number; y: number; z?: number } | number[] | null;
  cursor?: { x: number; y: number; z?: number } | number[] | null;
  pathId?: string;
  n?: number;
  spacing?: number;
};

export type RulerEnd = {
  x: number;
  y: number;
  z?: number;
  kind?: string;
  id?: string;
  pathId?: string;
};
export type Ruler = { a: RulerEnd | null; b?: RulerEnd | null; done?: boolean };

export type Ghost = { rec: Scene; derived?: Pick<DerivedView, 'timed'> | null };

export type Ctx = {
  profile: Scene;
  scene: SceneObjects;
  derived: DerivedView;
  cam: Cam;
  t: number | null;
  sel: Sel;
  hover: Sel;
  focus: string[];
  layers: Record<string, boolean | undefined>;
  units: BoardUnits['mode'];
  thumb: boolean;
  edit: boolean;
  placing: Placing | null;
  ruler: Ruler | null;
  snap: boolean;
  ghost: Ghost | null;
  hoverT: number | null;
  ref: string;
  origin: Pt3;
  S: typeof SFn;
  sym: Symbols;
  u: BoardUnits;
  dim(id: string | null | undefined): string;
  cls(id: string | null | undefined): string;
  hits: Hit[];
  labels: LabelCand[];
  labelsOn: boolean;
  hit(h: Omit<Hit, 'key'> & { key?: string | null }): void;
  label(c: LabelCand): void;
};

/** The ctx data fields a layer may declare in `inputs`. */
export type CtxField =
  | 'profile'
  | 'scene'
  | 'derived'
  | 'cam'
  | 't'
  | 'sel'
  | 'hover'
  | 'focus'
  | 'layers'
  | 'units'
  | 'thumb'
  | 'edit'
  | 'placing'
  | 'ruler'
  | 'ghost'
  | 'hoverT'
  | 'ref'
  | 'origin';

export const ALL_INPUTS: readonly CtxField[] = [
  'profile',
  'scene',
  'derived',
  'cam',
  't',
  'sel',
  'hover',
  'focus',
  'layers',
  'units',
  'thumb',
  'edit',
  'placing',
  'ruler',
  'ghost',
  'hoverT',
  'ref',
  'origin',
];

export type LayerDef = {
  id: string;
  label?: string;
  order?: number;
  chip?: number | null;
  defaultOn?: boolean;
  cameras?: CamKind[];
  inputs?: readonly CtxField[];
  draw?: (ctx: Ctx) => string;
};

export type Layer = {
  id: string;
  label: string;
  order: number;
  chip: number | null;
  defaultOn: boolean;
  cameras: CamKind[];
  inputs: readonly CtxField[];
  draw: (ctx: Ctx) => string;
};

/** Legacy Sc.LAYER_LABELS: the chip names of the eight LayerIds. */
export const LAYER_LABELS: Record<LayerId, string> = {
  reach: 'Reach',
  events: 'Events',
  envelopes: 'Envelopes',
  tracks: 'Tracks',
  telemetry: 'Telemetry',
  labels: 'Labels',
  rings: 'Rings',
  target: 'Target TSPI',
};

/** Legacy Sc.defaultLayers. */
export function defaultLayers(): Record<LayerId, boolean> {
  return {
    reach: true,
    events: true,
    envelopes: true,
    tracks: true,
    telemetry: false,
    labels: true,
    rings: false,
    target: true,
  };
}

const reg: Record<string, Layer> = {};

function norm(def: LayerDef): Layer {
  if (!def || typeof def.id !== 'string' || !def.id)
    throw new Error('layers.register needs an id.');
  const chip = def.chip == null ? null : def.chip;
  return {
    id: def.id,
    label:
      def.label || (chip != null && (LAYER_LABELS as Record<string, string>)[def.id]) || def.id,
    order: typeof def.order === 'number' ? def.order : 0,
    chip,
    defaultOn: def.defaultOn !== false,
    cameras: Array.isArray(def.cameras) ? def.cameras.slice() : ['plan', 'elev', 'axon'],
    inputs: def.inputs ? def.inputs.slice() : [],
    draw: typeof def.draw === 'function' ? def.draw : () => '',
  };
}

function byOrder(a: Layer, b: Layer): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function register(def: LayerDef): Layer {
  const l = norm(def);
  reg[l.id] = l;
  return l;
}

export function list(): Layer[] {
  return Object.keys(reg)
    .map((k) => reg[k]!)
    .sort(byOrder);
}

/** The chip layers in chip order (1 reach ... 8 target). */
export function chips(): Layer[] {
  return Object.keys(reg)
    .map((k) => reg[k]!)
    .filter((l) => l.chip != null)
    .sort((a, b) => a.chip! - b.chip!);
}

export const layers = { register, list, chips };
