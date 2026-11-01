// The right-click menu on a target. Renders through src/ui/ContextMenu (the right-click plumbing
// stays the same); on open it selects the target, as legacy does, and builds its items.
import { useState, type ReactElement } from 'react';
import { currentContext } from '../../../commands/registry';
import type { Pointer } from '../../../commands/types';
import type { ArgRequest } from '../../commands/adapter';
import { useUi } from '../../../state/ui';
import { ContextMenu } from '../../../ui/ContextMenu';
import type { MenuItem } from '../../../ui/types';
import { actionsFor, targetContext, toMenuItems, type MenuTarget } from './actions';
import type { MenuKind } from './commands';

export type TargetMenuProps = {
  kind: MenuKind;
  target: MenuTarget;
  /** Where the pointer was, for the "here" items; `tS` when on the timeline. */
  pointer?: Pointer | null;
  onArg: (req: ArgRequest) => void;
  children: ReactElement;
};

/** Build the items for a target from the live stores, selecting the target first. */
export function openTargetMenu(
  kind: MenuKind,
  target: MenuTarget,
  pointer: Pointer | null,
  onArg: (req: ArgRequest) => void,
): MenuItem[] {
  const ctx = targetContext(kind, target, currentContext(pointer));
  if (ctx.ui.selectedKeys !== useUi.getState().selectedKeys)
    useUi.getState().setSelection(ctx.ui.selectedKeys);
  return toMenuItems(actionsFor(kind, target, ctx), {
    context: () => currentContext(pointer),
    onArg,
  });
}

export function TargetMenu({ kind, target, pointer = null, onArg, children }: TargetMenuProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  return (
    <ContextMenu
      items={items}
      onOpenChange={(open) => {
        if (open) setItems(openTargetMenu(kind, target, pointer, onArg));
      }}
    >
      {children}
    </ContextMenu>
  );
}
