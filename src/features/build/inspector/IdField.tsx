import { useState } from 'react';
import { Field } from '../../../ui';
import { useDocument } from '../../../state/document';
import { Note } from './fields';
import { renameRefusal } from './edit';

/** Display id with a unique check. A refused rename keeps the old id and says why. */
export function IdField({ value, onRename }: { value: string; onRename: (id: string) => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  return (
    <div className="flex flex-col gap-1">
      <Field
        key={seq}
        kind="text"
        label="Id"
        value={value}
        onCommit={(next) => {
          const doc = useDocument.getState().doc;
          const why = doc ? renameRefusal(doc, value, next) : null;
          if (why) {
            setReason(why);
            setSeq((n) => n + 1);
            return;
          }
          setReason(null);
          if (next.trim() !== value) onRename(next.trim());
        }}
      />
      {reason ? <Note warn>{reason}</Note> : null}
    </div>
  );
}
