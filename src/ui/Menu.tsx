import * as RDM from '@radix-ui/react-dropdown-menu';
import type { ReactElement } from 'react';
import { menuContentClass, renderMenuItems, type MenuParts } from './menuItems';
import type { MenuItem } from './types';

const parts: MenuParts = {
  Item: RDM.Item,
  Separator: RDM.Separator,
  Sub: RDM.Sub,
  SubTrigger: RDM.SubTrigger,
  SubContent: RDM.SubContent,
  Portal: RDM.Portal,
};

export type MenuProps = {
  items: MenuItem[];
  /** One element that opens the menu, usually a Button. */
  trigger: ReactElement;
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** A dropdown menu. Each item shows its shortcut; a disabled item says why in its tooltip. */
export function Menu({ items, trigger, align = 'start', open, onOpenChange }: MenuProps) {
  return (
    <RDM.Root open={open} onOpenChange={onOpenChange}>
      <RDM.Trigger asChild>{trigger}</RDM.Trigger>
      <RDM.Portal>
        <RDM.Content className={menuContentClass} align={align} sideOffset={4} collisionPadding={8}>
          {renderMenuItems(parts, items)}
        </RDM.Content>
      </RDM.Portal>
    </RDM.Root>
  );
}
