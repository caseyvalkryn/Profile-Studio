import type { Override } from './libraryField';
import type { Scenario, SpecModel } from './types';
import { dropEditedProvenance, specFields } from './types';
import { basisJson } from './basisJson';

/**
 * How an override reaches a run. `activeOverrides` is the record a manifest
 * keeps; `applyOverrides` is the one rule every run path and the engine CLI
 * apply, so the browser and CLI summaries stay equal at one seed. Both are
 * pure and store-free: an override never enters a `Scenario`, the Board store
 * or history, and the applied scenario exists for one run.
 */

/** Position of one field in a model's spec key order; an unknown field sorts last. */
function rank(order: string[], field: string): number {
  const at = order.indexOf(field);
  return at < 0 ? order.length : at;
}

/**
 * The overrides a run must record: those on a model this scenario's library
 * carries, in library order, then in the model's spec field order (an unknown
 * field last, by name). `createTrialManifest` writes the result into the
 * manifest, so the order is the manifest's order and has to be stable.
 */
export function activeOverrides(overrides: readonly Override[], scenario: Scenario): Override[] {
  const out: Override[] = [];
  for (const model of scenario.library) {
    const mine = overrides.filter((o) => o.modelId === model.id);
    if (mine.length === 0) continue;
    const order = Object.keys(specFields(model));
    mine.sort(
      (a, b) => rank(order, a.field) - rank(order, b.field) || a.field.localeCompare(b.field),
    );
    out.push(...mine);
  }
  return out;
}

const SPEC_KEYS = ['sensor', 'uas', 'effector', 'c2'] as const;

/** `model` with the overrides written over a copy of its spec; the same object when it has no spec. */
function overrideModel(model: SpecModel, mine: readonly Override[]): SpecModel {
  const key = SPEC_KEYS.find((k) => model[k] != null);
  if (!key) return model;
  const spec: Record<string, unknown> = { ...model[key] };
  for (const o of mine) spec[o.field] = o.value;
  // An overridden field takes no provenance row, as an edited field takes none:
  // the sampler then spreads it from the PF table around the override.
  return dropEditedProvenance(model, { ...model, [key]: spec } as SpecModel);
}

/**
 * The scenario the engine runs: each override's value written over the library
 * field it names. Pure; the input is untouched, the result shares every
 * reference but `library` and the models overridden, and with no override on
 * a library model the same scenario is returned. The manifest keeps the
 * override list; this view is never saved.
 */
export function applyOverrides(scenario: Scenario, overrides: readonly Override[]): Scenario {
  if (overrides.length === 0) return scenario;
  let changed = false;
  const library = scenario.library.map((model) => {
    const mine = overrides.filter((o) => o.modelId === model.id);
    if (mine.length === 0) return model;
    const next = overrideModel(model, mine);
    if (next !== model) changed = true;
    return next;
  });
  return changed ? { ...scenario, library } : scenario;
}

/**
 * Whether two override lists put the same values in force: the same
 * `(modelId, field, value)` triples in the same order. Object key order is
 * not a difference; array order is. The reason and date are record content;
 * a re-recorded reason changes no run, so a run's identity compares by this
 * and not by the whole record.
 */
export function sameAppliedOverrides(a: readonly Override[], b: readonly Override[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (o, i) =>
        o.modelId === b[i]!.modelId &&
        o.field === b[i]!.field &&
        basisJson(o.value) === basisJson(b[i]!.value),
    )
  );
}
