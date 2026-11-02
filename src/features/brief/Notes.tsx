// The notes panel (`legacy/mockup-v3.html` drawNotes, lines 501 to 508): the Card section with
// Up, Down and Delete; Name; Camera; Yaw and pitch; Zoom with Fit; Time in m:ss (empty is the full run); Focus ids (a
// comma list of display ids, stored as keys); the five layer toggles; the Timeline and Readout
// displays; then the Key points of the threats in focus with their definitions; Caption;
// Presenter notes; then the question as a hint. A text field is one undo step per focus-to-blur (the document's
// drag coalesces the keystrokes and the stage follows each one); a select or toggle is one step
// per change. With no card, the key points of every threat and the question. Lane 13.2: the
// Frame panel first (./Frame), the Slice field in the Card section (from, to, rate, Clear; from
// and to commit on blur or Enter as one undo step each, invalid text reverts), the key points
// drawn with their glyphs in the state inks (reached, current with "now", future).
import { Fragment, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { RATES } from '../../domain/catalog';
import { focusRing } from '../../ui/focus';
import type { Card, Vignette } from '../../domain/types';
import { useDocument, type Recipe } from '../../state/document';
import { CAM_TO_VIEW, VIEW_TO_CAM, type CamKind } from '../../board';
import { boardScene } from '../build/board/derived';
import { STAGES } from '../../engine';
import { useUi } from '../../state/ui';
import { boardDerived } from '../build/board/derived';
import { fmtTime } from '../shared/units';
import { DA_DEFINITION, STAGE_DEFINITION, STAGE_LABEL, keyPoints } from '../timeline/stages';
import { mmss } from '../../engine/tokens';
import { parseTime, pointStates } from '../timeline/layout';
import {
  fieldLabel,
  fitCard,
  setDisplays,
  setField,
  setFocusIds,
  setLayers,
  setSlice,
  type CardField,
} from './cards';
import { ZOOM_MAX, ZOOM_MIN } from './stageFrame';
import Frame, { Glyph } from './Frame';
import { captionPlaceholder, rateText } from './frameData';
import { Section } from './Section';

import { LAYER_GROUPS, groupOn, withGroup } from './layers';
import { idMaps } from './toCardRec';

const PROJ: readonly [CamKind, string][] = [
  ['plan', 'Plan'],
  ['elev', 'Elevation'],
  ['axon', '3D'],
];

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
  inputMode,
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
  inputMode?: 'decimal';
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
      inputMode={inputMode}
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
  placeholder,
}: {
  card: Card;
  field: CardField;
  label: string;
  rows: number;
  value: string;
  placeholder?: string;
}) {
  const f = useCoalesced(card, field, str);
  return (
    <textarea
      aria-label={label}
      className="ps-input w-full text-[13px]"
      rows={rows}
      placeholder={placeholder}
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

/**
 * One end of the slice: "m:ss" text in the mono face, parsed as the strip's clock. A commit on
 * blur or Enter writes the slice in one undo step; text that is not a time, or that puts the start
 * at or after the end, reverts. With no slice yet, a start makes a 30 s slice from it and an end
 * makes one of 30 s up to it.
 */
function SliceEnd({ card, end }: { card: Card; end: 't0S' | 't1S' }) {
  const clip = card.clip;
  const shown = clip ? mmss(clip[end]) : '';
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null || draft.trim() === shown) return setDraft(null);
    const t = parseTime(draft);
    setDraft(null);
    if (t == null) return;
    const base = clip ?? {
      t0S: end === 't0S' ? t : Math.max(0, t - 30),
      t1S: end === 't0S' ? t + 30 : t,
      rate: 1,
      beatsS: [],
    };
    setSlice(card.key, { ...base, [end]: t });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(null);
    }
  };
  const label = end === 't0S' ? 'Slice from' : 'Slice to';
  return (
    <input
      id={end === 't0S' ? 'brief-slice-from' : undefined}
      aria-label={label}
      className="ps-input min-h-7 w-full font-mono"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      placeholder="m:ss"
      data-testid={end === 't0S' ? 'brief-slice-from' : 'brief-slice-to'}
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

/** The Slice field: from, to, the rate (the strip's eight rates) and Clear. */
function SliceField({ card }: { card: Card }) {
  const clip = card.clip;
  return (
    <Field id="brief-slice-from" label="Slice">
      <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1.5">
        <SliceEnd card={card} end="t0S" />
        <span className="text-muted">to</span>
        <SliceEnd card={card} end="t1S" />
        <select
          aria-label="Slice rate"
          className="ps-input min-h-7 w-full font-mono"
          data-testid="brief-slice-rate"
          disabled={!clip}
          value={String(clip?.rate ?? 1)}
          onChange={(e) => {
            if (clip) setSlice(card.key, { ...clip, rate: Number(e.target.value) });
          }}
        >
          {RATES.map((r) => (
            <option key={r} value={String(r)}>
              {rateText(r)}
            </option>
          ))}
        </select>
        <span />
        <button
          type="button"
          className="ps-btn mini quiet justify-self-start"
          aria-label="Clear the slice"
          disabled={!clip}
          onClick={() => setSlice(card.key, null)}
        >
          Clear
        </button>
      </span>
    </Field>
  );
}

const DISPLAYS: readonly [keyof Card['displays'], string][] = [
  ['timeline', 'Timeline'],
  ['readout', 'Readout'],
];

/**
 * The key points of the threats in focus (every threat when the focus names none): each F2T2EA
 * step with its time and the system that gives it, and the defended asset entry. A press moves
 * the time cursor there, so the briefer can show each point on the stage; the definitions
 * under the list say what each step means.
 */
function KeyPoints({ v, focus }: { v: Vignette; focus: readonly string[] }) {
  const tS = useUi((s) => s.tS);
  const timeOn = useUi((s) => s.timeOn);
  const d = boardDerived(v);
  const paths = boardScene(v).scene.paths;
  const inFocus = paths.filter((p) => focus.includes(p.key));
  const list = inFocus.length ? inFocus : paths;
  const jump = (t: number) => {
    const u = useUi.getState();
    u.setTime(t);
    u.setTimeOn(true);
  };
  return (
    <Section title="Key points">
      {list.length ? (
        list.map((p) => {
          const points = keyPoints(d, p.id);
          // the state inks of the strip (lane 13.1 item 4), from the strip's own pointStates
          const states = pointStates(points, tS, timeOn);
          const state = (i: number) => states[i] ?? undefined;
          return (
            <div key={p.key} data-testid="brief-keypoints">
              <div className="font-mono text-xs font-medium text-text">{p.id}</div>
              {points.length ? (
                <ul className="m-0 list-none p-0">
                  {points.map((k, i) => (
                    <li key={k.stage}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-surface-2 ${focusRing}`}
                        title={k.definition}
                        aria-label={`${p.id} ${k.label} at ${fmtTime(k.t)}`}
                        data-state={state(i)}
                        onClick={() => jump(k.t)}
                      >
                        <Glyph stage={k.stage} className={state(i)} />
                        <span className="w-12 shrink-0 text-muted">{k.label}</span>
                        <span className="font-mono text-text">{fmtTime(k.t)}</span>
                        {states[i] === 'tl-current' ? (
                          <span className="text-accent">now</span>
                        ) : null}
                        {k.system ? <span className="font-mono text-muted">{k.system}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ps-hint">No key point yet: no sensor sees {p.id}.</p>
              )}
            </div>
          );
        })
      ) : (
        <p className="ps-hint">Add a threat to see its key points.</p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Definitions</summary>
        <dl className="m-0 mt-1 grid grid-cols-[56px_minmax(0,1fr)] gap-x-2 gap-y-1">
          {STAGES.map((s) => (
            <Fragment key={s}>
              <dt className="text-muted">{STAGE_LABEL[s]}</dt>
              <dd className="m-0 text-text">{STAGE_DEFINITION[s]}</dd>
            </Fragment>
          ))}
          <dt className="text-muted">DA</dt>
          <dd className="m-0 text-text">{DA_DEFINITION}</dd>
        </dl>
      </details>
    </Section>
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
          <Frame v={v} card={card} />
          <Section
            title="Card"
            right={
              <span className="flex gap-1">
                <button
                  type="button"
                  className="ps-btn mini"
                  aria-label="Move card up"
                  disabled={index <= 0}
                  onClick={() => onMove(-1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="ps-btn mini"
                  aria-label="Move card down"
                  disabled={index >= v.cards.length - 1}
                  onClick={() => onMove(1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="ps-btn mini quiet"
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
            {/* the frame: the zoom factor (the wheel on the stage sets it too) and Fit back to
                the fitted view; a 3D card keeps the default 3D view */}
            <Field id="brief-zoom" label="Zoom">
              <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <TextField
                  card={card}
                  field="zoom"
                  label="Zoom"
                  id="brief-zoom"
                  type="number"
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  value={String(Math.round(card.view.zoom * 100) / 100)}
                  parse={(s) => (s.trim() === '' ? 1 : Number(s))}
                  mono
                />
                <button
                  type="button"
                  className="ps-btn mini quiet"
                  aria-label="Fit the card"
                  disabled={
                    card.view.kind === '3d' ||
                    (card.view.zoom === 1 && card.view.centre.x === 0 && card.view.centre.y === 0)
                  }
                  onClick={() => fitCard(card.key)}
                >
                  Fit
                </button>
              </span>
            </Field>
            {/* m:ss as the Slice field beside it, through the strip's parser (review 13 F-08);
                empty is the full run, text that is not a time keeps the card's time; "Card time" tells
                it from the play bar's Time clock */}
            <Field id="brief-time" label="Time">
              <TextField
                card={card}
                field="tS"
                label="Card time"
                id="brief-time"
                placeholder="full run"
                inputMode="decimal"
                value={card.tS == null ? '' : mmss(card.tS)}
                parse={(s) => (s.trim() === '' ? null : (parseTime(s) ?? card.tS))}
                mono
              />
            </Field>
            <SliceField card={card} />
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
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2 text-xs">
              <span className="pt-0.5 text-muted">Displays</span>
              <span
                className="flex flex-wrap gap-x-2 gap-y-1"
                role="group"
                aria-label="Card displays"
              >
                {DISPLAYS.map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1 text-text">
                    <input
                      type="checkbox"
                      checked={card.displays[k]}
                      onChange={(e) => setDisplays(card.key, { [k]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </span>
            </div>
          </Section>
          <KeyPoints v={v} focus={card.focus} />
          <Section title="Caption">
            <TextArea
              card={card}
              field="caption"
              label="Caption"
              rows={4}
              value={card.caption}
              placeholder={captionPlaceholder(card)}
            />
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
        <>
          <Frame v={v} card={null} />
          <Section title="Question">
            <p className="m-0 text-text">{question}</p>
          </Section>
          <KeyPoints v={v} focus={[]} />
        </>
      )}
    </aside>
  );
}
