// Display formatters for the report. Store metres, seconds and m/s; show nm, ft and kt under
// `nav`, km, m and m/s under `si` (spec section 3 item 3). Lane 4.5 is lifting a shared module;
// this local copy goes when that lands.
import type { Units } from '../../state/ui';

export const M_PER_NM = 1852;
export const M_PER_FT = 0.3048;
export const MS_PER_KT = M_PER_NM / 3600;

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

export function sector(fovDeg: number, bearingDeg: number): string {
  if (fovDeg >= 360) return '360°';
  const b = ((Math.round(bearingDeg) % 360) + 360) % 360;
  return `${Math.round(fovDeg)}° at ${String(b).padStart(3, '0')}°`;
}
