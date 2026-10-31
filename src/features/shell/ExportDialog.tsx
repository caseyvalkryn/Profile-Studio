// Export (legacy `51-panel-dialog.js` renderExport): the open profile's JSON, or the whole
// library's when none is open, in a read-only box with Copy JSON, Copy whole library and Close.
// The port adds Download, which saves the shown text as a .json file (MVP rule for the name).
import { useEffect, useRef, useState } from 'react';
import { isMac } from '../../commands/registry';
import { useDocument } from '../../state/document';
import { useUi } from '../../state/ui';
import { DialogBox } from './DialogBox';
import { download, exportLibrary, exportProfile, fileName, schemaVersion } from './exportLibrary';
import { showToast } from './toastStore';

export const COPIED = 'Copied.';
export const copyHint = (mac = isMac()) =>
  `The text is selected. Press ${mac ? 'Cmd' : 'Ctrl'}+C to copy it.`;

export default function ExportDialog() {
  const open = useUi((s) => s.dialog === 'export');
  return open ? <ExportOpen /> : null;
}

function ExportOpen() {
  const close = () => useUi.getState().setDialog(null);
  // The record is fixed when the dialog opens, as in legacy.
  const [rec] = useState(() => useDocument.getState().doc);
  const [libText, setLibText] = useState('');
  const text = rec ? exportProfile(rec) : libText;
  const [hint, setHint] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const copyBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (rec) return;
    let live = true;
    void exportLibrary(null).then((t) => {
      if (live) setLibText(t);
    });
    return () => {
      live = false;
    };
  }, [rec]);

  const copy = async (value: string) => {
    const fallback = () => {
      const ta = area.current;
      if (ta) {
        ta.value = value;
        ta.focus();
        ta.select();
      }
      setHint(copyHint());
    };
    const clip = globalThis.navigator?.clipboard;
    if (!clip || typeof clip.writeText !== 'function') return fallback();
    try {
      await clip.writeText(value);
      setHint('');
      showToast(COPIED);
    } catch {
      fallback();
    }
  };

  const version = schemaVersion();
  const title = rec ? (
    <>
      Export <span className="ps-t-id">{rec.id}</span>
    </>
  ) : (
    'Export library'
  );
  return (
    <DialogBox
      open
      onClose={close}
      title={title}
      label={rec ? `Export ${rec.id}` : 'Export library'}
      initialFocus={() => copyBtn.current}
      foot={
        <>
          <button
            ref={copyBtn}
            type="button"
            className="ps-btn primary"
            onClick={() => void copy(text)}
          >
            Copy JSON
          </button>
          {rec ? (
            <button
              type="button"
              className="ps-btn"
              onClick={() => void exportLibrary(useDocument.getState().doc).then(copy)}
            >
              Copy whole library
            </button>
          ) : null}
          <button
            type="button"
            className="ps-btn"
            onClick={() => download(rec ? fileName(rec.name) : 'profile-library.json', text)}
          >
            Download
          </button>
          <button type="button" className="ps-btn" onClick={close}>
            Close
          </button>
        </>
      }
    >
      <label className="ps-t-sub" htmlFor="dl-export-text">
        {rec ? `Profile JSON, version ${version}` : `Library JSON, version ${version}`}
      </label>
      <textarea
        id="dl-export-text"
        ref={area}
        className="ps-input ps-t-data"
        rows={16}
        readOnly
        spellCheck={false}
        value={text}
      />
      <p className="ps-hint" aria-live="polite">
        {hint}
      </p>
    </DialogBox>
  );
}
