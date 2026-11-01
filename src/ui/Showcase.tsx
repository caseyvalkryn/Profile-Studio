import { useState } from 'react';
import { Button } from './Button';
import { ContextMenu } from './ContextMenu';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { Kbd } from './Kbd';
import { Menu } from './Menu';
import { Palette } from './Palette';
import { PromptNumber } from './PromptNumber';
import { Tooltip, TooltipProvider } from './Tooltip';
import type { MenuItem, PaletteItem } from './types';

const noop = () => {};

const MAP_ITEMS: MenuItem[] = [
  {
    id: 'add-here',
    label: 'Add here',
    children: [
      { id: 'add-threat', label: 'Threat', onSelect: noop },
      { id: 'add-sensor', label: 'Sensor', onSelect: noop },
      { id: 'add-effector', label: 'Effector', onSelect: noop },
    ],
  },
  { id: 'paste-here', label: 'Paste here', shortcut: '⌘V', disabledReason: 'Nothing copied' },
  { id: 'measure', label: 'Measure from here', shortcut: 'M', onSelect: noop },
  { id: 'set-time', label: 'Set time here', onSelect: noop, separatorAfter: true },
  { id: 'fit', label: 'Fit view', shortcut: 'F', onSelect: noop },
];

const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'edit.undo', label: 'Undo', group: 'Edit', shortcut: '⌘Z', onSelect: noop },
  { id: 'edit.redo', label: 'Redo', group: 'Edit', shortcut: '⇧⌘Z', onSelect: noop },
  {
    id: 'edit.delete',
    label: 'Delete selection',
    group: 'Edit',
    shortcut: 'Del',
    disabledReason: 'Nothing selected',
    onSelect: noop,
  },
  { id: 'view.fit', label: 'Fit view', group: 'View', shortcut: 'F', onSelect: noop },
];

/** Every primitive once, with sample items, for a visual check. Not wired into the app. */
export function Showcase() {
  const [speed, setSpeed] = useState(25);
  const [name, setName] = useState('Perimeter breach');
  const [palette, setPalette] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [prompt, setPrompt] = useState(false);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6 bg-surface-0 p-6 text-text">
        <section className="flex items-center gap-2">
          <Button tooltip="Undo the last edit" shortcut="⌘Z">
            Undo
          </Button>
          <Button variant="default" size="sm" tooltip="Fit view" shortcut="F">
            Fit
          </Button>
          <Button variant="accent" tooltip="Save the current view as a card">
            Save card
          </Button>
          <Tooltip content="Units toggle" shortcut="U">
            <span tabIndex={0} className="text-xs text-muted">
              Hover me
            </span>
          </Tooltip>
          <Kbd shortcut="⇧⌘Z" />
        </section>

        <section className="flex w-64 flex-col gap-3">
          <Field
            label="Speed"
            value={speed}
            unit="m/s"
            step={1}
            min={0}
            source="Entered by planner"
            onCommit={setSpeed}
          />
          <Field kind="text" label="Profile name" value={name} onCommit={setName} />
        </section>

        <section className="flex items-center gap-2">
          <Menu items={MAP_ITEMS} trigger={<Button variant="default">Menu</Button>} />
          <ContextMenu items={MAP_ITEMS}>
            <div className="flex h-24 w-48 items-center justify-center rounded-md border border-dashed border-surface-3 text-xs text-muted">
              Right-click here
            </div>
          </ContextMenu>
        </section>

        <section className="flex items-center gap-2">
          <Button
            variant="default"
            shortcut="⌘K"
            tooltip="Command palette"
            onClick={() => setPalette(true)}
          >
            Palette
          </Button>
          <Button variant="default" onClick={() => setDialog(true)}>
            Dialog
          </Button>
          <Button variant="default" onClick={() => setPrompt(true)}>
            Set speed
          </Button>
        </section>

        <Palette open={palette} onOpenChange={setPalette} items={PALETTE_ITEMS} />
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="Delete profile"
          actions={
            <>
              <Button variant="default" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button variant="accent" onClick={() => setDialog(false)}>
                Delete
              </Button>
            </>
          }
        >
          <p className="text-muted">The profile moves to the trash. Undo restores it.</p>
        </Dialog>
        <PromptNumber
          open={prompt}
          onOpenChange={setPrompt}
          title="Set speed"
          label="Speed"
          value={speed}
          unit="m/s"
          min={0}
          onSubmit={setSpeed}
        />
      </div>
    </TooltipProvider>
  );
}
