// Measures of performance: the DroneScore rows the profile names, each under its F2T2EA step,
// with an operator and a threshold. Add opens a picker of all DroneScore measures by step.
import type { Draft } from 'immer';
import { useState } from 'react';
import { MEASURES, measureById, STEPS, type Step } from '../../../domain/measures';
import type { Op, Vignette } from '../../../domain/types';
import { focusRing } from '../../../ui/focus';
import { Choice, CONTROL, edit, Hint, Mini, NumField, Remove, Sec } from './Row';

export const STEP_LABEL: Record<Step, string> = {
  find: 'Find',
  fix: 'Fix',
  track: 'Track',
  target: 'Target',
  engage: 'Engage',
  assess: 'Assess',
  system: 'System',
};

/** Rows where a lower value is the better one: times, error, rates of error, cost. */
const LOWER_IS_BETTER = new Set([
  '1.1.4', // False Alarm Rate
  '1.4', // Min Altitude
  '1.8', // Resolution
  '1.2.3', // Track Accuracy (m error)
  '2.2', // Track Accuracy KPP (± %)
  '2.1.3t', // Identification Time
  '2.1.4', // Mis-Identification Rate
  '3.1.4', // Defeat Engagement Time
  '5.8', // Cost per Engagement
  'INT-6', // Terminal Guidance Accuracy (CEP)
  'INT-11', // Reload / Magazine Cycle Time
  '4.2.2', // Mean Time to Repair
]);

export function defaultOp(id: string): Op {
  return LOWER_IS_BETTER.has(id) ? '<=' : '>=';
}

const OPS = [
  ['>=', '≥'],
  ['<=', '≤'],
] as const satisfies readonly (readonly [Op, string])[];

export function Measures({ v }: { v: Vignette }) {
  const [open, setOpen] = useState(false);
  return (
    <Sec
      title="Measures of performance"
      action={
        <Mini name="Add measure" pressed={open} onClick={() => setOpen((o) => !o)}>
          Add
        </Mini>
      }
    >
      {open ? <Picker v={v} onDone={() => setOpen(false)} /> : null}
      {v.measures.map((m) => {
        const row = measureById(m.id);
        const at = (f: (r: { op: Op; threshold: number }) => void) => (d: Draft<Vignette>) => {
          const r = d.measures.find((x) => x.id === m.id);
          if (r) f(r);
        };
        return (
          <div key={m.id} className="px-1.5 py-1">
            <div className="flex items-start gap-1.5">
              <span className="min-w-0 flex-1 text-body">
                <span className="font-mono text-micro text-muted">{m.id}</span> {row?.name ?? m.id}
                <span className="ml-1.5 text-data text-muted">
                  {row ? STEP_LABEL[row.step] : ''}
                </span>
              </span>
              <Remove
                name={`Remove ${m.id}`}
                onClick={() =>
                  edit(
                    `remove ${m.id}`,
                    (d) => void (d.measures = d.measures.filter((x) => x.id !== m.id)),
                  )
                }
              />
            </div>
            <div className="mt-1 grid grid-cols-[56px_1fr_auto] items-center gap-x-2">
              <Choice<Op>
                name={`${m.id} operator`}
                value={m.op}
                options={OPS}
                onChange={(op) =>
                  edit(
                    `set ${m.id} operator`,
                    at((r) => void (r.op = op)),
                  )
                }
              />
              <NumField
                name={`${m.id} threshold`}
                label={`set ${m.id} threshold`}
                ty="num"
                stored={m.threshold}
                set={(n) => at((r) => void (r.threshold = n ?? 0))}
              />
              <span className="font-mono text-micro text-muted">{m.unit}</span>
            </div>
          </div>
        );
      })}
      {v.measures.length === 0 && !open ? (
        <Hint>No measures. Add DroneScore measures by step.</Hint>
      ) : null}
    </Sec>
  );
}

function Picker({ v, onDone }: { v: Vignette; onDone: () => void }) {
  const [q, setQ] = useState('');
  const have = new Set(v.measures.map((m) => m.id));
  const needle = q.trim().toLowerCase();
  const hits = MEASURES.filter(
    (m) => !needle || m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle),
  );
  return (
    <div
      role="group"
      aria-label="Measure picker"
      className="mb-2 rounded-[4px] border border-surface-3 bg-surface-0 p-1.5"
    >
      <input
        type="search"
        aria-label="Search measures"
        placeholder="Search by id or name"
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
        }}
        className={`${CONTROL} font-sans`}
      />
      <div className="mt-1 max-h-72 overflow-y-auto">
        {STEPS.map((step) => {
          const rows = hits.filter((m) => m.step === step);
          return rows.length ? (
            <div key={step}>
              <h3 className="mt-1.5 mb-0.5 text-micro font-medium text-muted">
                {STEP_LABEL[step]}
              </h3>
              {rows.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-label={`Add ${m.id} ${m.name}`}
                  disabled={have.has(m.id)}
                  onClick={() => {
                    edit(`add ${m.id}`, (d) => {
                      d.measures.push({
                        id: m.id,
                        op: defaultOp(m.id),
                        threshold: 0,
                        unit: m.unit,
                      });
                    });
                  }}
                  className={`flex w-full gap-1.5 rounded-[3px] px-1 py-0.5 text-left text-data text-text hover:bg-surface-3 disabled:opacity-40 ${focusRing}`}
                >
                  <span className="w-12 shrink-0 font-mono text-micro text-muted">{m.id}</span>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="shrink-0 font-mono text-micro text-muted">{m.unit}</span>
                </button>
              ))}
            </div>
          ) : null;
        })}
        {hits.length === 0 ? <Hint>No measure matches.</Hint> : null}
      </div>
    </div>
  );
}
