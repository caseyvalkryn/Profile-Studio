// Display formatters for the timeline and the profile view (spec section 3, Units). Values are
// stored in metres and seconds; these convert for display only. The wiring lane may lift them.
import type { Units } from '../../../state/ui';

const M_PER_NM = 1852;
const M_PER_FT = 0.3048;

/** Seconds as `t+m:ss`, rounded to the whole second. Negative times show as t+0:00. */
export function fmtTime(s: number): string {
  const whole = Math.max(0, Math.round(s));
  const m = Math.floor(whole / 60);
  const ss = whole % 60;
  return `t+${m}:${ss < 10 ? '0' : ''}${ss}`;
}

/** The distance unit label: nm by default, km in SI. */
export function distanceUnit(units: Units): string {
  return units === 'si' ? 'km' : 'nm';
}

/** The altitude unit label: ft AGL by default, m AGL in SI. */
export function altitudeUnit(units: Units): string {
  return units === 'si' ? 'm AGL' : 'ft AGL';
}

/** Metres to the display distance unit. */
export function toDistance(m: number, units: Units): number {
  return units === 'si' ? m / 1000 : m / M_PER_NM;
}

/** Metres to the display altitude unit. */
export function toAltitude(m: number, units: Units): number {
  return units === 'si' ? m : m / M_PER_FT;
}

function trim(v: number, digits: number): string {
  return Number(v.toFixed(digits)).toString();
}

/** A distance with its unit, for example `2.4 nm`. */
export function fmtDistance(m: number, units: Units, digits = 1): string {
  return `${trim(toDistance(m, units), digits)} ${distanceUnit(units)}`;
}

/** An altitude with its unit, for example `330 ft AGL`. */
export function fmtAltitude(m: number, units: Units): string {
  return `${Math.round(toAltitude(m, units))} ${altitudeUnit(units)}`;
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
