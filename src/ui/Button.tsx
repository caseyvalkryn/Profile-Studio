import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { focusRing } from './focus';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'quiet' | 'default' | 'accent';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Quiet is the default. Accent is for the one primary action (Run). */
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  tooltip?: string;
  shortcut?: string;
};

const VARIANT: Record<ButtonVariant, string> = {
  quiet: 'border border-transparent bg-transparent text-text hover:bg-surface-2',
  default: 'border border-surface-3 bg-surface-1 text-text hover:bg-surface-2',
  accent: 'border border-accent bg-accent text-accent-text hover:opacity-90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-6 gap-1 px-1.5 text-xs',
  md: 'h-7 gap-1.5 px-2.5 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'quiet',
    size = 'md',
    icon,
    tooltip,
    shortcut,
    className = '',
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-sm select-none disabled:cursor-default disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${focusRing} ${className}`}
      {...rest}
    >
      {icon ? (
        <span className="inline-flex shrink-0" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={tooltip} shortcut={shortcut}>
      {button}
    </Tooltip>
  );
});
