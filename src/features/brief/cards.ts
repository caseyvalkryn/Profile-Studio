// The Brief's reads and writes of the deck (`legacy/mockup-v3.html` lines 491 to 509: step,
// c-add, the notes handlers). Every write is one undo step through `useDocument.edit`, labelled
// with the card id ("rename card c2"). The current card is `ui.cardKey`; applying a card writes
// the Build view, time, board camera, layers and selection, so the Build board and the Brief
// stage agree (spec section 7, Brief; principle 8.1). Entering Brief stashes the Build view;
// leaving restores it.
import type { Card, LayerId, Vignette } from '../../domain/types';
import { newKey } from '../../domain/ids';
import { CAM_TO_VIEW, type CamKind } from '../../board';
import { useBoard } from '../build/board/store';
import { boardScene } from '../build/board/derived';
import { applyCard as applyToBuild, cardViewOf, nextCardId } from '../build/cards/cards';
import { showToast } from '../shell/toastStore';
import { useDocument, type Recipe } from '../../state/document';
import { useUi, type BuildStash, type View } from '../../state/ui';
import { fmtTime } from '../shared/units';
import { idMaps } from './toCardRec';

export { nextCardId };

const doc = () => useDocument.getState().doc;
const edit = (label: string, recipe: Recipe) => useDocument.getState().edit(label, recipe);

/** The current card's index in the deck: the key's card, else the first; -1 for an empty deck. */
export function currentIndex(cards: readonly Card[], key: string | null): number {
  if (!cards.length) return -1;
  const i = key ? cards.findIndex((c) => c.key === key) : -1;
  return i < 0 ? 0 : i;
}

export function currentCard(v: Vignette | null, key: string | null): Card | null {
  if (!v) return null;
  const i = currentIndex(v.cards, key);
  return i < 0 ? null : (v.cards[i] ?? null);
}

/** Make the card at `i` current (wrapping) and apply its view. */
export function goTo(i: number): void {
  const v = doc();
  if (!v || !v.cards.length) return;
  const n = v.cards.length;
  const card = v.cards[((i % n) + n) % n]!;
  useUi.getState().setCardKey(card.key);
  applyCard(v, card);
}

/** Next (+1) or previous (-1) card, wrapping, as the mockup's `step`. */
export function step(d: number): void {
  const v = doc();
  if (!v) return;
  goTo(currentIndex(v.cards, useUi.getState().cardKey) + d);
}

/**
 * Write the card's view, time, camera, layers and selection to the Build stores, through the one
 * implementation in src/features/build/cards (the card menu's Open uses the same).
 */
export function applyCard(_v: Vignette, card: Card): void {
  applyToBuild(card);
}

/** A copy of the Build view and time, as the stash holds it. */
export function snapshotBuild(): BuildStash {
  const ui = useUi.getState();
  const b = useBoard.getState();
  return {
    view: ui.view,
    elevationMode: ui.elevationMode,
    tS: ui.tS,
    timeOn: ui.timeOn,
    zoom: b.zoom,
    px: b.px,
    py: b.py,
    yaw: b.yaw,
    pitch: b.pitch,
    ref: b.ref,
    layers: { ...b.layers },
  };
}

/** Entering Brief: stash the Build view once. */
export function stashBuild(): void {
  const ui = useUi.getState();
  if (!ui.buildStash) ui.setBuildStash(snapshotBuild());
}

/** Leaving Brief: restore the Build view and clear the stash. */
export function restoreBuild(): void {
  const ui = useUi.getState();
  const s = ui.buildStash;
  if (!s) return;
  ui.setView(s.view);
  ui.setElevationMode(s.elevationMode);
  ui.setTime(s.tS);
  ui.setTimeOn(s.timeOn);
  useBoard.getState().set({
    zoom: s.zoom,
    px: s.px,
    py: s.py,
    yaw: s.yaw,
    pitch: s.pitch,
    ref: s.ref,
    layers: { ...s.layers },
  });
  ui.setBuildStash(null);
}

