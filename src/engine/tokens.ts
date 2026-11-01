// Live tokens in caption and notes text (spec section 6 item 6), ported from legacy/js/21-derive.js
// `D.tokens` (406-431) and the unknown-token reasons of 51-panel-notes.js `preview`.
// `{id.key}` with id a threat id and key rng, alt, spd, vc, tta, window or margin, or
// `{systemId.see:threatId}`. An unknown id or key stays as typed and is reported with its reason.

import { rangeAt } from './geo';
import type { Derived } from './derived';

export type UnitMode = 'nav' | 'si';

const NM = 1852;
const FT = 0.3048;
const KT = 0.514444;

/** Legacy `fmt.n`: fixed decimals with thousands separators; "" for a missing number. */
export function fmtN(x: number | null | undefined, d = 0): string {
  if (x == null || !isFinite(x)) return '';
  const s = Math.abs(x).toFixed(d).split('.');
  const neg = x < 0 && Number(s.join('.')) !== 0;
  const int = s[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + int + (s.length > 1 ? '.' + s[1] : '');
}

/**
 * The legacy `PS.units` formats, kept here so the engine stays free of feature imports. The board
 * formatter (src/board/format.ts) builds on them (lane 9.2.6).
 */
export const legacyUnits = {
  /** Horizontal distance: nm (2 decimals under 10, else 1) or km. */
  h(m: number, mode: UnitMode = 'nav'): string {
    const x = m / (mode === 'si' ? 1000 : NM);
    return fmtN(x, Math.abs(x) < 10 ? 2 : 1) + (mode === 'si' ? ' km' : ' nm');
  },
  /** Height: ft with the datum (default AGL) in nav; m in si, datum only when given. */
  v(m: number, mode: UnitMode = 'nav', datum?: string): string {
    if (mode === 'si') return fmtN(m, 0) + ' m' + (datum ? ' ' + datum : '');
    return fmtN(m / FT, 0) + ' ft ' + (datum || 'AGL');
  },
  spd(ms: number, mode: UnitMode = 'nav'): string {
    return mode === 'si' ? fmtN(ms, 0) + ' m/s' : fmtN(ms / KT, 0) + ' kt';
  },
  /** `t+m:ss`; "full run" for a null time. */
  t(s: number | null): string {
    if (s == null) return 'full run';
    const r = Math.max(0, Math.round(s));
    const m = Math.floor(r / 60);
    const ss = r % 60;
    return 't+' + m + ':' + (ss < 10 ? '0' : '') + ss;
  },
};

/** Signed m:ss for durations ("+2:22", "0:12"); legacy `mmss`. */
export function mmss(s: number, signed = false): string {
  const neg = s < 0;
  const r = Math.round(Math.abs(s));
  const m = Math.floor(r / 60);
  const ss = r % 60;
  return (signed ? (neg ? '-' : '+') : neg ? '-' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
}

export type TokenIssue = { token: string; reason: string };
export type ResolvedText = { text: string; issues: TokenIssue[] };

export type TokenOptions = {
  mode?: UnitMode;
  /** Site datum and ground elevation; alt shows MSL only when datum is 'MSL'. */
  datum?: string;
  elevM?: number;
};

const STRICT = /^([A-Za-z0-9_-]+)\.(rng|alt|spd|vc|tta|window|margin|see:([A-Za-z0-9_-]+))$/;

/** The one token value, or null when the id or key is unknown. */
function valueOf(
  d: Derived,
  id: string,
  key: string,
  pid: string | undefined,
  tS: number,
  ref: string | null | undefined,
  o: TokenOptions,
): string | null {
  const U = legacyUnits;
  const mode = o.mode ?? 'nav';
  if (pid) {
    const byThreat = d.first[pid];
    if (!byThreat) return null;
    const f = byThreat[id];
    if (f === undefined) return null;
    if (f === null) return 'no see';
    const s = d.systemAt(id);
    return U.t(f.t) + ' ' + U.h(rangeAt(d.timed[pid]!, f.t, s ?? d.origin), mode);
  }
  if (!d.timed[id]) return null;
  const a = d.at(id, tS, ref ?? 'asset');
  if (!a) return null;
  const win = d.window[id];
  switch (key) {
    case 'rng':
      return U.h(a.r, mode);
    case 'alt':
      return U.v(a.z + (o.datum === 'MSL' ? (o.elevM ?? 0) : 0), mode, o.datum);
    case 'spd':
      return U.spd(a.spd, mode);
    case 'vc':
      return U.spd(a.vc, mode);
    case 'tta':
      return a.tta == null ? 'no entry' : mmss(a.tta);
    case 'window':
      return win?.geometric == null ? 'no window' : mmss(win.geometric);
    case 'margin':
      return win?.margin == null ? 'no margin' : mmss(win.margin, true);
  }
  return null;
}

/**
 * Replace every `{...}` token in `text` with its value at `tS`. An unknown token stays as typed
 * and is listed in `issues` with the reason the notes panel shows.
 */
export function resolveTokens(
  text: string | null | undefined,
  d: Derived | null,
  tS: number | null = 0,
  ref?: string | null,
  opts: TokenOptions = {},
): ResolvedText {
  const issues: TokenIssue[] = [];
  if (text == null) return { text: '', issues };
  if (!d) return { text: String(text), issues };
  const tt = tS ?? 0;
  const out = String(text).replace(/\{([^{}\s]+)\}/g, (all, body: string) => {
    const m = STRICT.exec(body);
    const v = m ? valueOf(d, m[1]!, m[2]!, m[3], tt, ref, opts) : null;
    if (v != null) return v;
    const id = body.split(/[.:]/)[0]!;
    const known = d.timed[id] !== undefined || d.systemAt(id) !== null;
    issues.push({
      token: all,
      reason: known ? `${all} is not a token.` : `${all} has no threat ${id}.`,
    });
    return all;
  });
  return { text: out, issues };
}
