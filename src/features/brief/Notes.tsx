// The notes panel (`legacy/mockup-v3.html` drawNotes, lines 501 to 508): the Card section with
// Up, Down and Delete; Name; Camera; Yaw and pitch; Time s (empty is the full run); Focus ids (a
// comma list of display ids, stored as keys); the five layer toggles; Caption; Presenter notes;
// then the question as a hint. A text field is one undo step per focus-to-blur (the document's
// drag coalesces the keystrokes and the stage follows each one); a select or toggle is one step
// per change. With no card, the Purpose section alone.
import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { Card, Vignette } from '../../domain/types';
import { useDocument, type Recipe } from '../../state/document';
import { CAM_TO_VIEW, VIEW_TO_CAM, type CamKind } from '../../board';
import { boardScene } from '../build/board/derived';
import { fieldLabel, setField, setFocusIds, setLayers, type CardField } from './cards';
import { LAYER_GROUPS, groupOn, withGroup } from './layers';
import { idMaps } from './toCardRec';

const PROJ: readonly [CamKind, string][] = [
  ['plan', 'Plan'],
  ['elev', 'Elevation'],
  ['axon', '3D'],
];

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-surface-3 py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-xs font-medium text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 text-xs">
      <label htmlFor={id} className="text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * A text or number field that coalesces its keystrokes into one undo step: the document's drag
 * begins on focus and ends on blur; each keystroke updates the live document so the stage and
 * the strip follow. `parse` turns the input string into the stored value.
 */
function useCoalesced(card: Card, field: CardField, parse: (s: string) => unknown) {
  const [draft, setDraft] = useState<string | null>(null);
  const st = () => useDocument.getState();
  return {
    draft,
    onFocus: () => {
      st().beginDrag(fieldLabel(field, card.id));
      setDraft(null);
    },
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      if (!st().drag) st().beginDrag(fieldLabel(field, card.id));
      st().updateDrag(setField(card.key, field, parse(e.target.value)));
    },
    onBlur: () => {
      st().endDrag();
      setDraft(null);
    },
  };
}

const str = (s: string) => s;
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
const num = (s: string) => (s.trim() === '' ? 0 : Number(s));

function TextField({
  card,
  field,
  label,
  id,
  value,
  parse,
  type,
  min,
  max,
  placeholder,
  mono,
}: {
  card: Card;
  field: CardField;
  label: string;
  id: string;
  value: string;
  parse: (s: string) => unknown;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  placeholder?: string;
  mono?: boolean;
}) {
  const f = useCoalesced(card, field, parse);
  return (
    <input
      id={id}
      aria-label={label}
      className={`ps-input min-h-7 w-full${mono ? ' font-mono' : ''}`}
      type={type ?? 'text'}
      min={min}
      max={max}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      value={f.draft ?? value}
      onFocus={f.onFocus}
      onChange={f.onChange}
      onBlur={f.onBlur}
    />
  );
}

function TextArea({
  card,
  field,
  label,
  rows,
  value,
}: {
  card: Card;
  field: CardField;
  label: string;
  rows: number;
  value: string;
}) {
  const f = useCoalesced(card, field, str);
  return (
    <textarea
      aria-label={label}
      className="ps-input w-full text-[13px]"
      rows={rows}
      value={f.draft ?? value}
      onFocus={f.onFocus}
      onChange={f.onChange}
      onBlur={f.onBlur}
    />
  );
}

