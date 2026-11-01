import * as RT from '@radix-ui/react-tooltip';
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import { Kbd } from './Kbd';
import { popIn } from './focus';

/** Spec section 8: open after 400 ms, move between tooltips with no delay. */
export const TOOLTIP_DELAY_MS = 400;
export const TOOLTIP_SKIP_DELAY_MS = 300;

const HasProvider = createContext(false);

/** Place once at the app root so the skip delay is shared by every tooltip. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RT.Provider delayDuration={TOOLTIP_DELAY_MS} skipDelayDuration={TOOLTIP_SKIP_DELAY_MS}>
      <HasProvider.Provider value={true}>{children}</HasProvider.Provider>
    </RT.Provider>
  );
}

export type TooltipProps = {
  /** What the control does, in one line. */
  content: string;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** One element that accepts a ref and pointer and focus handlers. */
  children: ReactElement;
};

export function Tooltip({ content, shortcut, side = 'top', children }: TooltipProps) {
  const hasProvider = useContext(HasProvider);
  const tip = (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          avoidCollisions
          className={`z-50 flex max-w-72 items-center gap-2 rounded-sm border border-surface-3 bg-surface-1 px-2 py-1 text-data text-text shadow-sm ${popIn}`}
        >
          <span>{content}</span>
          {shortcut ? <Kbd shortcut={shortcut} /> : null}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
  return hasProvider ? tip : <TooltipProvider>{tip}</TooltipProvider>;
}
