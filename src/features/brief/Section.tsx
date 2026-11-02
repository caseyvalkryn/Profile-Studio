// A notes panel section: a head (a label, no icon: principle 5.10) with an optional control at its
// right, and its body. Notes.tsx and Frame.tsx share it.
import type { ReactNode } from 'react';

export function Section({
  title,
  right,
  testId,
  children,
}: {
  title: string;
  right?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-2 border-t border-surface-3 py-3 first:border-t-0 first:pt-0"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-xs font-medium text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
