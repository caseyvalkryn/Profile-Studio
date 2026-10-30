// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { basisJson } from './basisJson';

describe('basisJson', () => {
  it('treats reordered object keys as the same value and keeps array order', () => {
    const band = { maxRangeM: 1000, pCorrect: 0.8, pFalseHostile: 0.1, timeToDeclareS: 1 };
    const left = { sensorType: 'radar', bands: [band] };
    const right = { bands: [band], sensorType: 'radar' };
    expect(JSON.stringify(left)).not.toBe(JSON.stringify(right));
    expect(basisJson(left)).toBe(basisJson(right));
    expect(basisJson({ xs: [1, { b: 1, a: 2 }] })).toBe(basisJson({ xs: [1, { a: 2, b: 1 }] }));
    expect(basisJson([0, 45])).not.toBe(basisJson([45, 0]));
    expect(basisJson({ xs: [{ a: 1 }, { a: 2 }] })).not.toBe(
      basisJson({ xs: [{ a: 2 }, { a: 1 }] }),
    );
  });
});
