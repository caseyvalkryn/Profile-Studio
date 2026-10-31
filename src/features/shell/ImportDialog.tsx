// Import (legacy `51-panel-dialog.js` renderImport and doImport): a file or pasted JSON through
// `importJson`, stored with `saveVignette`. Problems show in the Item and Problem table; a clean
// import closes the dialog and toasts the count. A profile with the open profile's id replaces
// it in the editor too.
import { useRef, useState } from 'react';
import { useDocument } from '../../state/document';
import { importJson, listVignettes, saveVignette } from '../../state/persist';
import { useUi } from '../../state/ui';
import { DialogBox } from './DialogBox';
import { showToast } from './toastStore';

export const EMPTY_IMPORT = 'Paste a profile, or pick a file.';
export const UNREADABLE = 'The file cannot be read.';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The toast after an import (legacy text). */
export const importedText = (n: number, replaced: number) =>
  `Imported ${plural(n, 'profile')}${replaced ? `, ${replaced} replaced.` : '.'}`;

/**
 * Import `text`. Returns the problems to show; an empty list means every record was stored.
 * `importJson` is all or nothing, so a failed import stores nothing and has one problem.
 */
export async function importText(text: string): Promise<string[]> {
  const t = text.trim();
  if (!t) return [EMPTY_IMPORT];
  let records;
  try {
    records = importJson(t);
  } catch (err) {
    return [(err as Error).message];
  }
  let have = new Set<string>();
  try {
    have = new Set((await listVignettes()).map((l) => l.id));
  } catch {
    // No storage: count every record as added.
  }
  const ids = new Set(records.map((r) => r.id));
  const replaced = [...ids].filter((id) => have.has(id)).length;
  try {
    for (const r of records) await saveVignette(r);
  } catch (err) {
    return [(err as Error).message];
  }
  const open = useDocument.getState().doc;
  const same = open ? records.find((r) => r.id === open.id) : undefined;
  if (same) useDocument.getState().open(same);
  showToast(importedText(records.length, replaced));
  return [];
}

export default function ImportDialog() {
  const open = useUi((s) => s.dialog === 'import');
  const [errors, setErrors] = useState<string[]>([]);
  const paste = useRef<HTMLTextAreaElement>(null);
  const close = () => {
    setErrors([]);
    useUi.getState().setDialog(null);
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      if (paste.current) paste.current.value = text;
      setErrors([]);
    } catch {
      setErrors([UNREADABLE]);
    }
  };
  const run = async () => {
    const list = await importText(paste.current?.value ?? '');
    if (list.length) setErrors(list);
    else close();
  };
  return (
    <DialogBox
      open={open}
      onClose={close}
      title="Import profiles"
      label="Import profiles"
      initialFocus={() => paste.current}
      foot={
        <>
          <button type="button" className="ps-btn primary" onClick={() => void run()}>
            Import
          </button>
          <button type="button" className="ps-btn" onClick={close}>
            Close
          </button>
        </>
      }
    >
      <label className="ps-t-sub" htmlFor="dl-file">
        File
      </label>
      <input
        type="file"
        id="dl-file"
        className="ps-input"
        accept=".json,application/json,text/plain"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <label className="ps-t-sub" htmlFor="dl-paste">
        Paste JSON
      </label>
      <textarea
        id="dl-paste"
        ref={paste}
        className="ps-input ps-t-data"
        rows={10}
        spellCheck={false}
        placeholder="Paste a profile or a library export"
      />
      <p className="ps-hint">
        A profile with the same id replaces the one in the library. Other profiles are added.
      </p>
      {errors.length ? (
        <table className="dl-errs">
          <thead>
            <tr>
              <th className="ps-t-label">Item</th>
              <th className="ps-t-label">Problem</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e, i) => (
              <tr key={i}>
                <th className="ps-t-data">{i + 1}</th>
                <td className="ps-t-sub">{e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </DialogBox>
  );
}
