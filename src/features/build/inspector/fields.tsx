// Inspector field helpers on top of src/ui Field.
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Field, Tooltip } from '../../../ui';
import { useUi } from '../../../state/ui';
import { toDisplay, toStored, unitOf, type Quantity } from './units';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-surface-3 px-3 py-3 first:border-t-0">
      <h3 className="text-xs font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function Grid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  const c = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[cols];
  return <div className={`grid ${c} gap-2`}>{children}</div>;
}

/** A read-only value in mono with its unit. */
export function Readout({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-text tabular-nums">
        {value}
        {unit ? <span className="text-muted"> {unit}</span> : null}
      </span>
    </div>
  );
}

/** Wraps a field so a pause over it shows what the value does. */
export function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip content={text} side="left">
      <div>{children}</div>
    </Tooltip>
  );
}

/** A numeric Field in display units; commits the stored value. */
export function UnitField(props: {
  label: string;
  q: Quantity;
  stored: number;
  onCommit: (stored: number) => void;
  min?: number;
}) {
  const units = useUi((s) => s.units);
  return (
    <Field
      label={props.label}
      unit={unitOf(units, props.q)}
      value={toDisplay(units, props.q, props.stored)}
      min={props.min}
      onCommit={(v) => props.onCommit(toStored(units, props.q, v))}
    />
  );
}

/**
 * A number box that can be blank, shows a placeholder, and shows a formatted value until focused.
 * src/ui Field has no blank state or placeholder; this covers speed, bearing and entered values.
 */
export function NumberInput(props: {
  label: string;
  value: number | undefined;
  unit?: string;
  placeholder?: string;
  format?: (n: number) => string;
  /** Commits `undefined` when the box is cleared, only if `blank` is set. */
  blank?: boolean;
  onCommit: (value: number | undefined) => void;
  note?: ReactNode;
}) {
  const id = useId();
  const shown = props.value === undefined ? '' : String(props.value);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(shown);
  const [synced, setSynced] = useState(shown);
  if (synced !== shown) {
    setSynced(shown);
    setDraft(shown);
  }

  const commit = () => {
    const t = draft.trim();
    if (t === '') {
      if (props.blank && props.value !== undefined) props.onCommit(undefined);
      else setDraft(shown);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) {
      setDraft(shown);
      return;
    }
    if (n !== props.value) props.onCommit(n);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') setDraft(shown);
  };

  const display =
    !focused && props.format && props.value !== undefined ? props.format(props.value) : draft;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted">
        {props.label}
      </label>
      <div className="flex h-7 items-center rounded-sm border border-surface-3 bg-surface-1 focus-within:border-accent">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={display}
          placeholder={props.placeholder}
          onFocus={() => setFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 rounded-sm bg-transparent px-2 font-mono text-sm text-text tabular-nums outline-none placeholder:text-muted"
        />
        {props.unit ? (
          <span className="pr-2 font-mono text-xs text-muted select-none" aria-hidden>
            {props.unit}
          </span>
        ) : null}
      </div>
      {props.note}
    </div>
  );
}

/** A labelled native select. */
export function Select<T extends string | number>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted">
        {props.label}
      </label>
      <select
        id={id}
        value={String(props.value)}
        onChange={(e) => {
          const hit = props.options.find((o) => String(o.value) === e.target.value);
          if (hit) props.onChange(hit.value);
        }}
        className="h-7 rounded-sm border border-surface-3 bg-surface-1 px-1 text-sm text-text"
      >
        {props.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A quiet one-line note. `warn` uses the warning color. */
export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return (
    <p
      className={`text-[11px] ${warn ? 'text-text' : 'text-muted'}`}
      role={warn ? 'status' : undefined}
    >
      {children}
    </p>
  );
}
