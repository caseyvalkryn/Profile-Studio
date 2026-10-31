// Legacy inspector rows (legacy/js/51-panel-inspector.js fld, ufld, sel, sec): a 96 px label on the
// left, a dense control, then a unit suffix. A value commits on blur or Enter; Escape reverts. A
// value that does not parse keeps the stored value and shows the legacy words under the row.
import { useId, useState, type ReactNode } from 'react';
import { useUi } from '../../../state/ui';
import { focusRing } from '../../../ui/focus';
import { readout } from '../../shared/units';
import type { Units } from '../../../state/ui';
import { parseValue, shown, suffix, type FieldType } from './parse';

/** Unfocused text at readout precision (review 2 F-09): 2.70 nm, 328 ft, 31 kt. */
function restText(m: number | null | undefined, ty: FieldType, units: Units): string | undefined {
  if (m === null || m === undefined || !Number.isFinite(m)) return undefined;
  if (ty === 'h') return readout('range', m, units);
  if (ty === 'v' || ty === 'vz') return readout('altitude', m, units);
  if (ty === 'spd') return readout('speed', m, units);
  return undefined;
}

const CONTROL = `h-ctl-dense min-w-0 flex-1 rounded-[3px] border border-surface-3 bg-surface-0 px-[5px] text-data text-text ${focusRing}`;

/** Legacy `sec`: a section with a caps label. */
export function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-b border-surface-3 px-2.5 pt-1.5 pb-2">
      <h2 className="mb-1.5 text-micro font-medium tracking-caps text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** Legacy `in-err`: a warning line. */
export function Warn({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="my-1 text-micro whitespace-pre-line text-state-warning">
      {children}
    </p>
  );
}

/** Legacy `hint`. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="my-1 text-micro text-muted">{children}</p>;
}

/** Legacy `fld`: label, control, suffix. */
export function Fld(props: {
  id: string;
  label: string;
  suf?: string;
  children: ReactNode;
  err?: string | null;
}) {
  return (
    <>
      <div className="my-[3px] flex items-center gap-1.5">
        <label htmlFor={props.id} className="w-24 shrink-0 text-micro text-muted">
          {props.label}
        </label>
        {props.children}
        {props.suf !== undefined ? (
          <span className="min-w-[34px] shrink-0 font-mono text-micro text-muted">{props.suf}</span>
        ) : null}
      </div>
      {props.err ? <Warn>{props.err}</Warn> : null}
    </>
  );
}

/** A text box that commits on blur or Enter and reverts on Escape. */
export function CommitInput(props: {
  id?: string;
  value: string;
  onCommit: (text: string) => void;
  mono?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** Text shown while the box has no focus (readout precision, review F-09). */
  rest?: string;
}) {
  const [draft, setDraft] = useState(props.value);
  const [focused, setFocused] = useState(false);
  const [prev, setPrev] = useState(props.value);
  if (prev !== props.value) {
    setPrev(props.value);
    setDraft(props.value);
  }
  const commit = () => {
    if (draft !== props.value) props.onCommit(draft);
  };
  return (
    <input
      id={props.id}
      type="text"
      autoComplete="off"
      spellCheck={false}
      aria-label={props.ariaLabel}
      placeholder={props.placeholder}
      value={focused || props.rest === undefined ? draft : props.rest}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setDraft(props.value);
        }
      }}
      className={`${CONTROL} ${props.mono ? 'font-mono' : 'font-sans'} ${props.className ?? ''}`}
    />
  );
}

