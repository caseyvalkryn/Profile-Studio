import { useId, useState, type KeyboardEvent } from 'react';
import { focusRing } from './focus';

type Common = {
  label: string;
  /** Unit suffix shown inside the box, for example `m`, `m/s`, `s`. */
  unit?: string;
  /** Entered-value source note shown under the box. */
  source?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export type NumberFieldProps = Common & {
  kind?: 'number';
  value: number;
  onCommit: (value: number) => void;
  /** Arrow keys step by this; Shift steps by 10 times it. */
  step?: number;
  min?: number;
  max?: number;
};

export type TextFieldProps = Common & {
  kind: 'text';
  value: string;
  onCommit: (value: string) => void;
};

export type FieldProps = NumberFieldProps | TextFieldProps;

function decimals(n: number): number {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

/**
 * A labelled input with the unit inside the box. Commits on blur or Enter, Escape reverts.
 * Numbers use the mono font.
 */
export function Field(props: FieldProps) {
  const { label, unit, source, disabled, className = '' } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  const shown = String(props.value);
  const [draft, setDraft] = useState(shown);
  const [synced, setSynced] = useState(shown);
  if (synced !== shown) {
    setSynced(shown);
    setDraft(shown);
  }

  const commit = () => {
    if (props.kind === 'text') {
      if (draft !== props.value) props.onCommit(draft);
      return;
    }
    const n = Number(draft.trim());
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(shown);
      return;
    }
    const v = clamp(n, props.min, props.max);
    setDraft(String(v));
    if (v !== props.value) props.onCommit(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit();
    } else if (e.key === 'Escape') {
      setDraft(shown);
    } else if (props.kind !== 'text' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const step = props.step ?? 1;
      const base = Number(draft);
      const from = Number.isFinite(base) ? base : props.value;
      const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
      const next = clamp(Number((from + delta).toFixed(decimals(step))), props.min, props.max);
      setDraft(String(next));
    }
  };

  const sourceId = source ? `${id}-source` : undefined;
  const numeric = props.kind !== 'text';

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>
      <div
        className={`flex h-7 items-center rounded-sm border border-surface-3 bg-surface-1 focus-within:border-accent ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        <input
          id={id}
          type="text"
          inputMode={numeric ? 'decimal' : undefined}
          value={draft}
          disabled={disabled}
          aria-describedby={sourceId}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className={`h-full min-w-0 flex-1 rounded-sm bg-transparent px-2 text-sm text-text ${
            numeric ? 'font-mono tabular-nums' : ''
          } ${focusRing} focus-visible:ring-0`}
        />
        {unit ? (
          <span className="pr-2 font-mono text-xs text-muted select-none" aria-hidden>
            {unit}
          </span>
        ) : null}
      </div>
      {source ? (
        <p id={sourceId} className="text-[11px] text-muted">
          {source}
        </p>
      ) : null}
    </div>
  );
}
