// Legacy PS.units and PS.fmt formatters (00-ns.js), ported one to one for the board. The port is
// literal, so the legacy names stay (h, hDual, v, spd, t, brg, roundBar, hundredsFt). The wiring
// lane can dedupe these with src/features/shared/units.ts: `h` matches `formatRange`-style nm/km
// text, `v` the altitude text with the datum, `spd` the kt or m/s text, `t` the t+m:ss clock.
// Unlike legacy there is no global mode: makeUnits(mode) returns a formatter bound to one mode.
import type { Units } from '../state/ui';

export const NM = 1852;
export const FT = 0.3048;
export const KT = 0.514444;

/** Thousands commas, d decimals; '' for null or a non-finite number (legacy fmt.n). */
export function fmtN(x: number | null | undefined, d = 0): string {
  if (x == null || !isFinite(x)) return '';
  const s = Math.abs(x).toFixed(d).split('.');
  const neg = x < 0 && Number(s.join('.')) !== 0;
  const int = s[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + int + (s.length > 1 ? '.' + s[1] : '');
}

/** Hundreds of feet, three digits (legacy fmt.hundredsFt). */
export function hundredsFt(m: number): string {
  const h = Math.max(0, Math.round(m / FT / 100));
  return (h < 10 ? '00' : h < 100 ? '0' : '') + h;
}

function hNum(m: number, mode: Units): string {
  const x = m / (mode === 'si' ? 1000 : NM);
  return fmtN(x, Math.abs(x) < 10 ? 2 : 1) + (mode === 'si' ? ' km' : ' nm');
}

function spdNum(ms: number, mode: Units): string {
  return mode === 'si' ? fmtN(ms, 0) + ' m/s' : fmtN(ms / KT, 0) + ' kt';
}

const BAR = [0.5, 1, 2, 5, 10];

export type BoardUnits = {
  mode: Units;
  NM: number;
  FT: number;
  KT: number;
  labels(): { h: string; v: string; spd: string };
  h(m: number): string;
  hDual(m: number): string;
  v(m: number, datum?: string): string;
  spd(ms: number): string;
  spdDual(ms: number): string;
  t(s: number | null | undefined): string;
  brg(deg: number): string;
  roundBar(ext: number): { m: number; label: string };
};

const cache: Partial<Record<Units, BoardUnits>> = {};

/** The legacy PS.units API bound to one mode. */
export function makeUnits(modeIn: Units | undefined | null): BoardUnits {
  const mode: Units = modeIn === 'si' ? 'si' : 'nav';
  const hit = cache[mode];
  if (hit) return hit;
  const u: BoardUnits = {
    mode,
    NM,
    FT,
    KT,
    labels: () =>
      mode === 'si' ? { h: 'km', v: 'm', spd: 'm/s' } : { h: 'nm', v: 'ft', spd: 'kt' },
    h: (m) => hNum(m, mode),
    // the twin is metres in nav and nm in si
    hDual: (m) =>
      mode === 'si'
        ? hNum(m, 'si') + ' (' + hNum(m, 'nav') + ')'
        : hNum(m, 'nav') + ' (' + fmtN(m, 0) + ' m)',
    // nav always names the datum (default AGL); si names it only when the caller passes it
    v: (m, datum) =>
      mode === 'si'
        ? fmtN(m, 0) + ' m' + (datum ? ' ' + datum : '')
        : fmtN(m / FT, 0) + ' ft ' + (datum || 'AGL'),
    spd: (ms) => spdNum(ms, mode),
    spdDual: (ms) => spdNum(ms, mode) + ' (' + spdNum(ms, mode === 'si' ? 'nav' : 'si') + ')',
    t: (s) => {
      if (s == null) return 'full run';
      const r = Math.max(0, Math.round(s));
      const mm = Math.floor(r / 60);
      const ss = r % 60;
      return 't+' + mm + ':' + (ss < 10 ? '0' : '') + ss;
    },
    brg: (deg) => {
      const d = ((Math.round(deg) % 360) + 360) % 360;
      return (d < 10 ? '00' : d < 100 ? '0' : '') + d + '°';
    },
    roundBar: (ext) => {
      const unit = mode === 'si' ? 1000 : NM;
      const target = ext / 4 / unit;
      let best = BAR[0]!;
      let bd = Infinity;
      for (const b of BAR) {
        const d = Math.abs(b - target);
        if (d < bd - 1e-9 || Math.abs(d - bd) <= 1e-9) {
          best = b;
          bd = d;
        }
      }
      return { m: best * unit, label: best + (mode === 'si' ? ' km' : ' nm') };
    },
  };
  cache[mode] = u;
  return u;
}

/** The number part of a unit text: "1.50 nm" -> "1.50", "400 ft AGL" -> "400" (legacy numOnly). */
export function numOnly(s: string): string {
  return String(s).replace(/\s*[a-zA-Z/]+(\s+[A-Z]+)?$/, '');
}
