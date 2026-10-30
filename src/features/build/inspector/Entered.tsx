// "Vendor sheet values": the DroneScore entered rows for a sensor or effector (spec section 4).
import type { Entered } from '../../../domain/types';
import type { Measure } from '../../../domain/measures';
import { Field } from '../../../ui';
import { Note, Section, Select } from './fields';
import { enteredRows, inputOf, type EnteredGroup } from './enteredRows';
import { editRecord } from './edit';

type Props = { group: EnteredGroup; assetKey: string; entered: Record<string, Entered> };

export function EnteredSection({ group, assetKey, entered }: Props) {
  const write = (m: Measure, next: Entered | null) =>
    editRecord(`Set ${m.id} ${m.name}`, group, assetKey, (r) => {
      if (next) r.entered[m.id] = next;
      else delete r.entered[m.id];
    });

  return (
    <Section title="Vendor sheet values">
      <Note>DroneScore entered measures. Each value needs a source note.</Note>
      {enteredRows(group).map((m) => (
        <EnteredRow key={m.id} m={m} entry={entered[m.id]} onChange={(next) => write(m, next)} />
      ))}
    </Section>
  );
}

function EnteredRow({
  m,
  entry,
  onChange,
}: {
  m: Measure;
  entry: Entered | undefined;
  onChange: (next: Entered | null) => void;
}) {
  const label = `${m.id} ${m.name}`;
  const source = entry?.source ?? '';
  const input = inputOf(m.unit);
  const setValue = (value: Entered['value'] | undefined) =>
    onChange(value === undefined ? null : { value, source });

  let box;
  if (input === 'yesno') {
    const v = entry?.value;
    box = (
      <Select
        label={label}
        value={v === true ? 'yes' : v === false ? 'no' : ''}
        options={[
          { value: '', label: 'Not entered' },
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(s) => setValue(s === '' ? undefined : s === 'yes')}
      />
    );
  } else if (input === 'text') {
    box = (
      <Field
        kind="text"
        label={label}
        unit={m.unit}
        value={entry === undefined ? '' : String(entry.value)}
        onCommit={(s) => setValue(s.trim() === '' ? undefined : s)}
      />
    );
  } else {
    box = (
      <Field
        label={label}
        unit={m.unit}
        allowBlank
        value={typeof entry?.value === 'number' ? entry.value : undefined}
        onCommit={setValue}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {box}
      {entry ? (
        <>
          <Field
            kind="text"
            label={`Source, ${m.id}`}
            value={source}
            onCommit={(s) => onChange({ value: entry.value, source: s })}
          />
          {source.trim() === '' ? (
            <Note warn>No source note. Say where this value came from.</Note>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
