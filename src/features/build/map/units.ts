// Display units (spec section 3 item 3). Stored values are metres, seconds and metres per
// second. `nav` shows nm, ft AGL and kt; `si` shows km, m and m/s. Numbers carry a unit.
// Lives here until a later lane lifts it to a shared place.
import type { Units } from '../../../state/ui';

export type Quantity = 'range' | 'altitude' | 'speed';

const M_PER_NM = 1852;
const FT_PER_M = 3.280839895;
const KT_PER_MS = 1.943844492;

const FACTOR: Record<Units, Record<Quantity, number>> = {
  nav: { range: 1 / M_PER_NM, altitude: FT_PER_M, speed: KT_PER_MS },
  si: { range: 1 / 1000, altitude: 1, speed: 1 },
};

const UNIT: Record<Units, Record<Quantity, string>> = {
  nav: { range: 'nm', altitude: 'ft AGL', speed: 'kt' },
  si: { range: 'km', altitude: 'm AGL', speed: 'm/s' },
};

const DECIMALS: Record<Units, Record<Quantity, number>> = {
  nav: { range: 2, altitude: 0, speed: 0 },
  si: { range: 2, altitude: 0, speed: 1 },
};

export function unitOf(q: Quantity, units: Units): string {
  return UNIT[units][q];
}

/** Stored SI value to the display number. */
export function toDisplay(q: Quantity, v: number, units: Units): number {
  return v * FACTOR[units][q];
}

/** Display number back to the stored SI value. */
export function fromDisplay(q: Quantity, v: number, units: Units): number {
  return v / FACTOR[units][q];
}

export function format(q: Quantity, v: number, units: Units): string {
  return `${toDisplay(q, v, units).toFixed(DECIMALS[units][q])} ${UNIT[units][q]}`;
}

export const formatRange = (m: number, u: Units) => format('range', m, u);
export const formatAltitude = (m: number, u: Units) => format('altitude', m, u);
export const formatSpeed = (ms: number, u: Units) => format('speed', ms, u);

/** Bearing as three digits and a degree sign: 045°. */
export function formatBearing(deg: number): string {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return `${String(d).padStart(3, '0')}°`;
}

/** An angle such as a field of view: 90°. */
export function formatAngle(deg: number): string {
  return `${Math.round(deg)}°`;
}
