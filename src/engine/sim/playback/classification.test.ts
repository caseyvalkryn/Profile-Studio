// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ClassificationMatrix, SensorSpec } from '../model/types';
import { DEFAULT_REQUIREMENT_THRESHOLDS } from '../model/types';
import { bandFor, classifyByMatrix, matrixFor } from './classification';
import { deterministicPolicy, monteCarloPolicy } from './policy';

const matrix: ClassificationMatrix = {
  sensorType: 'eo-ir',
  bands: [
    { maxRangeM: 1000, pCorrect: 0.95, pFalseHostile: 0.05, timeToDeclareS: 2 },
    { maxRangeM: 3000, pCorrect: 0.7, pFalseHostile: 0.1, timeToDeclareS: 5 },
    { maxRangeM: 6000, pCorrect: 0.4, pFalseHostile: 0.2, timeToDeclareS: 10 },
  ],
};

const keys = { sensorId: 's', uasId: 'u', tS: 12 };
const det = deterministicPolicy(DEFAULT_REQUIREMENT_THRESHOLDS);

describe('bandFor', () => {
  it('picks the first band whose maxRangeM exceeds the range; none beyond the last', () => {
    expect(bandFor(matrix, 0)).toBe(matrix.bands[0]);
    expect(bandFor(matrix, 999.9)).toBe(matrix.bands[0]);
    expect(bandFor(matrix, 1000)).toBe(matrix.bands[1]);
    expect(bandFor(matrix, 5999)).toBe(matrix.bands[2]);
    expect(bandFor(matrix, 6000)).toBeNull();
    expect(bandFor({ sensorType: 'radar', bands: [] }, 100)).toBeNull();
  });
});

describe('classifyByMatrix', () => {
  it('deterministic: declares hostile when pCorrect > 0.5 after the band dwell, else not', () => {
    const near = classifyByMatrix(matrix, 500, det, keys)!;
    expect(near.declaredHostile).toBe(true);
    expect(near.timeToDeclareS).toBe(2);
    expect(near.u).toBe(0.5);
    const mid = classifyByMatrix(matrix, 2000, det, keys)!;
    expect(mid.declaredHostile).toBe(true);
    expect(mid.timeToDeclareS).toBe(5);
    const far = classifyByMatrix(matrix, 5000, det, keys)!;
    expect(far.declaredHostile).toBe(false);
    expect(far.timeToDeclareS).toBe(10);
  });

  it('a non-hostile track is declared hostile with pFalseHostile; never at the deterministic 0.5', () => {
    expect(classifyByMatrix(matrix, 500, det, keys, false)!.declaredHostile).toBe(false);
    const always = { classify: () => 0.01 };
    expect(classifyByMatrix(matrix, 500, always, keys, false)!.declaredHostile).toBe(true);
  });

  it('beyond the last band returns null and takes no draw', () => {
    let calls = 0;
    const counting = {
      classify: () => {
        calls += 1;
        return 0.5;
      },
    };
    expect(classifyByMatrix(matrix, 7000, counting, keys)).toBeNull();
    expect(calls).toBe(0);
    expect(classifyByMatrix(matrix, 700, counting, keys)).not.toBeNull();
    expect(calls).toBe(1);
  });

  it('draws through the policy classify key with the attempt keys', () => {
    const mc = monteCarloPolicy(4821, 2, DEFAULT_REQUIREMENT_THRESHOLDS);
    const u = mc.classify(keys.sensorId, keys.uasId, keys.tS);
    const d = classifyByMatrix(matrix, 2000, mc, keys)!;
    expect(d.u).toBe(u);
    expect(d.declaredHostile).toBe(u < 0.7);
  });
});

describe('matrixFor', () => {
  const base: SensorSpec = {
    sensorType: 'eo-ir',
    detectRangeM: 5000,
    classifyRangeM: 3000,
    sectorDeg: 360,
  };
  it('reads spec.classification, null when absent or null', () => {
    expect(matrixFor(base)).toBeNull();
    expect(matrixFor({ ...base, classification: null })).toBeNull();
    expect(matrixFor({ ...base, classification: matrix })).toBe(matrix);
  });
});
