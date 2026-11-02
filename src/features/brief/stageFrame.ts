// The stage's frame maths: a wheel zooms the card about the cursor, a drag pans it, and in 3D a
// drag orbits (the Build board's rates) while Shift and drag pans. Pure functions over the card
// and the stage size; they return the new `CardView` frame and the stage writes it through the
// document's drag edit. The camera is the one `render.card` builds for the stored frame
// (src/board/render.ts framePan): the scene bounds, no pan, so a zoom here draws exactly where
// the stage shows it. In 3D the centre is a ground point (the camera's `unprojectGround`).
import type { Card, CardView, Vignette } from '../../domain/types';
import { cameras, VIEW_TO_CAM, type Cam } from '../../board';
import { bounds as geoBounds } from '../../board/geo';
import { clamp } from '../../board/svg';
import { boardDerived, boardScene } from '../build/board/derived';
import { toCardRec } from './toCardRec';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8;
/** The wheel's zoom per pixel of deltaY, the Build board's rate (gestures.ts onWheel). */
export const WHEEL_RATE = 0.0015;
/** The palette's zoom step (Build's view.zoomIn). */
export const ZOOM_STEP = 1.25;
/** The orbit rates in degrees per pixel and the pitch limits (spec section 7, 3D). */
export const ORBIT = { yaw: 0.45, pitch: 0.35, pitchMin: 8, pitchMax: 86 };

export type Frame = Pick<CardView, 'zoom' | 'centre'>;
export type Size = { W: number; H: number };
type Pt = { x: number; y: number };

/** The card's camera at `zoom` with no pan. */
function camAt(v: Vignette, card: Card, sz: Size, zoom: number): Cam {
  const scene = boardScene(v);
  return cameras.get(VIEW_TO_CAM[card.view.kind]).setup(scene.scene, boardDerived(v), sz, {
    yaw: card.view.yawDeg,
    pitch: card.view.pitchDeg,
    ref: toCardRec(v, card).cam.ref,
    bounds: geoBounds(scene.scene),
    zoom,
    px: 0,
    py: 0,
    elevationMode: card.view.elevationMode,
  });
}

/** The world point at a stage pixel: plan x, y, elevation r, z, or the 3D ground point. */
function worldAt(cam: Cam, sx: number, sy: number): Pt | null {
  const p = cam.unprojectGround ? cam.unprojectGround(sx, sy) : cam.unproject(sx, sy);
  if (!p) return null;
  return 'r' in p ? { x: p.r, y: p.z } : { x: p.x, y: p.y };
}

/** The world offset from the stage middle to a stage pixel at this camera. */
function offset(cam: Cam, sz: Size, sx: number, sy: number): Pt | null {
  const mid = worldAt(cam, sz.W / 2, sz.H / 2);
  const at = worldAt(cam, sx, sy);
  return mid && at ? { x: at.x - mid.x, y: at.y - mid.y } : null;
}

const round = (f: Frame): Frame => ({
  zoom: Math.round(f.zoom * 1000) / 1000,
  centre: { x: Math.round(f.centre.x), y: Math.round(f.centre.y) },
});

/**
 * Zoom by `factor` about the stage pixel (sx, sy): the world point under the cursor stays
 * under it. Null when the frame does not change (at a zoom limit).
 */
export function zoomAt(
  v: Vignette,
  card: Card,
  sz: Size,
  factor: number,
  sx: number,
  sy: number,
): Frame | null {
  const z0 = card.view.zoom;
  const z1 = clamp(z0 * factor, ZOOM_MIN, ZOOM_MAX);
  if (z1 === z0) return null;
  const c0 = camAt(v, card, sz, z0);
  const c1 = camAt(v, card, sz, z1);
  const d0 = offset(c0, sz, sx, sy);
  const d1 = offset(c1, sz, sx, sy);
  if (!d0 || !d1) return null;
  // the cursor's world point: the middle (fit + centre) plus its offset at z0; the new middle
  // puts it back at the cursor: that point less its offset at z1
  const { centre } = card.view;
  return round({
    zoom: z1,
    centre: { x: centre.x + d0.x - d1.x, y: centre.y + d0.y - d1.y },
  });
}

/** Pan the card by a drag of (dx, dy) stage pixels. */
export function panBy(v: Vignette, card: Card, sz: Size, dx: number, dy: number): Frame | null {
  const cam = camAt(v, card, sz, card.view.zoom);
  const d = offset(cam, sz, sz.W / 2 - dx, sz.H / 2 - dy);
  if (!d) return null;
  const { centre } = card.view;
  return round({ zoom: card.view.zoom, centre: { x: centre.x + d.x, y: centre.y + d.y } });
}

/** Orbit a 3D card by a drag of (dx, dy) pixels at the Build board's rates. */
export function orbitBy(
  view: Pick<CardView, 'yawDeg' | 'pitchDeg'>,
  dx: number,
  dy: number,
): Pick<CardView, 'yawDeg' | 'pitchDeg'> {
  return {
    yawDeg: Math.round((view.yawDeg + dx * ORBIT.yaw) * 10) / 10,
    pitchDeg:
      Math.round(clamp(view.pitchDeg - dy * ORBIT.pitch, ORBIT.pitchMin, ORBIT.pitchMax) * 10) / 10,
  };
}

/** "x2.5", "x1": the zoom as the notes and the head print it. */
export const zoomText = (zoom: number) => `x${Math.round(zoom * 100) / 100}`;
