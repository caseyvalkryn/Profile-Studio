// Display formatting for Results. Values are stored in the DroneScore canonical unit (measures.ts,
// metres and seconds); the display follows `useUi.units`. Local until the shared units module
// (src/features/shared/units.ts, lane 4.5) lands.
import type { Evaluation, Score } from '../../engine/score';
import { thresholdInCanonical } from '../../engine/score';
import { measureById } from '../../domain/measures';
import type { SourceClass, Step } from '../../domain/measures';
import type { Units } from '../../state/ui';

export const M_PER_NM = 1852;
export const M_PER_FT = 0.3048;

/** Rows that hold a small distance (an error or miss distance), shown in ft or m, not nm or km. */
const SMALL_DISTANCE = new Set(['1.2.3', 'INT-6']);

export type Scale = { unit: string; factor: number; decimals: number };

/** How a measure's canonical value converts for display. */
export function scaleFor(units: Units, id: string, canonical: string): Scale {
  const c = canonical.trim();
  if (c === 'm' && SMALL_DISTANCE.has(id))
    return units === 'nav'
      ? { unit: 'ft', factor: 1 / M_PER_FT, decimals: 0 }
      : { unit: 'm', factor: 1, decimals: 1 };
  if (c === 'm')
    return units === 'nav'
      ? { unit: 'nm', factor: 1 / M_PER_NM, decimals: 2 }
      : { unit: 'km', factor: 1 / 1000, decimals: 2 };
  if (c === 'km')
    return units === 'nav'
      ? { unit: 'nm', factor: 1000 / M_PER_NM, decimals: 2 }
      : { unit: 'km', factor: 1, decimals: 2 };
  if (c === 'm AGL')
    return units === 'nav'
      ? { unit: 'ft AGL', factor: 1 / M_PER_FT, decimals: 0 }
      : { unit: 'm AGL', factor: 1, decimals: 0 };
  if (c === '%') return { unit: '%', factor: 1, decimals: 0 };
  if (c === 's') return { unit: 's', factor: 1, decimals: 1 };
  return { unit: c, factor: 1, decimals: 1 };
}

export function measureScale(units: Units, id: string): Scale {
  return scaleFor(units, id, measureById(id)?.unit ?? '');
}

export function fmt(n: number, decimals: number): string {
  return n.toFixed(decimals);
}

/** A canonical value as display text with its unit, e.g. "1.62 nm". */
export function formatValue(units: Units, id: string, v: number): string {
  const s = measureScale(units, id);
  return `${fmt(v * s.factor, s.decimals)} ${s.unit}`;
}

/** An interval in display units, e.g. "[84, 99]". */
export function formatInterval(units: Units, id: string, i: { low: number; high: number }): string {
  const s = measureScale(units, id);
  return `[${fmt(i.low * s.factor, s.decimals)}, ${fmt(i.high * s.factor, s.decimals)}]`;
}

/** The score's threshold in the measure's canonical unit, or null when it cannot convert. */
export function canonicalThreshold(sc: Pick<Score, 'id' | 'threshold' | 'unit'>): number | null {
  const m = measureById(sc.id);
  if (!m) return null;
  return thresholdInCanonical(sc.threshold, sc.unit, m.unit);
}

export const OP_TEXT = { '>=': '≥', '<=': '≤' } as const;

/** "≥ 1.62 nm"; falls back to the setting's own unit when it cannot convert. */
export function formatThreshold(units: Units, sc: Pick<Score, 'id' | 'threshold' | 'unit' | 'op'>) {
  const t = canonicalThreshold(sc);
  const op = OP_TEXT[sc.op];
  if (t == null) return `${op} ${sc.threshold} ${sc.unit}`;
  return `${op} ${formatValue(units, sc.id, t)}`;
}

export const EVALUATION_WORD: Record<Evaluation, string> = {
  meets: 'Meets',
  'does-not-meet': 'Does not meet',
  inconclusive: 'Inconclusive',
};

export const SOURCE_WORD: Record<SourceClass, string> = {
  simulated: 'Simulated',
  entered: 'Entered',
  derived: 'Derived',
  'not-simulated': 'Not simulated',
};

export const STEP_WORD: Record<Step, string> = {
  find: 'Find',
  fix: 'Fix',
  track: 'Track',
  target: 'Target',
  engage: 'Engage',
  assess: 'Assess',
  system: 'System results',
};

/** Seconds from replicate start as `t+m:ss`. */
export function formatT(s: number): string {
  const total = Math.max(0, Math.round(s));
  const m = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return `t+${m}:${ss}`;
}

/** One sentence of result: "Meets: 95 % [84, 99] against ≥ 80 %". */
export function resultSentence(units: Units, sc: Score): string {
  const word = EVALUATION_WORD[sc.evaluation];
  if (sc.value == null) return `${word}: no value. ${sc.note ?? ''}`.trim();
  const interval = sc.interval ? ` ${formatInterval(units, sc.id, sc.interval)}` : '';
  return `${word}: ${formatValue(units, sc.id, sc.value)}${interval} against ${formatThreshold(units, sc)}`;
}
