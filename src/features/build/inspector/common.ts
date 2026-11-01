// Shared inspector helpers: the single selected key, and the clean-up after a record is removed.
import type { Draft } from 'immer';
import type { Vignette } from '../../../domain/types';
import { useUi } from '../../../state/ui';

/** The selected key when exactly one object is selected, else null. */
export function useOne(): string | null {
  return useUi((s) => (s.selectedKeys.length === 1 ? (s.selectedKeys[0] ?? null) : null));
}

/** Drop removed keys from card focus and the telemetry stations. */
export function dropRefs(d: Draft<Vignette>, keys: readonly string[]) {
  const gone = new Set(keys);
  for (const c of d.cards) c.focus = c.focus.filter((k) => !gone.has(k));
  d.report.truth.stationKeys = d.report.truth.stationKeys.filter((k) => !gone.has(k));
}

/** Clear the selection when it names a removed key. */
export function deselect(keys: readonly string[]) {
  const ui = useUi.getState();
  if (ui.selectedKeys.some((k) => keys.includes(k))) ui.setSelection([]);
}
