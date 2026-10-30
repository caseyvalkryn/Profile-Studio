import * as RD from '@radix-ui/react-dialog';
import type { FormEvent, ReactNode } from 'react';
import { popIn } from './focus';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons along the bottom, right-aligned. */
  actions?: ReactNode;
  /** When set, the body and actions sit in a form and Enter submits. */
  onSubmit?: () => void;
};

/** A small modal for value prompts: title, body, actions. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  onSubmit,
}: DialogProps) {
  const inner = (
    <>
      {children ? <div className="flex flex-col gap-3">{children}</div> : null}
      {actions ? <div className="mt-4 flex justify-end gap-2">{actions}</div> : null}
    </>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <RD.Content
          className={`fixed top-1/4 left-1/2 z-50 w-80 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-md border border-surface-3 bg-surface-1 p-4 text-sm text-text shadow-lg outline-none ${popIn}`}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <RD.Title className="mb-3 text-sm font-medium">{title}</RD.Title>
          {description ? (
            <RD.Description className="mb-3 text-xs text-muted">{description}</RD.Description>
          ) : null}
          {onSubmit ? <form onSubmit={submit}>{inner}</form> : inner}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
