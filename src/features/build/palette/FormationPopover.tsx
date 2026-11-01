// Formation popover (Shift+F), legacy/js/51-panel-palette.js formation form: count, spacing and
// group letter; Create writes through the document edit API as one undo step.
import { useState } from 'react';
import { usePreview, useDocument } from '../../../state/document';
import { useUi } from '../../../state/ui';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { currentContext } from '../../../commands/registry';
import { M_PER_NM } from '../../shared/units';
import { num } from '../rail/format';
import { formationSource } from './commands';
import {
  applyFormation,
  FORMATION_MAX,
  FORMATION_MIN,
  FORMATION_SPACING_M,
  groupLetter,
} from './formation';
import { useQuickAdd } from './store';

export type FormationInput = { count: string; spacing: string; group: string };

/** Check the form; returns the values in metres or the legacy error text. */
export function readFormation(
  f: FormationInput,
  units: 'nav' | 'si',
): { n: number; spacingM: number; group: string } | { error: string } {
  const n = Number(f.count);
  if (!Number.isInteger(n) || n < FORMATION_MIN || n > FORMATION_MAX)
    return { error: `Count is ${FORMATION_MIN} to ${FORMATION_MAX}.` };
  const sp = Number(f.spacing);
  if (!(sp > 0)) return { error: 'Type a spacing above 0, for example 0.065.' };
  if (!/^[A-Za-z]$/.test(f.group.trim())) return { error: 'Type one letter for the group.' };
  return {
    n,
    spacingM: sp * (units === 'si' ? 1000 : M_PER_NM),
    group: groupLetter(f.group),
  };
}

const inputClass =
  'h-7 w-full rounded-sm border border-surface-3 bg-surface-0 px-2 font-mono text-xs text-text';

export function FormationPopover() {
  const open = useQuickAdd((s) => s.formationOpen);
  const setOpen = useQuickAdd((s) => s.setFormationOpen);
  const units = useUi((s) => s.units);
  const doc = useDocument((s) => s.doc);
  const preview = usePreview();
  const src = open ? formationSource(currentContext()) : '';
  const threat = doc?.threats.find((t) => t.key === src) ?? null;
  const [form, setForm] = useState<FormationInput | null>(null);
  const [error, setError] = useState('');
  const f: FormationInput = form ?? {
    count: '3',
    spacing: num(FORMATION_SPACING_M / (units === 'si' ? 1000 : M_PER_NM), 3),
    group: threat?.group || 'A',
  };
  const close = () => {
    setOpen(false);
    setForm(null);
    setError('');
  };
  const create = () => {
    if (!threat) return close();
    const r = readFormation(f, units);
    if ('error' in r) return setError(r.error);
    useDocument.getState().edit(`formation ${r.group}`, (d) => {
      applyFormation(d, threat.key, r.n, r.spacingM, r.group, preview?.tmaxS ?? 60);
    });
    close();
  };
  const field = (k: keyof FormationInput, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        className={inputClass}
        value={f[k]}
        onChange={(e) => setForm({ ...f, [k]: e.target.value })}
      />
    </label>
  );
  return (
    <Dialog
      open={open && Boolean(threat)}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      title={`Formation from ${threat?.id ?? ''}`}
      onSubmit={create}
      actions={
        <>
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="accent">
            Create
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {field('count', 'Count')}
        {field('spacing', `Spacing ${units === 'si' ? 'km' : 'nm'}`)}
        {field('group', 'Group')}
      </div>
      <p className={`mt-2 text-xs ${error ? 'text-state-warning' : 'text-muted'}`} role="status">
        {error || 'Press Enter to create. Press Escape to cancel.'}
      </p>
    </Dialog>
  );
}