/** Legacy `ufld`: a value in display units, parsed with the legacy words. */
export function UnitRow(props: {
  label: string;
  ty: FieldType;
  stored: number | null | undefined;
  onCommit: (v: number | null) => void;
  nullable?: boolean;
  placeholder?: string;
  /** Accessible name when it differs from the legacy label (e2e alias). */
  ariaLabel?: string;
  suf?: string;
}) {
  const id = useId();
  const units = useUi((s) => s.units);
  const [err, setErr] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  const value = shown(props.stored, props.ty, units);
  return (
    <Fld id={id} label={props.label} suf={props.suf ?? suffix(props.ty, units)} err={err}>
      <CommitInput
        key={`${value}-${seq}`}
        id={id}
        mono
        value={value}
        rest={restText(props.stored, props.ty, units)}
        placeholder={props.placeholder}
        ariaLabel={props.ariaLabel}
        onCommit={(text) => {
          if (props.nullable && text.trim() === '') {
            setErr(null);
            if (props.stored !== null && props.stored !== undefined) props.onCommit(null);
            return;
          }
          const r = parseValue(props.ty, text, units, useUi.getState().tS);
          if (r.err !== undefined) {
            setErr(r.err);
            setSeq((n) => n + 1);
            return;
          }
          setErr(null);
          if (r.v !== props.stored) props.onCommit(r.v);
        }}
      />
    </Fld>
  );
}

/** A prose text row. */
export function TextRow(props: {
  label: string;
  value: string;
  onCommit: (text: string) => void;
  placeholder?: string;
  mono?: boolean;
  err?: string | null;
}) {
  const id = useId();
  return (
    <Fld id={id} label={props.label} err={props.err}>
      <CommitInput
        id={id}
        value={props.value}
        mono={props.mono}
        placeholder={props.placeholder}
        onCommit={props.onCommit}
      />
    </Fld>
  );
}

/** A multi-line prose row (legacy textarea). */
export function AreaRow(props: {
  label: string;
  value: string;
  rows?: number;
  onCommit: (text: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(props.value);
  const [prev, setPrev] = useState(props.value);
  if (prev !== props.value) {
    setPrev(props.value);
    setDraft(props.value);
  }
  return (
    <div className="my-[3px] flex items-start gap-1.5">
      <label htmlFor={id} className="w-24 shrink-0 pt-1 text-micro text-muted">
        {props.label}
      </label>
      <textarea
        id={id}
        rows={props.rows ?? 2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== props.value && props.onCommit(draft)}
        className={`min-h-16 min-w-0 flex-1 resize-y rounded-[3px] border border-surface-3 bg-surface-0 px-[5px] py-0.5 font-sans text-data text-text ${focusRing}`}
      />
    </div>
  );
}

/** Legacy `sel`. */
export function SelectRow<T extends string>(props: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  suf?: string;
}) {
  const id = useId();
  return (
    <Fld id={id} label={props.label} suf={props.suf}>
      <select
        id={id}
        value={props.value}
        onChange={(e) => {
          const hit = props.options.find((o) => o[0] === e.target.value);
          if (hit) props.onChange(hit[0]);
        }}
        className={`${CONTROL} px-0.5 font-sans`}
      >
        {props.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Fld>
  );
}

/** A read-only row in the legacy layout. */
export function ShowRow({ label, value, suf }: { label: string; value: string; suf?: string }) {
  return (
    <div className="my-[3px] flex items-center gap-1.5">
      <span className="w-24 shrink-0 text-micro text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-data text-text">{value}</span>
      {suf !== undefined ? (
        <span className="min-w-[34px] shrink-0 font-mono text-micro text-muted">{suf}</span>
      ) : null}
    </div>
  );
}

/** Legacy `fld` with an id input and the legacy rename words. */
export function IdRow(props: {
  value: string;
  taken: readonly string[];
  onRename: (id: string) => void;
}) {
  const id = useId();
  const [err, setErr] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  return (
    <Fld id={id} label="Id" err={err}>
      <CommitInput
        key={`${props.value}-${seq}`}
        id={id}
        mono
        value={props.value}
        onCommit={(text) => {
          const next = text.trim();
          if (next === props.value) return;
          if (!next) {
            setErr('Type an id.');
            setSeq((n) => n + 1);
            return;
          }
          if (props.taken.includes(next)) {
            setErr(`${next} is in use. Pick another id.`);
            setSeq((n) => n + 1);
            return;
          }
          setErr(null);
          props.onRename(next);
        }}
      />
    </Fld>
  );
}

export { CONTROL };
