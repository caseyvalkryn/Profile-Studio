// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { EffectorSpec, UasSpec } from '../model/types';
import { JAM_BANDS } from '../model/types';
import {
  JAM_EDGE_FACTOR,
  JAM_PARTIAL_BAND_FACTOR,
  assessJam,
  effectiveJamRangeM,
  jamToSignalRangeM,
  jamBandsOverlap,
  jammerBands,
  targetLinkBands,
} from './ewPhysics';

function jammer(patch?: Partial<EffectorSpec>): EffectorSpec {
  return {
    effectorType: 'jammer',
    minRangeM: 0,
    maxRangeM: 2000,
    engageTimeS: 5,
    ...patch,
  };
}

function uas(patch?: Partial<UasSpec>): UasSpec {
  return {
    group: 1,
    airframe: 'quad',
    cruiseSpeedMps: 15,
    maxSpeedMps: 20,
    enduranceMin: 30,
    altBandFt: [0, 400],
    navMode: 'gps',
    emissionsNote: '',
    ...patch,
  };
}

const ORIGIN = { x: 0, y: 0 };

describe('targetLinkBands', () => {
  it('derives bands from the nav mode', () => {
    expect(targetLinkBands(uas({ navMode: 'gps' }))).toEqual(['gnss']);
    expect(targetLinkBands(uas({ navMode: 'rf-manual' }))).toEqual(['ism-2400', 'ism-5800']);
    expect(targetLinkBands(uas({ navMode: 'mixed' }))).toEqual(['gnss', 'ism-2400', 'ism-5800']);
    expect(targetLinkBands(uas({ navMode: 'fiber' }))).toEqual([]);
    expect(targetLinkBands(uas({ navMode: 'inertial' }))).toEqual([]);
    expect(targetLinkBands(uas({ navMode: 'optical' }))).toEqual([]);
  });
  it('respects a spec override', () => {
    expect(targetLinkBands(uas({ navMode: 'rf-manual', linkBands: ['ism-915'] }))).toEqual([
      'ism-915',
    ]);
  });
});

describe('jammerBands / jamBandsOverlap', () => {
  it('defaults a legacy jammer to every band', () => {
    expect(jammerBands(jammer())).toEqual(JAM_BANDS);
  });
  it('overlap requires a shared band and a jammable nav mode', () => {
    const linkOnly = jammer({ jamBands: ['ism-2400', 'ism-5800'] });
    expect(jamBandsOverlap(linkOnly, uas({ navMode: 'gps' }))).toBe(false);
    expect(jamBandsOverlap(linkOnly, uas({ navMode: 'rf-manual' }))).toBe(true);
    expect(jamBandsOverlap(linkOnly, uas({ navMode: 'mixed' }))).toBe(true);
    expect(jamBandsOverlap(jammer(), uas({ navMode: 'fiber' }))).toBe(false);
  });
});

describe('effectiveJamRangeM', () => {
  it('holds the placard range at rated power', () => {
    expect(effectiveJamRangeM(jammer())).toBe(2000);
    expect(effectiveJamRangeM(jammer({ eirpW: 50 }))).toBe(2000);
  });
  it('scales range with the square root of the power ratio', () => {
    expect(effectiveJamRangeM(jammer({ eirpW: 25, ratedEirpW: 100 }))).toBeCloseTo(1000, 9);
    expect(effectiveJamRangeM(jammer({ eirpW: 400, ratedEirpW: 100 }))).toBeCloseTo(4000, 9);
  });
  it('charges the target link margin as a power ratio', () => {
    // +6 dB of resistance is a 3.98x power cost: range shrinks by ~2x.
    const r = effectiveJamRangeM(jammer(), uas({ jamResistDb: 6 }));
    expect(r).toBeCloseTo(2000 / Math.sqrt(Math.pow(10, 0.6)), 6);
  });

  it('closes J/S from the target signal and jammer received power', () => {
    const radioTarget = uas({
      navMode: 'rf-manual',
      linkBands: ['ism-2400'],
      radiatedPowerW: 1,
      controlLinkRangeM: 1000,
    });
    const radioJammer = jammer({ maxRangeM: 5000, eirpW: 4, jamBands: ['ism-2400'] });
    // The same free-space path on both sides gives
    // R_jam = R_link * sqrt(P_jam / P_signal) = 1000 * sqrt(4) = 2000 m.
    expect(jamToSignalRangeM(radioJammer, radioTarget)).toBeCloseTo(2000, 9);
    expect(effectiveJamRangeM(radioJammer, radioTarget)).toBeCloseTo(2000, 9);
    expect(
      jamToSignalRangeM({ ...radioJammer, eirpW: undefined, ratedEirpW: 4 }, radioTarget),
    ).toBeCloseTo(2000, 9);
    expect(effectiveJamRangeM(radioJammer, { ...radioTarget, jamResistDb: 6 })).toBeCloseTo(
      2000 / Math.sqrt(10 ** 0.6),
      9,
    );
  });

  it('keeps the legacy power and resistance result exactly with null target power', () => {
    const spec = jammer({ eirpW: 25, ratedEirpW: 100 });
    const target = uas({ radiatedPowerW: null, controlLinkRangeM: 1000, jamResistDb: 6 });
    const legacy = spec.maxRangeM * Math.sqrt(25 / 100 / Math.pow(10, 6 / 10));
    expect(jamToSignalRangeM(spec, target)).toBeNull();
    expect(effectiveJamRangeM(spec, target)).toBe(legacy);
    const actual = assessJam(spec, ORIGIN, 0, target, { x: 0, y: -legacy / 2 });
    expect(actual.effectiveRangeM).toBe(legacy);
    expect(actual.powerFactor).toBe(0.85);
  });
});

