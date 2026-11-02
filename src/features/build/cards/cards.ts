// Cards from Build (spec section 5, Card; mockup `t-card`, line 404): a card stores the way of
// looking at the board now (camera, the toggled layers, focus, time). It is never a picture.
// Each edit is one undo step.
import { cameras, VIEW_TO_CAM, type Cam } from '../../../board';
import { find } from '../../../commands/select';
import { newKey, nextId } from '../../../domain/ids';
import type { Card, CardView, Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { showToast } from '../../shell/toastStore';
import { boardDerived, boardScene } from '../board/derived';
import { useBoard } from '../board/store';
import { toggledLayers } from '../bar/layers';

export const SAVED_TOAST = 'Card saved. Write its caption in Brief.';
/** 3D has no inverse camera, so a 3D card keeps the default 3D view, not the pan and zoom. */
export const SAVED_TOAST_3D =
  'Card saved. 3D cards keep the default 3D view, not the pan and zoom. Write its caption in Brief.';

/** The lowest unused `c<n>` (spec section 3 item 5), minted as every other display id. */
export function nextCardId(cards: readonly Card[]): string {
  return nextId(
    'card',
    cards.map((c) => c.id),
  );
}

const SYSTEMS = (doc: Vignette) => [...doc.sensors, ...doc.effectors, ...doc.nodes];

/** Board reference (display id) to card reference (system key). */
function refToKey(doc: Vignette, ref: string): string {
  if (ref === 'asset' || ref === 'asset-edge') return ref;
  return SYSTEMS(doc).find((s) => s.id === ref)?.key ?? 'asset';
}

/** Card reference (system key) to board reference (display id). */
function refToId(doc: Vignette, ref: string): string {
  if (ref === 'asset' || ref === 'asset-edge') return ref;
  return SYSTEMS(doc).find((s) => s.key === ref)?.id ?? 'asset';
}

/** The mounted board's last camera and size. */
export type BoardCam = { cam: Cam; W: number; H: number };

let boardCam: () => BoardCam | null = () => null;

/**
 * BuildWorkspace hands in the mounted board's last render, as it hands the shell the board's
 * cancel; importing Board here would close an import cycle through the command registry.
 */
export function setBoardCam(fn: () => BoardCam | null): void {
  boardCam = fn;
}

type CamParams = {
  kind: CardView['kind'];
  yawDeg: number;
  pitchDeg: number;
  ref: string; // board reference (display id)
  elevationMode: CardView['elevationMode'];
};

/** A camera of the profile at a zoom and pan, the same one the board would set up. */
function camAt(
  doc: Vignette,
  p: CamParams,
  size: { W: number; H: number },
  zoom: number,
  px = 0,
  py = 0,
) {
  return cameras.get(VIEW_TO_CAM[p.kind]).setup(boardScene(doc).scene, boardDerived(doc), size, {
    yaw: p.yawDeg,
    pitch: p.pitchDeg,
    ref: p.ref,
    bounds: useBoard.getState().bounds ?? undefined,
    zoom,
    px,
    py,
    elevationMode: p.elevationMode,
  });
}

/** The board's size: the mounted board's last render, else the size the board last had (Brief). */
function boardSize(): { W: number; H: number } {
  const last = boardCam();
  return last ? { W: last.W, H: last.H } : useBoard.getState().size;
}

/** The world point at screen (sx, sy): plan x, y or elevation r, z; null in 3D. */
function worldAt(cam: Cam, sx: number, sy: number): { x: number; y: number } | null {
  const p = cam.unproject(sx, sy);
  if (!p) return null;
  return 'r' in p ? { x: p.r, y: p.z } : { x: p.x, y: p.y };
}

/** Screen pixels of a world point (plan x, y or elevation r, z) at the camera's zoom, no pan. */
function screenOf(cam: Cam, w: { x: number; y: number }): [number, number] {
  return cam.kind === 'elev' && cam.projectRZ ? cam.projectRZ(w.x, w.y) : cam.project(w.x, w.y);
}

/**
 * CardView.centre: the pan from the fitted view in metres (types.ts), the world point at the
 * middle of the board at this zoom and pan less the one at the middle of the fitted view.
 */
function centreOf(
  doc: Vignette,
  p: CamParams,
  zoom: number,
  px: number,
  py: number,
): { x: number; y: number } {
  const size = boardSize();
  const now = worldAt(camAt(doc, p, size, zoom, px, py), size.W / 2, size.H / 2);
  const fit = worldAt(camAt(doc, p, size, 1), size.W / 2, size.H / 2);
  if (!now || !fit) return { x: 0, y: 0 };
  return { x: Math.round(now.x - fit.x), y: Math.round(now.y - fit.y) };
}

/** A Build camera: the live board's, or the one Brief stashed on entry. `ref` is a display id. */
export type BuildCam = {
  view: CardView['kind'];
  yaw: number;
  pitch: number;
  ref: string;
  elevationMode: CardView['elevationMode'];
  zoom: number;
  px: number;
  py: number;
};

/**
 * The card view of a Build camera. Plan and Elevation keep the centre and zoom; 3D, whose camera
 * has no inverse, keeps the fitted frame (centre 0, 0, zoom 1) and its yaw and pitch.
 */
export function cardViewOf(doc: Vignette, c: BuildCam): CardView {
  const p: CamParams = {
    kind: c.view,
    yawDeg: c.yaw,
    pitchDeg: c.pitch,
    ref: c.ref,
    elevationMode: c.elevationMode,
  };
  const ref = refToKey(doc, c.ref);
  if (c.view === '3d') return { ...p, ref, centre: { x: 0, y: 0 }, zoom: 1 };
  return { ...p, ref, centre: centreOf(doc, p, c.zoom, c.px, c.py), zoom: c.zoom };
}

/** The card view of the board now. */
export function cardViewNow(doc: Vignette): CardView {
  const ui = useUi.getState();
  const b = useBoard.getState();
  return cardViewOf(doc, {
    view: ui.view,
    yaw: b.yaw,
    pitch: b.pitch,
    ref: b.ref,
    elevationMode: ui.elevationMode,
    zoom: b.zoom,
    px: b.px,
    py: b.py,
  });
}

/** A card of the board now. Focus is the selection without waypoints (mockup line 406). */
export function cardFromBuild(doc: Vignette): Card {
  const ui = useUi.getState();
  const focus = ui.selectedKeys.filter((k) => find(doc, k)?.kind !== 'waypoint');
  return {
    key: newKey(),
    id: nextCardId(doc.cards),
    name: `Card ${doc.cards.length + 1}`,
    view: cardViewNow(doc),
    layers: toggledLayers(useBoard.getState().layers),
    displays: { timeline: true, chart: false, readout: false },
    clip: null,
    focus,
    tS: ui.timeOn ? ui.tS : null,
    caption: '',
    notes: '',
  };
}

/**
 * Save the board now as a card, in one undo step. `afterKey` places it after that card; null
 * appends it. Returns the new card's key, or null with no profile open.
 */
export function saveCard(afterKey: string | null = null): string | null {
  const doc = useDocument.getState().doc;
  if (!doc) return null;
  const card = cardFromBuild(doc);
  useDocument.getState().edit('Save card', (d) => {
    const i = afterKey ? d.cards.findIndex((c) => c.key === afterKey) : -1;
    if (i >= 0) d.cards.splice(i + 1, 0, card);
    else d.cards.push(card);
  });
  showToast(card.view.kind === '3d' ? SAVED_TOAST_3D : SAVED_TOAST);
  return card.key;
}

/** Board pan that puts the card's centre at the middle of the board; none in 3D. */
function panFor(doc: Vignette, v: CardView): { px: number; py: number } {
  const last = boardCam();
  if (!last || v.kind === '3d') return { px: 0, py: 0 };
  const p: CamParams = { ...v, ref: refToId(doc, v.ref) };
  const fit = worldAt(camAt(doc, p, last, 1), last.W / 2, last.H / 2);
  if (!fit) return { px: 0, py: 0 };
  const at = screenOf(camAt(doc, p, last, v.zoom), {
    x: fit.x + v.centre.x,
    y: fit.y + v.centre.y,
  });
  return { px: last.W / 2 - at[0], py: last.H / 2 - at[1] };
}

/** Put the board back to a card: view, camera, layers, time (or slice) and focus. */
export function applyCard(card: Card): void {
  const doc = useDocument.getState().doc;
  if (!doc) return;
  const ui = useUi.getState();
  const b = useBoard.getState();
  ui.setView(card.view.kind);
  ui.setElevationMode(card.view.elevationMode);
  b.set({
    yaw: card.view.yawDeg,
    pitch: card.view.pitchDeg,
    ref: refToId(doc, card.view.ref),
    zoom: card.view.zoom,
    ...panFor(doc, card.view),
    layers: { ...b.layers, ...card.layers },
  });
  // A slice (lane 13.2): the loop is the slice, the rate its rate, the time its start with the
  // cursor on. A frame: the card's time (off for the full run) and no loop.
  if (card.clip) {
    ui.setLoop({ startS: card.clip.t0S, endS: card.clip.t1S });
    ui.setRate(card.clip.rate);
    ui.setTimeOn(true);
    ui.setTime(card.clip.t0S);
  } else {
    ui.setLoop(null);
    if (card.tS == null) ui.setTimeOn(false);
    else {
      ui.setTimeOn(true);
      ui.setTime(card.tS);
    }
  }
  ui.setSelection(card.focus.filter((k) => !!find(doc, k) || doc.events.some((e) => e.key === k)));
}

/** A copy after the original, with a new key and id, in one undo step. */
export function duplicateCard(key: string): string | null {
  const doc = useDocument.getState().doc;
  const src = doc?.cards.find((c) => c.key === key);
  if (!doc || !src) return null;
  const copy: Card = {
    ...structuredClone(src),
    key: newKey(),
    id: nextCardId(doc.cards),
    name: `${src.name} copy`,
  };
  useDocument.getState().edit(`duplicate card ${src.id}`, (d) => {
    const i = d.cards.findIndex((c) => c.key === key);
    d.cards.splice(i + 1, 0, copy);
  });
  return copy.key;
}

/** Move a card one place up (-1) or down (+1), in one undo step. False at an end. */
export function moveCard(key: string, by: -1 | 1): boolean {
  const doc = useDocument.getState().doc;
  if (!doc) return false;
  const i = doc.cards.findIndex((c) => c.key === key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= doc.cards.length) return false;
  useDocument.getState().edit(`move card ${doc.cards[i]!.id} ${by < 0 ? 'up' : 'down'}`, (d) => {
    const [c] = d.cards.splice(i, 1);
    d.cards.splice(j, 0, c!);
  });
  return true;
}

/** Delete a card, in one undo step. */
export function deleteCard(key: string): boolean {
  const doc = useDocument.getState().doc;
  const c = doc?.cards.find((x) => x.key === key);
  if (!c) return false;
  useDocument.getState().edit(`delete card ${c.id}`, (d) => {
    d.cards = d.cards.filter((x) => x.key !== key);
  });
  return true;
}
