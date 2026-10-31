// @vitest-environment node
import { derived } from './derived';
import { preview } from './preview';
import { testVignette } from './testVignette';
import { fmtN, legacyUnits, mmss, resolveTokens } from './tokens';

const v = testVignette();
const d = derived(v, preview(v));

describe('legacy unit formats', () => {
  it('formats distances, heights, speeds and times as PS.units did', () => {
    expect(legacyUnits.h(3704)).toBe('2.00 nm');
    expect(legacyUnits.h(37040)).toBe('20.0 nm');
    expect(legacyUnits.h(1500, 'si')).toBe('1.50 km');
    expect(legacyUnits.v(304.8)).toBe('1,000 ft AGL');
    expect(legacyUnits.v(305, 'si')).toBe('305 m');
    expect(legacyUnits.v(305, 'si', 'MSL')).toBe('305 m MSL');
    expect(legacyUnits.spd(51.4444)).toBe('100 kt');
    expect(legacyUnits.spd(12, 'si')).toBe('12 m/s');
    expect(legacyUnits.t(182)).toBe('t+3:02');
    expect(legacyUnits.t(null)).toBe('full run');
    expect(fmtN(1234567.891, 1)).toBe('1,234,567.9');
    expect(fmtN(-0.04, 1)).toBe('0.0');
    expect(mmss(142.4, true)).toBe('+2:22');
    expect(mmss(-12)).toBe('-0:12');
  });
});

describe('resolveTokens', () => {
  it('replaces every known token at t and leaves the rest of the text alone', () => {
    const r = resolveTokens('T-01 at {T-01.rng}, {T-01.alt}, {T-01.spd}, closing {T-01.vc}', d, 60);
    const a = d.at('T-01', 60, 'asset')!;
    expect(r.issues).toEqual([]);
    expect(r.text).toBe(
      `T-01 at ${legacyUnits.h(a.r)}, ${legacyUnits.v(a.z)}, ${legacyUnits.spd(a.spd)}, closing ${legacyUnits.spd(a.vc)}`,
    );
    expect(resolveTokens('{T-01.rng}', d, 60, null, { mode: 'si' }).text).toBe(
      legacyUnits.h(a.r, 'si'),
    );
  });

  it('formats tta, window, margin and see tokens', () => {
    const w = d.window['T-01']!;
    expect(resolveTokens('{T-01.tta}', d, 0).text).toBe(mmss(d.tta('T-01', 0)!));
    expect(resolveTokens('{T-01.window}', d, 0).text).toBe(mmss(w.geometric!));
    expect(resolveTokens('{T-01.margin}', d, 0).text).toBe(mmss(w.margin!, true));
    const f = d.first['T-01']!['S-01']!;
    expect(resolveTokens('{S-01.see:T-01}', d, 0).text.startsWith(legacyUnits.t(f.t) + ' ')).toBe(
      true,
    );
  });

  it('keeps an unknown token as typed and reports the reason', () => {
    const r = resolveTokens('{T-09.rng} and {T-01.foo} and {S-01.see:T-09}', d, 0);
    expect(r.text).toBe('{T-09.rng} and {T-01.foo} and {S-01.see:T-09}');
    expect(r.issues).toEqual([
      { token: '{T-09.rng}', reason: '{T-09.rng} has no threat T-09.' },
      { token: '{T-01.foo}', reason: '{T-01.foo} is not a token.' },
      { token: '{S-01.see:T-09}', reason: '{S-01.see:T-09} is not a token.' },
    ]);
  });

  it('handles empty text and a missing derived object', () => {
    expect(resolveTokens(null, d)).toEqual({ text: '', issues: [] });
    expect(resolveTokens('{T-01.rng}', null)).toEqual({ text: '{T-01.rng}', issues: [] });
  });
});