describe('assessJam', () => {
  it('is ineffective with no band overlap and against jam-immune nav modes', () => {
    const linkOnly = jammer({ jamBands: ['ism-2400', 'ism-5800'] });
    expect(
      assessJam(linkOnly, ORIGIN, 0, uas({ navMode: 'gps' }), { x: 0, y: -500 }).effective,
    ).toBe(false);
    expect(
      assessJam(jammer(), ORIGIN, 0, uas({ navMode: 'fiber' }), { x: 0, y: -500 }).effective,
    ).toBe(false);
  });

  it('keeps the legacy falloff at full power on boresight with full coverage', () => {
    // d = 1000 of 2000: powerFactor = 1 - 0.3 * 0.5 = 0.85, all else 1.
    const a = assessJam(jammer(), ORIGIN, 0, uas(), { x: 0, y: -1000 });
    expect(a.effective).toBe(true);
    expect(a.bandFactor).toBe(1);
    expect(a.alignFactor).toBe(1);
    expect(a.factor).toBeCloseTo(0.85, 9);
  });

  it('discounts partial band coverage', () => {
    // GNSS-only jammer vs mixed nav: covers 1 of 3 link bands.
    const gnssOnly = jammer({ jamBands: ['gnss'] });
    const a = assessJam(gnssOnly, ORIGIN, 0, uas({ navMode: 'mixed' }), { x: 0, y: -1000 });
    expect(a.effective).toBe(true);
    expect(a.bandFactor).toBe(JAM_PARTIAL_BAND_FACTOR);
    expect(a.coveredBands).toEqual(['gnss']);
    expect(a.factor).toBeCloseTo(JAM_PARTIAL_BAND_FACTOR * 0.85, 9);
  });

  it('tapers off boresight and cuts off outside the sector', () => {
    const cone = jammer({ sectorDeg: 90 });
    const d = 1000;
    const on = assessJam(cone, ORIGIN, 0, uas(), { x: 0, y: -d });
    const edge = assessJam(cone, ORIGIN, 0, uas(), {
      x: d * Math.sin(Math.PI / 4),
      y: -d * Math.cos(Math.PI / 4),
    });
    const outside = assessJam(cone, ORIGIN, 0, uas(), { x: d, y: 0 });
    expect(on.alignFactor).toBeCloseTo(1, 9);
    expect(edge.alignFactor).toBeCloseTo(JAM_EDGE_FACTOR, 6);
    expect(outside.effective).toBe(false);
    expect(on.factor).toBeGreaterThan(edge.factor);
  });

  it('cuts off beyond the power-scaled effective range', () => {
    // Quarter power halves the reach: 1000 m. A target at 1200 m is inside
    // the placard envelope but beyond what the power out can close.
    const derated = jammer({ eirpW: 25, ratedEirpW: 100 });
    const a = assessJam(derated, ORIGIN, 0, uas(), { x: 0, y: -1200 });
    expect(a.effective).toBe(false);
    expect(a.effectiveRangeM).toBeCloseTo(1000, 9);
    const inside = assessJam(derated, ORIGIN, 0, uas(), { x: 0, y: -500 });
    expect(inside.effective).toBe(true);
    expect(inside.powerFactor).toBeCloseTo(1 - 0.3 * 0.5, 9);
  });

  it('respects the min range', () => {
    const standoff = jammer({ minRangeM: 300 });
    expect(assessJam(standoff, ORIGIN, 0, uas(), { x: 0, y: -100 }).effective).toBe(false);
    expect(assessJam(standoff, ORIGIN, 0, uas(), { x: 0, y: -400 }).effective).toBe(true);
  });

  it('evaluates range, min range and falloff on the slant range', () => {
    // Jammer mount m = 4 m, target altitude h = 1204 m, so dAltM = 1200.
    // d = 1600: slant = sqrt(1600^2 + 1200^2) = 2000, the envelope edge,
    // powerFactor = 1 - 0.3 * 2000 / 2000 = 0.7 (horizontal would give 0.76).
    // d = 1800: horizontal is inside 2000 but slant = 2163 is outside.
    const dAltM = 1204 - 4;
    const edge = assessJam(jammer(), ORIGIN, 0, uas(), { x: 0, y: -1600 }, dAltM);
    expect(edge.effective).toBe(true);
    expect(edge.powerFactor).toBeCloseTo(0.7, 9);
    expect(assessJam(jammer(), ORIGIN, 0, uas(), { x: 0, y: -1800 }, dAltM).effective).toBe(false);
    // Min range 1000 on the slant: d = 600 with dAltM = 800 sits at 1000, inside.
    const standoff = jammer({ minRangeM: 1000 });
    expect(assessJam(standoff, ORIGIN, 0, uas(), { x: 0, y: -600 }, 800).effective).toBe(true);
    expect(assessJam(standoff, ORIGIN, 0, uas(), { x: 0, y: -600 }).effective).toBe(false);
  });

  it('keeps geometry factors for an entity with a deleted spec', () => {
    const a = assessJam(jammer(), ORIGIN, 0, undefined, { x: 0, y: -1000 });
    expect(a.effective).toBe(true);
    expect(a.bandFactor).toBe(1);
    expect(a.factor).toBeCloseTo(0.85, 9);
  });
});
