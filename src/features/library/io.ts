// Library-level and per-profile JSON files: download, export the library, import a file.
import type { Vignette } from '../../domain';
import { exportJson, exportLibrary, importJson, saveVignette } from '../../state/persist';
import { libraryChanged } from './newProfile';

/** Save `text` as `<name>.json` through the browser. */
export function downloadJson(name: string, text: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, '_') || 'profile'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportProfileFile(v: Vignette): void {
  downloadJson(v.name, exportJson(v));
}

/** Export every stored profile as one JSON file. */
export async function exportLibraryFile(): Promise<void> {
  downloadJson('profile-library', await exportLibrary());
}

/**
 * Import a Profile Studio or legacy JSON text (one profile, a library or an array), save every
 * profile and return the status line. A bad file returns its error text and saves nothing.
 */
export async function importText(text: string): Promise<string> {
  let vs: Vignette[];
  try {
    vs = importJson(text);
  } catch (err) {
    return (err as Error).message;
  }
  for (const v of vs) await saveVignette(v);
  libraryChanged();
  return `Imported ${vs.length} ${vs.length === 1 ? 'profile' : 'profiles'}`;
}

/** Ask for a JSON file and import it. Resolves with the status line, or '' when none is picked. */
export function pickAndImport(): Promise<string> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve('');
      void file.text().then(importText).then(resolve);
    };
    input.click();
  });
}