/**
 * A card from a Build view: the stash while Brief is open (the view the user left), else the live
 * Build stores. The centre and zoom are the stash's (a 3D card keeps the fitted frame); the
 * board's `ref` is a display id and the card stores the key.
 */
export function cardFromBuild(v: Vignette, from: BuildStash = snapshotBuild()): Card {
  const layers: Partial<Record<LayerId, boolean>> = {};
  for (const [k, on] of Object.entries(from.layers)) layers[k as LayerId] = on;
  return {
    key: newKey(),
    id: nextCardId(v.cards),
    name: `Card ${v.cards.length + 1}`,
    view: cardViewOf(v, from),
    layers,
    displays: { timeline: true, chart: false, readout: false },
    clip: null,
    focus: useUi.getState().selectedKeys.slice(),
    tS: from.timeOn ? from.tS : null,
    caption: '',
    notes: '',
  };
}

/** "Add card from current scene": append a card from the stashed Build view and open it. */
export function addCard(): void {
  const v = doc();
  if (!v) return;
  const card = cardFromBuild(v, useUi.getState().buildStash ?? snapshotBuild());
  edit(`add card ${card.id}`, (d) => {
    d.cards.push(card);
  });
  useUi.getState().setCardKey(card.key);
  if (card.view.kind === '3d') showToast(ADDED_TOAST_3D);
  const next = doc();
  if (next) applyCard(next, card);
}

/** 3D has no inverse camera, so a card added from a 3D view keeps the default 3D view. */
export const ADDED_TOAST_3D =
  'Card added. 3D cards keep the default 3D view, not the pan and zoom.';

/** "Card 3 at t+2:08" without its time, so a frame of a frame does not stack the suffix. */
const baseName = (name: string) => name.replace(/ at (t\+\d+:\d{2}|full run)$/, '');

/**
 * Save a frame: the stage now as a new card after the current one. The frame keeps the card's
 * view, layers, displays and focus and takes the current time (null while time is off); its
 * caption and notes start empty. With no card, the stashed Build view is the frame. One undo
 * step; the frame becomes the current card.
 */
export function snapshotCard(): string | null {
  const v = doc();
  if (!v) return null;
  const ui = useUi.getState();
  const i = currentIndex(v.cards, ui.cardKey);
  const base = i >= 0 ? v.cards[i]! : null;
  const t = ui.timeOn ? Math.round(ui.tS * 10) / 10 : null;
  const card: Card = base
    ? {
        ...structuredClone(base),
        key: newKey(),
        id: nextCardId(v.cards),
        name: `${baseName(base.name)} at ${t == null ? 'full run' : fmtTime(t)}`,
        tS: t,
        caption: '',
        notes: '',
      }
    : cardFromBuild(v, ui.buildStash ?? snapshotBuild());
  edit(`save frame ${card.id}`, (d) => {
    d.cards.splice(i + 1, 0, card);
  });
  ui.setCardKey(card.key);
  showToast(`Frame saved as card ${i + 2}. Write its caption.`);
  const next = doc();
  if (next) applyCard(next, card);
  return card.key;
}

/** Set the card's displays (timeline, chart, readout); one undo step. */
export function setDisplays(key: string, patch: Partial<Card['displays']>): void {
  const id = doc()?.cards.find((c) => c.key === key)?.id ?? '';
  edit(`set card ${id} ${Object.keys(patch).join(', ')}`, (d) => {
    const c = d.cards.find((x) => x.key === key);
    if (c) c.displays = { ...c.displays, ...patch };
  });
}

/** Flip one display of the current card. */
export function toggleDisplay(field: keyof Card['displays']): void {
  const c = currentCard(doc(), useUi.getState().cardKey);
  if (c) setDisplays(c.key, { [field]: !c.displays[field] });
}

