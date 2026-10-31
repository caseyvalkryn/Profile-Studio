// The legacy dialog frame (`51-panel-dialog.js` box): backdrop, a 720 px box 8vh from the top,
// head, body and foot. Radix gives the focus trap, Escape and the return of focus.
import * as RD from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export function DialogBox({
  open,
  onClose,
  title,
  label,
  children,
  foot,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** The accessible name when `title` holds markup. */
  label: string;
  children: ReactNode;
  foot: ReactNode;
  /** The element to focus on open (legacy: Copy JSON for export, the paste box for import). */
  initialFocus?: () => HTMLElement | null;
}) {
  return (
    <RD.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <RD.Portal>
        <RD.Overlay className="dl-back" />
        <RD.Content
          className="dl-box"
          aria-label={label}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            const el = initialFocus?.();
            if (el) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <div className="dl-head">
            <RD.Title className="ps-t-title">{title}</RD.Title>
          </div>
          <div className="dl-body">{children}</div>
          <div className="dl-foot">{foot}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
