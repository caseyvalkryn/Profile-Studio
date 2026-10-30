// PHASE 6 REMOVAL. Until the Library screen opens templates, the app opens the newest stored
// vignette, or else a copy of the legacy point-defence template, so the Build screen is not
// empty. devVignette.json is that one template from legacy/js/12-seed.js, made once and saved as
// JSON; no legacy script loads at runtime. Delete this file and the JSON in phase 6.
import { importLegacyV4 } from '../../domain';
import type { Vignette } from '../../domain/types';
import { listVignettes, loadVignette } from '../../state/persist';
import { useDocument } from '../../state/document';
import template from './devVignette.json';

/** A fresh copy of the point-defence template. */
export function devVignette(): Vignette {
  return importLegacyV4(JSON.parse(JSON.stringify(template)));
}

/** Open the newest stored vignette, or the dev template when none is stored or storage fails. */
export async function openStartVignette(): Promise<void> {
  let v: Vignette | null = null;
  try {
    const newest = (await listVignettes())[0];
    if (newest) v = await loadVignette(newest.id);
  } catch {
    // No IndexedDB (private window, tests): fall through to the template.
  }
  if (useDocument.getState().doc) return; // something opened meanwhile
  useDocument.getState().open(v ?? devVignette());
}
