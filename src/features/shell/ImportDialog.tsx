// Import (legacy `51-panel-dialog.js` renderImport and doImport): a file or pasted JSON through
// the one import path, `importText` in `src/features/library/io.ts`. Problems show in the Item and
// Problem table; a clean import closes the dialog and toasts the count. Opening the dialog hides
// any toast (review 9.1 F-14).
import { useEffect, useRef, useState } from 'react';
import { useUi } from '../../state/ui';
import { importText } from '../library/io';
import { DialogBox } from './DialogBox';
import { hideToast } from './toastStore';

export const UNREADABLE = 'The file cannot be read.';

export default function ImportDialog() {
  const open = useUi((s) => s.dialog === 'import');
  const [errors, setErrors] = useState<string[]>([]);
  const paste = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) hideToast();
  }, [open]);
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
