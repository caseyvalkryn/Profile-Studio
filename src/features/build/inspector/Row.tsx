// Inspector primitives in the mockup layout (legacy/mockup-v3.html .sec, .f, .item, .sub): a
// section with a head and an action, 88 px label rows, selectable item rows, and fields that write
// on input. One field's keystrokes are one undo step: the step begins at the first input and ends
// on blur or Enter (useDocument beginDrag, updateDrag, endDrag). Escape, or a value that does not
// parse at commit, reverts the field and its step.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDocument, type Recipe } from '../../../state/document';
import { useUi, type Units } from '../../../state/ui';
import { focusRing } from '../../../ui/focus';
import { readout } from '../../shared/units';
import { parseValue, shown, suffix, type FieldType } from './parse';

export const CONTROL = `h-ctl-dense w-full min-w-0 rounded-[3px] border border-surface-3 bg-surface-0 px-[5px] text-data text-text ${focusRing}`;
export const MINI = `h-ctl-dense shrink-0 rounded-[3px] border border-surface-3 bg-surface-1 px-2 text-data text-text hover:bg-surface-3 disabled:opacity-40 ${focusRing}`;
export const X = `h-ctl-mini w-[22px] shrink-0 rounded-[3px] text-data text-muted hover:bg-surface-3 hover:text-text disabled:opacity-40 ${focusRing}`;

/** Unfocused text at readout precision (review 2 F-09): 2.70 nm, 328 ft, 31 kt. */
export function restText(
  m: number | null | undefined,
  ty: FieldType,
  units: Units,
): string | undefined {
  if (m === null || m === undefined || !Number.isFinite(m)) return undefined;
  if (ty === 'h') return readout('range', m, units);
  if (ty === 'v' || ty === 'vz') return readout('altitude', m, units);
  if (ty === 'spd') return readout('speed', m, units);
  return undefined;
}

/** A section: a 12 px head with an optional action, then its rows. */
export function Sec(props: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <section
      aria-label={props.title}
      className="border-t border-surface-3 pt-2.5 pb-1.5 first:border-t-0 first:pt-0"
    >
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <h2 className="text-data font-medium text-muted">{props.title}</h2>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

/** A group head inside a section. */
export function Group({ children }: { children: ReactNode }) {
  return <h3 className="mt-1.5 mb-0.5 px-1.5 text-micro font-medium text-muted">{children}</h3>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="my-1 text-data text-muted">{children}</p>;
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="my-1 text-micro whitespace-pre-line text-state-warning">
      {children}
    </p>
  );
}

/** A field row: an 88 px caption, then one or two controls. */
export function F(props: {
  caption?: string;
  two?: boolean;
  top?: boolean;
  /** Grid columns in place of the default 88 px label and one or two equal controls. */
  cols?: string;
  children: ReactNode;
}) {
  const cols = props.cols ?? (props.two ? 'grid-cols-[88px_1fr_1fr]' : 'grid-cols-[88px_1fr]');
  return (
    <div className={`mb-1.5 grid gap-x-2 ${props.top ? 'items-start' : 'items-center'} ${cols}`}>
      {props.caption !== undefined ? (
        <span className="truncate text-data font-medium text-muted">{props.caption}</span>
      ) : null}
      {props.children}
    </div>
  );
}

/** A small button for a section head (Add). */
export function Mini(props: {
  name?: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.name}
      aria-pressed={props.pressed}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={MINI}
    >
      {props.children}
    </button>
  );
}

/** The remove button of a row. */
export function Remove(props: { name: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={props.name}
      disabled={props.disabled}
      onClick={props.onClick}
      className={X}
    >
      ×
    </button>
  );
}

/**
 * A selectable object row (mockup .item): a select button with the title and the meta line, and a
 * remove button. The selected row carries `aria-current` and shows its fields under it.
 */
export function Item(props: {
  id: string;
  current: boolean;
  onSelect: () => void;
  title: ReactNode;
  meta?: ReactNode;
  lead?: ReactNode;
  onRemove?: () => void;
  children?: ReactNode;
}) {
  return (
    <div>
      <div
        aria-current={props.current ? 'true' : undefined}
        className={`flex items-start gap-1.5 rounded-[4px] px-1.5 py-1.5 hover:bg-surface-3 ${
          props.current ? 'bg-surface-3 shadow-[inset_2px_0_0_var(--accent)]' : ''
        }`}
      >
        <button
          type="button"
          aria-label={`Select ${props.id}`}
          onClick={props.onSelect}
          className={`flex min-w-0 flex-1 cursor-default gap-1.5 text-left ${focusRing}`}
        >
          {props.lead}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium text-text">{props.title}</span>
            {props.meta !== undefined ? (
              <span className="block truncate font-mono text-micro text-muted">{props.meta}</span>
            ) : null}
          </span>
        </button>
        {props.onRemove ? <Remove name={`Remove ${props.id}`} onClick={props.onRemove} /> : null}
      </div>
      {props.current && props.children ? (
        <div className="px-1.5 pt-1 pb-2.5">{props.children}</div>
      ) : null}
    </div>
  );
}

const SWATCH = {
  hostile: 'bg-[var(--state-hostile)]',
  friend: 'bg-[var(--friend)]',
  neutral: 'border border-[var(--neutral)]',
} as const;

