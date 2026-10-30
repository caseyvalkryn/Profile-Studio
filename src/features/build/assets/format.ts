// Unit formatters for the asset library. The wiring lane may lift these to a shared module.
import type { Units } from '../../../state/ui';

const KT_PER_MS = 3600 / 1852;
const FT_PER_M = 1 / 0.3048;

const num = (v: number) => Math.round(v).toLocaleString('en-US');

/** Speed from m/s: knots in `nav`, m/s in `si`. */
export function formatSpeed(ms: number, units: Units): string {
  return units === 'nav' ? `${num(ms * KT_PER_MS)} kt` : `${num(ms)} m/s`;
}

/** Altitude from metres: feet in `nav`, metres in `si`. */
export function formatAltitude(m: number, units: Units): string {
  return units === 'nav' ? `${num(m * FT_PER_M)} ft` : `${num(m)} m`;
}
