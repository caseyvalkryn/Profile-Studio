import './motion.css';

/** Shared class strings. One accent; the focus ring uses it. */
export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface-1';

/** Open and close motion, 120 ms or less. */
export const popIn =
  'data-[state=open]:animate-[ui-in_100ms_ease-out] data-[state=closed]:animate-[ui-out_80ms_ease-in] data-[state=delayed-open]:animate-[ui-in_100ms_ease-out] data-[state=instant-open]:animate-[ui-in_100ms_ease-out]';