/** The colour mark before a row title (mockup .sw: h, f, n). */
export function Swatch({ kind }: { kind: keyof typeof SWATCH }) {
  return <span aria-hidden className={`mt-[5px] inline-block size-2 shrink-0 ${SWATCH[kind]}`} />;
}

/** Toggle the selection to one key: a click on the selected row clears it. */
export function toggle(key: string, current: boolean) {
  useUi.getState().setSelection(current ? [] : [key]);
}

/**
 * One undo step per field: `write` opens the step on the first input and applies each value to the
 * live document; `end` closes it; `cancel` reverts it. The label is the one at the first input, so
 * a rename typed into the id field stays one step.
 */
export function useCoalesce(label: string) {
  const active = useRef<string | null>(null);
  const mine = () => {
    const drag = useDocument.getState().drag;
    return active.current !== null && drag !== null && drag.label === active.current;
  };
  const write = (recipe: Recipe) => {
    if (!mine()) {
      useDocument.getState().beginDrag(label);
      active.current = label;
    }
    useDocument.getState().updateDrag(recipe);
  };
  const end = () => {
    if (mine()) useDocument.getState().endDrag();
    active.current = null;
  };
  const cancel = () => {
    if (mine()) useDocument.getState().cancelDrag();
    active.current = null;
  };
  useEffect(
    () => () => {
      const drag = useDocument.getState().drag;
      if (active.current !== null && drag && drag.label === active.current) {
        useDocument.getState().endDrag();
      }
    },
    [],
  );
  return { write, end, cancel };
}

/** What a field does with a typed text: a recipe to apply, an error, or nothing. */
export type Write = (text: string) => Recipe | string | null;

/** A text field (or textarea) that writes on input, as one undo step per focus. */
export function Field(props: {
  name: string;
  label: string;
  value: string;
  rest?: string;
  write: Write;
  mono?: boolean;
  placeholder?: string;
  rows?: number;
  /** The id of a datalist the input suggests from. */
  list?: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const bad = useRef<string | null>(null);
  const step = useCoalesce(props.label);

  const input = (text: string) => {
    setDraft(text);
    const r = props.write(text);
    if (typeof r === 'function') {
      bad.current = null;
      step.write(r);
    } else bad.current = r;
  };
  const commit = () => {
    if (bad.current !== null) {
      setErr(bad.current);
      step.cancel();
      setDraft(null);
    } else {
      setErr(null);
      step.end();
    }
    bad.current = null;
  };
  const revert = () => {
    step.cancel();
    bad.current = null;
    setErr(null);
    setDraft(null);
  };

  const shownText = focused ? (draft ?? props.value) : (props.rest ?? props.value);
  const common = {
    'aria-label': props.name,
    'aria-invalid': err ? true : undefined,
    autoComplete: 'off',
    spellCheck: false,
    placeholder: props.placeholder,
    value: shownText,
    onFocus: () => {
      setFocused(true);
      setDraft(null);
    },
    onBlur: () => {
      setFocused(false);
      commit();
    },
  };
  const font = props.mono ? 'font-mono' : 'font-sans';
  return (
    <span className={`flex min-w-0 flex-col ${props.className ?? ''}`}>
      {props.rows ? (
        <textarea
          {...common}
          rows={props.rows}
          onChange={(e) => input(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') revert();
          }}
          className={`min-h-12 w-full min-w-0 resize-y rounded-[3px] border border-surface-3 bg-surface-0 px-[5px] py-0.5 text-data text-text ${font} ${focusRing}`}
        />
      ) : (
        <input
          {...common}
          type="text"
          list={props.list}
          onChange={(e) => input(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Blur commits (onBlur) and returns focus to the page, so the next Cmd+Z is the
              // app's undo, not the input's native undo (review 10.R follow-up, lane 10.F2).
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') revert();
          }}
          className={`${CONTROL} ${font}`}
        />
      )}
      {err ? <Warn>{err}</Warn> : null}
    </span>
  );
}

/** A number in display units (legacy `ufld`), parsed with the legacy words. */
export function NumField(props: {
  name: string;
  label: string;
  ty: FieldType;
  stored: number | null | undefined;
  set: (v: number | null) => Recipe;
  nullable?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const units = useUi((s) => s.units);
  return (
    <Field
      name={props.name}
      label={props.label}
      mono
      className={props.className}
      placeholder={props.placeholder}
      value={shown(props.stored, props.ty, units)}
      rest={restText(props.stored, props.ty, units)}
      write={(text) => {
        if (props.nullable && text.trim() === '') return props.set(null);
        const r = parseValue(props.ty, text, units, useUi.getState().tS);
        return r.err !== undefined ? r.err : props.set(r.v);
      }}
    />
  );
}

/** A select that writes one undo step per change. */
export function Choice<T extends string>(props: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <select
      aria-label={props.name}
      value={props.value}
      onChange={(e) => {
        const hit = props.options.find((o) => o[0] === e.target.value);
        if (hit) props.onChange(hit[0]);
      }}
      className={`${CONTROL} px-0.5 font-sans ${props.className ?? ''}`}
    >
      {props.options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** The unit word for a field type in the current units, for captions. */
export function useSuffix(ty: FieldType): string {
  const units = useUi((s) => s.units);
  return suffix(ty, units);
}

/** One undo step through the document store. */
export function edit(label: string, recipe: Recipe) {
  useDocument.getState().edit(label, recipe);
}
