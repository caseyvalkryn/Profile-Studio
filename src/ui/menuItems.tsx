import type * as RDM from '@radix-ui/react-dropdown-menu';
import { Fragment, type ComponentType, type ReactNode } from 'react';
import { popIn } from './focus';
import { Kbd } from './Kbd';
import { Tooltip } from './Tooltip';
import type { MenuItem } from './types';

/** The Radix parts that DropdownMenu and ContextMenu share by shape. */
export type MenuParts = {
  Item: ComponentType<RDM.DropdownMenuItemProps>;
  Separator: ComponentType<RDM.DropdownMenuSeparatorProps>;
  Sub: ComponentType<RDM.DropdownMenuSubProps>;
  SubTrigger: ComponentType<RDM.DropdownMenuSubTriggerProps>;
  SubContent: ComponentType<RDM.DropdownMenuSubContentProps>;
  Portal: ComponentType<RDM.DropdownMenuPortalProps>;
};

export const menuContentClass = `z-50 min-w-44 rounded-md border border-surface-3 bg-surface-1 p-1 text-body text-text shadow-md ${popIn}`;

const itemClass =
  'flex h-ctl cursor-default items-center gap-4 rounded-sm px-2 outline-none select-none data-[highlighted]:bg-surface-2 data-[highlighted]:ring-1 data-[highlighted]:ring-accent data-[disabled]:text-muted';

function Row({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <>
      <span className="flex-1 truncate">{label}</span>
      {right}
    </>
  );
}

/**
 * Renders items, submenus from `children`, shortcuts on the right. A disabled item wraps its
 * content in a Tooltip that states `disabledReason` (Radix skips pointer handlers on the
 * disabled item itself, so the inner span carries the tooltip).
 */
export function renderMenuItems(parts: MenuParts, items: MenuItem[]): ReactNode {
  const { Item, Separator, Sub, SubTrigger, SubContent, Portal } = parts;
  return items.map((item) => {
    const shortcut = item.shortcut ? <Kbd shortcut={item.shortcut} /> : null;
    let node: ReactNode;
    if (item.children && item.children.length > 0) {
      node = (
        <Sub>
          <SubTrigger className={itemClass} disabled={Boolean(item.disabledReason)}>
            <Row
              label={item.label}
              right={
                <span className="text-muted" aria-hidden>
                  ›
                </span>
              }
            />
          </SubTrigger>
          <Portal>
            <SubContent className={menuContentClass} sideOffset={2} collisionPadding={8}>
              {renderMenuItems(parts, item.children)}
            </SubContent>
          </Portal>
        </Sub>
      );
    } else if (item.disabledReason) {
      node = (
        <Item className={itemClass} disabled aria-description={item.disabledReason}>
          <Tooltip content={item.disabledReason} side="right">
            <span className="flex w-full items-center gap-4">
              <Row label={item.label} right={shortcut} />
            </span>
          </Tooltip>
        </Item>
      );
    } else {
      node = (
        <Item className={itemClass} onSelect={item.onSelect}>
          <Row label={item.label} right={shortcut} />
        </Item>
      );
    }
    return (
      <Fragment key={item.id}>
        {node}
        {item.separatorAfter ? <Separator className="my-1 h-px bg-surface-3" /> : null}
      </Fragment>
    );
  });
}
