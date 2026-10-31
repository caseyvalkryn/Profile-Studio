// Readout text (legacy/js/51-panel-readout.js mmss, signed, delta, deltaInv).

/** m:ss of the absolute value. */
export function mmss(s: number): string {
  const a = Math.round(Math.abs(s));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/** +m:ss or -m:ss. */
export function signed(s: number): string {
  return `${s < 0 && Math.round(Math.abs(s)) > 0 ? '-' : '+'}${mmss(s)}`;
}

/** good: the change helps (nominal colour); bad: it hurts (warning colour); none: no change. */
export type Tone = 'good' | 'bad' | 'none';
export type Delta = { text: string; tone: Tone };

/**
 * The change from `base` to `cur` as "(-0:04)". `higherIsBetter` flips the colour, as legacy
 * deltaInv does for margin and window. Null when either side has no value.
 */
export function delta(
  cur: number | null,
  base: number | null,
  higherIsBetter: boolean,
): Delta | null {
  if (cur === null || base === null) return null;
  const d = cur - base;
  if (Math.abs(d) < 0.05) return { text: '(0:00)', tone: 'none' };
  const up = d > 0;
  return { text: `(${signed(d)})`, tone: up === higherIsBetter ? 'good' : 'bad' };
}
