import * as RCM from '@radix-ui/react-context-menu';
import type { ReactElement } from 'react';
import { menuContentClass, renderMenuItems, type MenuParts } from './menuItems';
import type { MenuItem } from './types';

const parts: MenuParts = {
  Item: RCM.Item,
  Separator: RCM.Separator,
  Sub: RCM.Sub,
  SubTrigger: RCM.SubTrigger,
  SubContent: RCM.SubContent,
  Portal: RCM.Portal,
};

export type ContextMenuProps = {
  items: MenuItem[];
  /** The right-click target. One element that accepts a ref. */
  children: ReactElement;
  onOpenChange?: (open: boolean) => void;
};

/** A right-click menu. Each item shows its shortcut; a disabled item says why in its tooltip. */
export function ContextMenu({ items, children, onOpenChange }: ContextMenuProps) {
  return (
    <RCM.Root onOpenChange={onOpenChange}>
      <RCM.Trigger asChild>{children}</RCM.Trigger>
      <RCM.Portal>
        <RCM.Content className={menuContentClass} collisionPadding={8}>
          {renderMenuItems(parts, items)}
        </RCM.Content>
      </RCM.Portal>
    </RCM.Root>
  );
}
