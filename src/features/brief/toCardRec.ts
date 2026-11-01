// The domain Card to the renderer's CardRec (src/board/types.ts), and the id maps the notes panel
// needs. `toScene` already maps every card (kind to cam.proj through the board's camera table,
// focus keys to display ids, the ref key to a system id), so the stage, the strip and the print
// pages read that one mapping rather than a second one here.
import type { Card, Vignette } from '../../domain/types';
import { VIEW_TO_CAM, type CardRec, type Scene } from '../../board';
import { boardScene } from '../build/board/derived';

/** The renderer's record of one card: the scene's mapping, else a direct build (a card not yet in the scene memo). */
export function toCardRec(v: Vignette, card: Card): CardRec {
  const scene = boardScene(v);
  const found = scene.cards.find((c) => c.key === card.key);
  // the stored frame (lane 11.F, F-02): the stage, the strip and print draw the card's zoom and
  // centre; a 3D card keeps zoom 1 and centre 0, 0, the default 3D view
  const frame = { zoom: card.view.zoom, centre: { ...card.view.centre } };
  if (found) return { ...found, cam: { ...found.cam, ...frame } };
  const ids = idMaps(scene);
  return {
    key: card.key,
    id: card.id,
    name: card.name,
    cam: {
      proj: VIEW_TO_CAM[card.view.kind],
      yaw: card.view.yawDeg,
      pitch: card.view.pitchDeg,
      ref: card.view.ref === 'asset' ? 'asset' : (ids.idOfKey.get(card.view.ref) ?? 'asset'),
      elevationMode: card.view.elevationMode,
      ...frame,
    },
    layers: { ...card.layers },
    focus: card.focus.map((k) => ids.idOfKey.get(k)).filter((x): x is string => x !== undefined),
    t: card.tS,
    caption: card.caption,
    notes: card.notes,
  };
}

export type IdMaps = { idOfKey: Map<string, string>; keyOfId: Map<string, string> };

/** Display id by key and key by display id over every object the board draws. */
export function idMaps(scene: Scene): IdMaps {
  const idOfKey = new Map<string, string>();
  const keyOfId = new Map<string, string>();
  const { systems, volumes, planes, paths } = scene.scene;
  for (const list of [systems, volumes, planes, paths, scene.events])
    for (const x of list) {
      idOfKey.set(x.key, x.id);
      keyOfId.set(x.id, x.key);
    }
  return { idOfKey, keyOfId };
}

/** The user's view names (spec section 2): the mockup prints the raw camera key. */
export const CAM_LABEL: Record<CardRec['cam']['proj'], string> = {
  plan: 'Plan',
  elev: 'Elevation',
  axon: '3D',
};

/** The strip's small line: "3D · t+200 s · default 3D view · e4, e5" (a 3D card keeps the default
 *  3D view, not the pan and zoom: lane 11.F, F-05). */
export function cardLine(rec: CardRec): string {
  const parts = [CAM_LABEL[rec.cam.proj]];
  if (rec.t != null) parts.push(`t+${Math.round(rec.t)} s`);
  if (rec.cam.proj === 'axon') parts.push('default 3D view');
  if (rec.focus.length) parts.push(rec.focus.join(', '));
  return parts.join(' · ');
}