/** Focus ids: a comma list of display ids, committed to keys on blur or Enter (one undo step). */
function FocusField({ v, card }: { v: Vignette; card: Card }) {
  const { idOfKey } = idMaps(boardScene(v));
  const shown = card.focus
    .map((k) => idOfKey.get(k))
    .filter((x): x is string => x !== undefined)
    .join(', ');
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== shown) setFocusIds(v, card.key, draft);
    setDraft(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(null);
    }
  };
  return (
    <input
      id="brief-focus"
      aria-label="Focus ids"
      className="ps-input min-h-7 w-full font-mono"
      type="text"
      autoComplete="off"
      spellCheck={false}
      placeholder="T1, e4, WEZ-1"
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

export default function Notes({
  v,
  card,
  index,
  onMove,
  onDelete,
}: {
  v: Vignette;
  card: Card | null;
  index: number;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  const question = v.questions[0]?.text ?? '';
  const edit = (label: string, recipe: Recipe) => useDocument.getState().edit(label, recipe);
  return (
    <aside aria-label="Notes" className="brief-notes overflow-auto px-3 pt-3 pb-8 text-sm">
      {card ? (
        <>
          <Section
            title="Card"
            right={
              <span className="flex gap-1">
                <button
                  type="button"
                  className="ps-btn quiet"
                  aria-label="Move card up"
                  disabled={index <= 0}
                  onClick={() => onMove(-1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="ps-btn quiet"
                  aria-label="Move card down"
                  disabled={index >= v.cards.length - 1}
                  onClick={() => onMove(1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="ps-btn quiet"
                  aria-label="Delete card"
                  onClick={onDelete}
                >
                  Delete
                </button>
              </span>
            }
          >
            <Field id="brief-name" label="Name">
              <TextField
                card={card}
                field="name"
                label="Card name"
                id="brief-name"
                value={card.name}
                parse={str}
              />
            </Field>
            <Field id="brief-cam" label="Camera">
              <select
                id="brief-cam"
                aria-label="Camera"
                className="ps-input min-h-7 w-full"
                value={VIEW_TO_CAM[card.view.kind]}
                onChange={(e) =>
                  edit(
                    fieldLabel('kind', card.id),
                    setField(card.key, 'kind', CAM_TO_VIEW[e.target.value as CamKind]),
                  )
                }
              >
                {PROJ.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="brief-yaw" label="Yaw · pitch">
              <span className="grid grid-cols-2 gap-2">
                <TextField
                  card={card}
                  field="yawDeg"
                  label="Yaw"
                  id="brief-yaw"
                  type="number"
                  value={String(Math.round(card.view.yawDeg))}
                  parse={num}
                  mono
                />
                <TextField
                  card={card}
                  field="pitchDeg"
                  label="Pitch"
                  id="brief-pitch"
                  type="number"
                  min={8}
                  max={86}
                  value={String(Math.round(card.view.pitchDeg))}
                  parse={num}
                  mono
                />
              </span>
            </Field>
            <Field id="brief-time" label="Time s">
              <TextField
                card={card}
                field="tS"
                label="Time s"
                id="brief-time"
                type="number"
                min={0}
                placeholder="full run"
                value={card.tS == null ? '' : String(card.tS)}
                parse={numOrNull}
                mono
              />
            </Field>
            <Field id="brief-focus" label="Focus ids">
              <FocusField v={v} card={card} />
            </Field>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2 text-xs">
              <span className="pt-0.5 text-muted">Layers</span>
              <span
                className="flex flex-wrap gap-x-2 gap-y-1"
                role="group"
                aria-label="Card layers"
              >
                {LAYER_GROUPS.map((g) => (
                  <label key={g.id} className="flex items-center gap-1 text-text">
                    <input
                      type="checkbox"
                      checked={groupOn(card.layers, g)}
                      onChange={(e) =>
                        setLayers(card.key, withGroup(card.layers, g, e.target.checked))
                      }
                    />
                    {g.label}
                  </label>
                ))}
              </span>
            </div>
          </Section>
          <Section title="Caption">
            <TextArea card={card} field="caption" label="Caption" rows={4} value={card.caption} />
          </Section>
          <Section title="Presenter notes">
            <TextArea
              card={card}
              field="notes"
              label="Presenter notes"
              rows={8}
              value={card.notes}
            />
          </Section>
          <Section title="Question">
            <p className="ps-hint">{question}</p>
          </Section>
        </>
      ) : (
        <Section title="Question">
          <p className="m-0 text-text">{question}</p>
        </Section>
      )}
    </aside>
  );
}
