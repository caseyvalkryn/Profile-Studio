export type KbdProps = { shortcut: string; className?: string };

/** A shortcut display string in the mono font, small and quiet. */
export function Kbd({ shortcut, className = '' }: KbdProps) {
  return (
    <kbd
      className={`font-mono text-[11px] leading-none tracking-wide text-muted ${className}`}
      aria-label={`Shortcut ${shortcut}`}
    >
      {shortcut}
    </kbd>
  );
}
