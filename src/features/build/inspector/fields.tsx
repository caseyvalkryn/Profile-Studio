// Inspector field helpers on top of src/ui Field.
import { useId, type ReactNode } from 'react';
import { Field, Tooltip } from '../../../ui';
import { useUi } from '../../../state/ui';
import { fieldValue, fromDisplay, unitOf, type Quantity } from '../../shared/units';

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
      unit={unitOf(props.q, units)}
      value={fieldValue(props.q, props.stored, units)}
      min={props.min}
      onCommit={(v) => props.onCommit(fromDisplay(props.q, v, units))}
    />
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
      className={`text-[11px] ${warn ? 'text-state-warning' : 'text-muted'}`}
      role={warn ? 'status' : undefined}
    >
      {children}
    </p>
  );
}
