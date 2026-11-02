// The one import path and the one export path (review 9.1 F-03, F-07). The Library screen, the
// shell's Import and Export dialogs and the commands all call these; persistence and parsing stay
// in `src/state/persist.ts`.
//
//   importText(text)          Parse and store a file's text. Toasts the count; returns problems.
//   pickAndImport()           Ask for a file, then importText.
//   libraryText(current?)     The library export JSON, every record v7, the open profile fresh.
//   profileText(v)            One profile's JSON, with `timed` on each threat.
//   exportLibraryFile()       Download the library as `profile-library.json`.
//   exportProfileFile(v)      Download one profile as `<name>.json`.
//   fileName(name), download(name, text)   The one file-name rule and the one download helper.
import { SCHEMA, type Vignette } from '../../domain';
import { useDocument } from '../../state/document';
import {
  exportJson,
  exportLibrary,
  importJson,
  listVignettes,
  saveVignette,
} from '../../state/persist';
import { hideToast, showToast } from '../shell/toastStore';
import { libraryChanged } from './newProfile';

export const EMPTY_IMPORT = 'Paste a profile, or pick a file.';
export const LIBRARY_FILE = 'profile-library.json';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The toast after an import (legacy `51-panel-dialog.js` doImport). */
export const importedText = (n: number, replaced: number) =>
  `Imported ${plural(n, 'profile')}${replaced ? `, ${replaced} replaced.` : '.'}`;

/** The download file name: the profile name with unsafe characters as `_`, then `.json`. */
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

/** The schema's version number for dialog labels: 'profile-studio/8' reads 8. */
export const schemaVersion = (): string => String(SCHEMA).split('/').pop() ?? '';

export const profileText = (v: Vignette): string => exportJson(v);

/** The library JSON. The open profile replaces its stored copy, so an unsaved edit is in it. */
export function libraryText(
  current: Vignette | null = useDocument.getState().doc,
): Promise<string> {
  return exportLibrary(current);
}

export function exportProfileFile(v: Vignette): void {
  download(fileName(v.name), profileText(v));
}

/** Export every stored profile as one JSON file. */
export async function exportLibraryFile(): Promise<void> {
  download(LIBRARY_FILE, await libraryText());
}

/**
 * Import a Profile Studio or legacy JSON text (one profile, a library or an array) and store every
 * record. All or nothing: a bad file stores nothing and returns its problem; an empty list means
 * every record was stored. On success the Library refreshes, a record with the open profile's id
 * replaces it in the editor too, and the toast gives the count. A failure hides any toast.
 */
export async function importText(text: string): Promise<string[]> {
  const fail = (problem: string) => {
    hideToast();
    return [problem];
  };
  const t = text.trim();
  if (!t) return fail(EMPTY_IMPORT);
  let records: Vignette[];
  try {
    records = importJson(t);
  } catch (err) {
    return fail((err as Error).message);
  }
  let have = new Set<string>();
  try {
    have = new Set((await listVignettes()).map((l) => l.id));
  } catch {
    // No storage listing: count every record as added.
  }
  const replaced = new Set(records.map((r) => r.id).filter((id) => have.has(id))).size;
  try {
    for (const r of records) await saveVignette(r);
  } catch (err) {
    return fail((err as Error).message);
  }
  libraryChanged();
  const open = useDocument.getState().doc;
  const same = open ? records.find((r) => r.id === open.id) : undefined;
  if (same) useDocument.getState().open(same);
  showToast(importedText(records.length, replaced));
  return [];
}

/** Ask for a JSON file and import it. Resolves with the problems, or [] when none is picked. */
export function pickAndImport(): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve([]);
      void file.text().then(importText).then(resolve);
    };
    input.click();
  });
}
