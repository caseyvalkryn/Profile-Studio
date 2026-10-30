// Display units for every Build view (principle 1.3, spec section 3). Stored values are metres,
// seconds and metres per second. `nav` shows nm, ft AGL and kt; `si` shows km, m AGL and m/s.
// Every argument list reads (quantity, value, units). Numbers always carry a unit.
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
