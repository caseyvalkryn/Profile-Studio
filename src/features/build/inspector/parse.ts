// Legacy inspector parsing and display (legacy/js/51-panel-inspector.js parseVal, shown, suffix and
// legacy/js/00-ns.js toM, parseT). Values store in metres, seconds and metres per second.
import type { Units } from '../../../state/ui';
import { M_PER_FT, M_PER_NM, MS_PER_KT } from '../../shared/units';

/**
 * Field types, legacy `data-ty`: h horizontal distance, v height, vz point height above ground,
 * spd speed, deg angle, s duration (0 or more), num plain number, t time on the run, txt text.
 */
export type FieldType = 'h' | 'v' | 'vz' | 'spd' | 'deg' | 's' | 'num' | 't';

export type Parsed<T> = { v: T; err?: undefined } | { v?: undefined; err: string };

const SUFFIX: Record<'h' | 'v' | 'spd', Record<string, number>> = {
  h: { nm: M_PER_NM, km: 1000, m: 1, ft: M_PER_FT },
  v: { ft: M_PER_FT, m: 1, km: 1000, nm: M_PER_NM },
  spd: { kt: MS_PER_KT, kts: MS_PER_KT, 'm/s': 1, mps: 1 },
};

/** Metres (or m/s) per display unit. */
export function factor(kind: 'h' | 'v' | 'spd', units: Units): number {
  const si = units === 'si';
  if (kind === 'h') return si ? 1000 : M_PER_NM;
  if (kind === 'v') return si ? 1 : M_PER_FT;
  return si ? 1 : MS_PER_KT;
}

/** Legacy U.toM: a number in display units, or with a unit suffix (2km, 900ft, 40kt). */
export function toM(text: string, kind: 'h' | 'v' | 'spd', units: Units): number | null {
  const s = text.replace(/\s+/g, '').replace(/,/g, '').toLowerCase();
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))([a-z/]*)$/.exec(s);
  if (!m) return null;
  const x = Number(m[1]);
  if (!Number.isFinite(x)) return null;
  if (!m[2]) return x * factor(kind, units);
  const f = SUFFIX[kind][m[2]];
  return f === undefined ? null : x * f;
}

/** Legacy U.parseT: `+n` or `-n` from now, `t+m:ss`, seconds, or m:ss. Null when unreadable. */
export function parseT(text: string, tNow = 0): number | null {
  const s = text.replace(/\s+/g, '').toLowerCase();
  const rel = /^([+-])(\d+(?:\.\d+)?)$/.exec(s);
  if (rel) return Math.max(0, tNow + (rel[1] === '-' ? -1 : 1) * Number(rel[2]));
  const t = s.replace(/^t\+/, '');
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  const ms = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(t);
  if (ms && Number(ms[2]) < 60) return Number(ms[1]) * 60 + Number(ms[2]);
  return null;
}

/** Legacy parseVal for the numeric types. Rounds as legacy: 0.1 m, 0.01 m/s, 0.1 s. */
export function parseValue(ty: FieldType, raw: string, units: Units, tNow = 0): Parsed<number> {
  const t = raw.trim();
  if (ty === 'h' || ty === 'v' || ty === 'spd') {
    const m = toM(t, ty, units);
    if (m === null || !Number.isFinite(m))
      return { err: 'Type a number, for example 2km or 900ft.' };
    return { v: ty === 'spd' ? Math.round(m * 100) / 100 : Math.round(m * 10) / 10 };
  }
  if (ty === 'vz') {
    const z = toM(t, 'v', units);
    if (z === null || !Number.isFinite(z))
      return { err: 'Type a number, for example 120m or 400ft.' };
    return { v: Math.round(z * 10) / 10 };
  }
  if (ty === 't') {
    const v = parseT(t, tNow);
    return v === null ? { err: 'Type a time as 2:55 or 175.' } : { v: Math.round(v * 10) / 10 };
  }
  const n = Number(t);
  if (!t || !Number.isFinite(n)) return { err: 'Type a number.' };
  if (ty === 's' && n < 0) return { err: 'Type a number of 0 or more.' };
  return { v: n };
}

/** Legacy `ids`: comma or space separated ids, each one of `known`. */
export function parseIds(raw: string, known: readonly string[]): Parsed<string[]> {
  const ids = raw.trim()
    ? raw
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
    : [];
  for (const id of ids) if (!known.includes(id)) return { err: `${id} is not a system id.` };
  return { v: ids };
}

/** Legacy `shown`: the stored value in display units, 3 decimals for h, 1 for spd, 0 for v. */
export function shown(m: number | null | undefined, ty: FieldType, units: Units): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '';
  if (ty === 'h' || ty === 'v' || ty === 'vz' || ty === 'spd') {
    const k = ty === 'vz' ? 'v' : ty;
    const d = k === 'h' ? 3 : k === 'spd' ? 1 : 0;
    return String(Number((m / factor(k, units)).toFixed(d)));
  }
  if (ty === 't') return String(Math.round(m * 10) / 10);
  return String(m);
}

/** Legacy `suffix`; a point height (vz) names its datum. */
export function suffix(ty: FieldType, units: Units): string {
  const nav = units !== 'si';
  if (ty === 'h') return nav ? 'nm' : 'km';
  if (ty === 'v') return nav ? 'ft' : 'm';
  if (ty === 'vz') return nav ? 'ft AGL' : 'm AGL';
  if (ty === 'spd') return nav ? 'kt' : 'm/s';
  if (ty === 'deg') return 'deg';
  if (ty === 's' || ty === 't') return 's';
  return '';
}

/** Legacy U.t: `t+m:ss`, or "full run" for no time. */
export function tText(s: number | null): string {
  if (s === null) return 'full run';
  const r = Math.max(0, Math.round(s));
  return `t+${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}

/** Legacy U.v: a height with its datum word. */
export function vText(m: number, units: Units): string {
  if (units === 'si') return `${Math.round(m)} m`;
  return `${Math.round(m / M_PER_FT).toLocaleString('en-US')} ft AGL`;
}

/** Legacy U.h: 2 decimals under 10, else 1. */
export function hText(m: number, units: Units): string {
  const x = m / factor('h', units);
  return `${x.toFixed(Math.abs(x) < 10 ? 2 : 1)} ${units === 'si' ? 'km' : 'nm'}`;
}

/** Legacy U.spd: a whole number of kt or m/s. */
export function spdText(ms: number, units: Units): string {
  return `${Math.round(ms / factor('spd', units))} ${units === 'si' ? 'm/s' : 'kt'}`;
}
