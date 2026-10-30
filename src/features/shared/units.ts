// Display units for every workspace (principle 1.3, spec section 3). Stored values are metres,
// seconds and metres per second. `nav` shows nm, ft AGL and kt; `si` shows km, m AGL and m/s.
// Numbers always carry a unit. Build helpers read (quantity, value, units); the Results and
// Report helpers below keep the argument order their callers used.
import { measureById } from '../../domain/measures';
import type { SourceClass, Step } from '../../domain/measures';
import type { Evaluation, Score } from '../../engine/score';
import { thresholdInCanonical } from '../../engine/score';
import type { Units } from '../../state/ui';

export type Quantity = 'range' | 'altitude' | 'speed';

export const M_PER_NM = 1852;
export const M_PER_FT = 0.3048;
export const MS_PER_KT = M_PER_NM / 3600;

const FACTOR: Record<Units, Record<Quantity, number>> = {
  nav: { range: 1 / M_PER_NM, altitude: 1 / M_PER_FT, speed: 1 / MS_PER_KT },
  si: { range: 1 / 1000, altitude: 1, speed: 1 },
};

const UNIT: Record<Units, Record<Quantity, string>> = {
  nav: { range: 'nm', altitude: 'ft AGL', speed: 'kt' },
  si: { range: 'km', altitude: 'm AGL', speed: 'm/s' },
};

/** Decimals for a formatted readout (map labels, drag tips). */
const DECIMALS: Record<Units, Record<Quantity, number>> = {
  nav: { range: 2, altitude: 0, speed: 0 },
  si: { range: 2, altitude: 0, speed: 1 },
};

/** Decimals for an editable field value. */
const FIELD_DECIMALS: Record<Units, Record<Quantity, number>> = {
  nav: { range: 3, altitude: 0, speed: 1 },
  si: { range: 3, altitude: 1, speed: 1 },
};

export function unitOf(q: Quantity, units: Units): string {
  return UNIT[units][q];
}

/** Stored SI value to the display number, not rounded. */
export function toDisplay(q: Quantity, v: number, units: Units): number {
  return v * FACTOR[units][q];
}

/** Display number back to the stored SI value, not rounded. */
export function fromDisplay(q: Quantity, v: number, units: Units): number {
  return v / FACTOR[units][q];
}

export function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Stored value to the number an editable field shows, rounded for the field. */
export function fieldValue(q: Quantity, v: number, units: Units): number {
  return round(toDisplay(q, v, units), FIELD_DECIMALS[units][q]);
}

export function format(q: Quantity, v: number, units: Units): string {
  return `${toDisplay(q, v, units).toFixed(DECIMALS[units][q])} ${UNIT[units][q]}`;
}

export const formatRange = (m: number, u: Units) => format('range', m, u);
export const formatAltitude = (m: number, u: Units) => format('altitude', m, u);
export const formatSpeed = (ms: number, u: Units) => format('speed', ms, u);

/** A distance trimmed to `digits` decimals with its unit, for example `2.4 nm`. */
export function formatDistance(m: number, units: Units, digits = 1): string {
  return `${Number(toDisplay('range', m, units).toFixed(digits)).toString()} ${unitOf('range', units)}`;
}

const whole = (v: number) => Math.round(v).toLocaleString('en-US');

/** A whole-number speed for compact library rows: `19 kt`, `10 m/s`. */
export function compactSpeed(ms: number, units: Units): string {
  return `${whole(toDisplay('speed', ms, units))} ${unitOf('speed', units)}`;
}

/** A whole-number altitude for compact library rows: `3,281 ft`, `1,000 m`. */
export function compactAltitude(m: number, units: Units): string {
  return `${whole(toDisplay('altitude', m, units))} ${units === 'nav' ? 'ft' : 'm'}`;
}

/** Bearing as three digits and a degree sign: 45 shows as 045°. */
export function formatBearing(deg: number): string {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return `${String(d).padStart(3, '0')}°`;
}

/** An angle such as a field of view: 90°. */
export function formatAngle(deg: number): string {
  return `${Math.round(deg)}°`;
}

/** Seconds as `t+m:ss`, rounded to the whole second. Negative times show as t+0:00. */
export function fmtTime(s: number): string {
  const w = Math.max(0, Math.round(s));
  const m = Math.floor(w / 60);
  const ss = w % 60;
  return `t+${m}:${ss < 10 ? '0' : ''}${ss}`;
}

/** Round axis ticks from 0 to at least `max`, about `count` of them. */
export function niceTicks(max: number, count = 5): number[] {
  if (!(max > 0)) return [0];
  const raw = max / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Round time ticks in seconds from 0 to `maxS`. */
export function timeTicks(maxS: number, count = 6): number[] {
  if (!(maxS > 0)) return [0];
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const want = maxS / Math.max(1, count);
  const step = steps.find((s) => s >= want) ?? 3600;
  const out: number[] = [];
  for (let t = 0; t <= maxS + 1e-9; t += step) out.push(t);
  return out;
}

// Results: measure values in the DroneScore canonical unit (measures.ts), converted for display.

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

/** One sentence of result: "Meets: 95 % [84, 99] against ≥ 80 %". */
export function resultSentence(units: Units, sc: Score): string {
  const word = EVALUATION_WORD[sc.evaluation];
  if (sc.value == null) return `${word}: no value. ${sc.note ?? ''}`.trim();
  const interval = sc.interval ? ` ${formatInterval(units, sc.id, sc.interval)}` : '';
  return `${word}: ${formatValue(units, sc.id, sc.value)}${interval} against ${formatThreshold(units, sc)}`;
}

// Report: values split into number and unit so the unit can sit apart in a table cell.

export type Shown = { value: string; unit: string };

function fixed(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function range(m: number, units: Units): Shown {
  return units === 'nav'
    ? { value: fixed(m / M_PER_NM, 2), unit: 'nm' }
    : { value: fixed(m / 1000, 2), unit: 'km' };
}

export function altitude(m: number, units: Units): Shown {
  return units === 'nav'
    ? { value: fixed(m / M_PER_FT, 0), unit: 'ft AGL' }
    : { value: fixed(m, 0), unit: 'm AGL' };
}

export function speed(ms: number, units: Units): Shown {
  return units === 'nav'
    ? { value: fixed(ms / MS_PER_KT, 0), unit: 'kt' }
    : { value: fixed(ms, 1), unit: 'm/s' };
}

export function text(s: Shown): string {
  return s.unit ? `${s.value} ${s.unit}` : s.value;
}

/**
 * A measure value in its DroneScore unit (`unit`), converted for display. Ranges (m, km) follow
 * the range scale, altitudes (m AGL) the altitude scale. Other units show as stored.
 */
export function measureValue(value: number, unit: string, units: Units): Shown {
  const u = unit.trim();
  if (u === 'm') return range(value, units);
  if (u === 'km') return range(value * 1000, units);
  if (u === 'm AGL') return altitude(value, units);
  if (u === '%') return { value: fixed(value, 1), unit: '%' };
  if (u === 's') return { value: fixed(value, 1), unit: 's' };
  return { value: fixed(value, 2), unit: u };
}

/** An ISO time as "2026-10-30 14:05 UTC". */
export function utc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** A sensor or effector sector: "360°" or "90° at 045°". */
export function sector(fovDeg: number, bearingDeg: number): string {
  if (fovDeg >= 360) return '360°';
  return `${Math.round(fovDeg)}° at ${formatBearing(bearingDeg)}`;
}
