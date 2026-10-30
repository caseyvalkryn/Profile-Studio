import { useEffect, useRef } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';

export type PromptNumberProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  source?: string;
  onSubmit: (value: number) => void;
};

/** A dialog with one numeric Field and OK / Cancel, for "Set speed", "Set range" and the like. */
export function PromptNumber({
  open,
  onOpenChange,
  title,
  label,
  value,
  unit,
  step,
  min,
  max,
  source,
  onSubmit,
}: PromptNumberProps) {
  const latest = useRef(value);
  useEffect(() => {
    if (open) latest.current = value;
  }, [open, value]);
  const submit = () => {
    onSubmit(latest.current);
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onSubmit={submit}
      actions={
        <>
          <Button variant="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" type="submit">
            OK
          </Button>
        </>
      }
    >
      <Field
        label={label}
        value={value}
        unit={unit}
        step={step}
        min={min}
        max={max}
        source={source}
        onCommit={(v) => {
          latest.current = v;
        }}
      />
    </Dialog>
  );
}
