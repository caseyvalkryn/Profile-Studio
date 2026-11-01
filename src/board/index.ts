// Public surface of the board renderer (src/board). Pure TypeScript: SVG strings in, no React,
// no store, no DOM. Legacy names (elev, axon, volumes, systems, aircraft) stay inside.
export { toScene } from './scene';
export { cameras, VIEW_TO_CAM, CAM_TO_VIEW, axonHint, type Cam, type CamView } from './cameras';
export {
  layers,
  chips,
  list,
  defaultLayers,
  LAYER_LABELS,
  type Ctx,
  type CtxField,
  type Layer,
} from './layers';
export {
  render,
  scene,
  card,
  hitTest,
  type BoardView,
  type RenderOpts,
  type RenderResult,
  type Fragment,
} from './render';
export { symbols } from './symbols';
export { makeUnits, type BoardUnits } from './format';
export type * from './types';
