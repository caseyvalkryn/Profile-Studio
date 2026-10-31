// The legacy unit strings (legacy/js/00-ns.js U.h, U.v, U.spd, U.t and fmt.n), shared by the rail,
// the palette, the menu and the tip so their numbers read the same as the legacy panels.
import type { AuthoredEventType } from '../../../domain/types';
import type { Units } from '../../../state/ui';
import { M_PER_FT, M_PER_NM, MS_PER_KT } from '../../shared/units';

/** A number with `d` decimals and comma grouping: 1234.5 reads 1,234.5. */
export function num(x: number, d = 0): string {
  const [i, f] = x.toFixed(d).split('.');
  return i!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? `.${f}` : '');
}

/** A horizontal distance: two decimals under 10, else one. `2.16 nm`, `4.00 km`. */
export function hDist(m: number, units: Units): string {
  const x = m / (units === 'si' ? 1000 : M_PER_NM);
  return `${num(x, Math.abs(x) < 10 ? 2 : 1)} ${units === 'si' ? 'km' : 'nm'}`;
}

/** A height with its datum: `394 ft AGL`, `120 m`. Nav always names the datum. */
export function vHeight(m: number, units: Units, datum?: string): string {
  if (units === 'si') return `${num(m, 0)} m${datum ? ` ${datum}` : ''}`;
  return `${num(m / M_PER_FT, 0)} ft ${datum ?? 'AGL'}`;
}

/** A height without the datum, for a data column: `394 ft`, `120 m`. */
export function vBare(m: number, units: Units): string {
  return units === 'si' ? `${num(m, 0)} m` : `${num(m / M_PER_FT, 0)} ft`;
}

/** A speed: `19 kt`, `10 m/s`. */
export function spd(ms: number, units: Units): string {
  return units === 'si' ? `${num(ms, 0)} m/s` : `${num(ms / MS_PER_KT, 0)} kt`;
}

/** A time on the run: `t+2:30`; null reads `full run`. */
export function tText(s: number | null): string {
  if (s == null) return 'full run';
  const r = Math.max(0, Math.round(s));
  const m = Math.floor(r / 60);
  const ss = r % 60;
  return `t+${m}:${ss < 10 ? '0' : ''}${ss}`;
}

/** An area: `0.07 nm²`, `0.25 km²`. */
export function areaText(m2: number, units: Units): string {
  const f = units === 'si' ? 1e6 : M_PER_NM * M_PER_NM;
  return `${num(m2 / f, 2)} ${units === 'si' ? 'km²' : 'nm²'}`;
}

/** Shoelace area of a polygon in square metres. */
export function polygonArea(pts: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** Event names, legacy C.EV_NAMES. */
export const EVENT_NAMES: Record<AuthoredEventType, string> = {
  detect: 'Detect',
  track: 'Track init',
  identify: 'Identify',
  engage: 'Engage',
  split: 'Split',
  merge: 'Merge',
  loiter: 'Loiter',
  terminal: 'Terminal',
  checkpoint: 'Checkpoint',
};

/** One-letter event marks, legacy C.EV_TYPES. */
export const EVENT_LETTERS: Record<AuthoredEventType, string> = {
  detect: 'D',
  track: 'T',
  identify: 'I',
  engage: 'E',
  split: 'S',
  merge: 'M',
  loiter: 'L',
  terminal: 'X',
  checkpoint: 'C',
};

/** Event types in legacy order. */
export const EVENT_TYPES = Object.keys(EVENT_NAMES) as AuthoredEventType[];
