// The whole-library export (legacy `PS.persist.exportLibrary`): every stored profile in one JSON
// file, `{ schema, library: [...] }`, the shape `importJson` reads back. The open profile is taken
// from the document store, so an edit the autosave has not written yet is in the file.
import { SCHEMA, type Vignette } from '../../domain';
import { exportJson, listVignettes, loadVignette } from '../../state/persist';

export type LibraryExport = { schema: typeof SCHEMA; library: Vignette[] };

/** Stored profiles, newest first, with `current` in place of its stored copy (or first when new). */
export async function libraryRecords(current: Vignette | null = null): Promise<Vignette[]> {
  const listing = await listVignettes();
  const out: Vignette[] = [];
  for (const l of listing) {
    if (current && l.id === current.id) {
      out.push(current);
      continue;
    }
    const v = await loadVignette(l.id);
    if (v) out.push(v);
  }
  if (current && !listing.some((l) => l.id === current.id)) out.unshift(current);
  return out;
}

export function libraryJson(records: Vignette[]): string {
  const doc: LibraryExport = { schema: SCHEMA, library: records };
  return JSON.stringify(doc, null, 2);
}

/** The library export text. */
export async function exportLibrary(current: Vignette | null = null): Promise<string> {
  return libraryJson(await libraryRecords(current));
}

/** The JSON of one profile, as the Library's Export writes it. */
export const exportProfile = (v: Vignette): string => exportJson(v);

/** The download file name: the MVP rule of the Library's Export (`LibraryScreen.tsx`). */
export const fileName = (name: string, fallback = 'profile') =>
  `${name.replace(/[^\w.-]+/g, '_') || fallback}.json`;

/** Save text as a JSON download. Does nothing where the browser has no object URLs (tests). */
export function download(name: string, text: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** The schema's version number for dialog labels: 'profile-studio/6' reads 6. */
export const schemaVersion = (): string => String(SCHEMA).split('/').pop() ?? '';
