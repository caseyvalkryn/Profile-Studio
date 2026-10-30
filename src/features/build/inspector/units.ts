// Display units for the inspector (spec section 3 item 3). Store metres, seconds and m/s.
// Nav shows nm, ft and kt; SI shows km, m and m/s. The wiring lane may lift this to a shared module.
import type { Units } from '../../../state/ui';

export const M_PER_NM = 1852;
export const M_PER_FT = 0.3048;
export const MS_PER_KT = M_PER_NM / 3600;

export type Quantity = 'range' | 'alt' | 'speed';

type Scale = { unit: string; perStored: number; decimals: number };

const SCALES: Record<Units, Record<Quantity, Scale>> = {
  nav: {
    range: { unit: 'nm', perStored: 1 / M_PER_NM, decimals: 3 },
    alt: { unit: 'ft', perStored: 1 / M_PER_FT, decimals: 0 },
    speed: { unit: 'kt', perStored: 1 / MS_PER_KT, decimals: 1 },
  },
  si: {
    range: { unit: 'km', perStored: 1 / 1000, decimals: 3 },
    alt: { unit: 'm', perStored: 1, decimals: 1 },
    speed: { unit: 'm/s', perStored: 1, decimals: 1 },
  },
};

export function unitOf(units: Units, q: Quantity): string {
  return SCALES[units][q].unit;
}

/** Stored value to display value, rounded for the field. */
export function toDisplay(units: Units, q: Quantity, stored: number): number {
  const s = SCALES[units][q];
  return round(stored * s.perStored, s.decimals);
}

/** Display value to stored value, not rounded. */
export function toStored(units: Units, q: Quantity, shown: number): number {
  return shown / SCALES[units][q].perStored;
}

export function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** Bearing as three digits and a degree sign: 45 shows as 045°. */
export function formatBearing(deg: number): string {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return `${String(d).padStart(3, '0')}°`;
}