/** Move the current card up (-1) or down (+1) in the deck; one undo step. */
export function moveCard(d: -1 | 1): void {
  const v = doc();
  if (!v) return;
  const i = currentIndex(v.cards, useUi.getState().cardKey);
  const j = i + d;
  if (i < 0 || j < 0 || j >= v.cards.length) return;
  const { id, key } = v.cards[i]!;
  edit(`move card ${id} ${d < 0 ? 'up' : 'down'}`, (dr) => {
    const [c] = dr.cards.splice(i, 1);
    dr.cards.splice(j, 0, c!);
  });
  // The moved card stays current (the mockup's cardIx follows it).
  useUi.getState().setCardKey(key);
}

/** Delete the current card with undo; the neighbour becomes current. */
export function deleteCard(): void {
  const v = doc();
  if (!v) return;
  const i = currentIndex(v.cards, useUi.getState().cardKey);
  if (i < 0) return;
  const id = v.cards[i]!.id;
  const neighbour = v.cards[i + 1] ?? v.cards[i - 1] ?? null;
  edit(`delete card ${id}`, (dr) => {
    dr.cards.splice(i, 1);
  });
  useUi.getState().setCardKey(neighbour?.key ?? null);
  const next = doc();
  if (next && neighbour) applyCard(next, neighbour);
}

/** The fields the notes panel writes, each one undo step per commit. */
export type CardField = 'name' | 'caption' | 'notes' | 'tS' | 'yawDeg' | 'pitchDeg' | 'kind';

export const FIELD_LABEL: Record<CardField, string> = {
  name: 'rename card',
  caption: 'set card {id} caption',
  notes: 'set card {id} notes',
  tS: 'set card {id} time',
  yawDeg: 'set card {id} yaw',
  pitchDeg: 'set card {id} pitch',
  kind: 'set card {id} camera',
};

export function fieldLabel(field: CardField, id: string): string {
  const l = FIELD_LABEL[field];
  return l.includes('{id}') ? l.replace('{id}', id) : `${l} ${id}`;
}

/** The recipe that writes one field of the card with this key. */
export function setField(key: string, field: CardField, value: unknown): Recipe {
  return (d) => {
    const c = d.cards.find((x) => x.key === key);
    if (!c) return;
    if (field === 'name') c.name = String(value);
    else if (field === 'caption') c.caption = String(value);
    else if (field === 'notes') c.notes = String(value);
    else if (field === 'tS') c.tS = value == null ? null : Math.max(0, Number(value));
    else if (field === 'yawDeg') c.view.yawDeg = Number(value);
    else if (field === 'pitchDeg') c.view.pitchDeg = Math.min(86, Math.max(8, Number(value)));
    else if (field === 'kind') c.view.kind = camToView(value);
  };
}

function camToView(value: unknown): View {
  if (value === 'plan' || value === 'elevation' || value === '3d') return value;
  return CAM_TO_VIEW[value as CamKind] ?? 'plan';
}

/** Set the card's focus from a comma list of display ids; unknown ids are dropped. One undo step. */
export function setFocusIds(v: Vignette, key: string, text: string): void {
  const { keyOfId } = idMaps(boardScene(v));
  const keys = text
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((id) => keyOfId.get(id))
    .filter((k): k is string => k !== undefined);
  const id = v.cards.find((c) => c.key === key)?.id ?? '';
  edit(`set card ${id} focus`, (d) => {
    const c = d.cards.find((x) => x.key === key);
    if (c) c.focus = keys;
  });
}

/** Set the card's layers; one undo step. */
export function setLayers(key: string, layers: Partial<Record<LayerId, boolean>>): void {
  const id = doc()?.cards.find((c) => c.key === key)?.id ?? '';
  edit(`set card ${id} layers`, (d) => {
    const c = d.cards.find((x) => x.key === key);
    if (c) c.layers = { ...layers };
  });
}
