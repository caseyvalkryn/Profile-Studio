// The app-wide command surfaces: the palette (Cmd+K), the option picker and number prompt that
// palette commands open, and the shortcut sheet (?). Mounted once at the App root.
import { useState } from 'react';
import { useUi } from '../../state/ui';
import { Palette } from '../../ui/Palette';
import { PromptNumber } from '../../ui/PromptNumber';
import type { PaletteItem } from '../../ui/types';
import { paletteItems, type ArgRequest, type PickRequest } from './adapter';
import ShortcutSheet from './ShortcutSheet';

export default function CommandHost() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const [arg, setArg] = useState<ArgRequest | null>(null);
  const [pick, setPick] = useState<PickRequest | null>(null);
  // Built when the palette opens, so each enable rule reads the stores at that moment.
  const items = open ? paletteItems({ pointer: null, onArg: setArg, onPick: setPick }) : [];
  const pickItems: PaletteItem[] = pick
    ? pick.options.map((o) => ({
        id: `${pick.commandId}:${o.value}`,
        label: o.label,
        group: o.group ?? pick.title,
        onSelect: () => void pick.submit(o.value),
      }))
    : [];
  return (
    <>
      <Palette open={open} onOpenChange={setOpen} items={items} />
      <Palette
        open={pick !== null}
        onOpenChange={(o) => {
          if (!o) setPick(null);
        }}
        items={pickItems}
        placeholder={pick?.title}
      />
      {arg ? (
        <PromptNumber
          open
          onOpenChange={(o) => {
            if (!o) setArg(null);
          }}
          title={arg.title}
          label={arg.label}
          unit={arg.unit}
          value={arg.value}
          onSubmit={(v) => arg.submit(v)}
        />
      ) : null}
      <ShortcutSheet />
    </>
  );
}
