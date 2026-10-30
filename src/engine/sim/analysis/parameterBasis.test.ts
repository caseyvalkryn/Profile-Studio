// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SpecModel } from '../model/types';
import { FIELDS_BY_KIND, hasSpec } from './parameterBasis';

describe('FIELDS_BY_KIND (slice 3.a contract)', () => {
  it('keeps the Phase 1 order at the head of every list', () => {
    expect(FIELDS_BY_KIND.sensor?.slice(0, 2)).toEqual(['detectRangeM', 'trackInitS']);
    expect(FIELDS_BY_KIND.effector).toEqual(['pk', 'engageTimeS', 'targetS', 'bdaS']);
    expect(FIELDS_BY_KIND.uas).toEqual(['rcsM2']);
  });

  it('grows with the Phase 2 sensor accuracy fields and the c2 decision latency', () => {
    expect(FIELDS_BY_KIND.sensor).toEqual([
      'detectRangeM',
      'trackInitS',
      'rangeAccuracyM',
      'azimuthAccuracyDeg',
      'elevationAccuracyDeg',
      'falseAlarmRatePerScan',
    ]);
    expect(FIELDS_BY_KIND.c2).toEqual(['decisionLatencyS']);
  });

  it('hasSpec admits a c2 model with a spec and rejects one without', () => {
    const base = { id: 'c', name: 'c', description: '', color: '#000', builtin: true };
    const withSpec: SpecModel = { ...base, kind: 'c2', c2: { decisionLatencyS: 10 } };
    const without: SpecModel = { ...base, kind: 'c2' };
    expect(hasSpec(withSpec)).toBe(true);
    expect(hasSpec(without)).toBe(false);
  });
});
