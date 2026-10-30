// @vitest-environment node
// Regression anchor for lane 2.3b: runTrial here must reproduce rangeboard's result exactly.
// Input and result were produced by rangeboard's own runTrial (commit 87a6579) on the
// trial.test.ts laydown with seed 4821 and run id 'trial-fixed-id'.
import { describe, expect, it } from 'vitest';
import type { Scenario, TrialManifest } from '../index';
import { runTrial } from '../index';
import input from './__fixtures__/trial-4821.input.json';
import expected from './__fixtures__/trial-4821.result.json';

/** Lossless JSON encoding: NaN, +-Infinity, -0, undefined, Map and Set survive the compare. */
function encodeValue(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, function (this: unknown, key: string, v: unknown) {
      const raw = key === '' ? v : (this as Record<string, unknown>)[key];
      if (raw === undefined) return { $u: 1 };
      if (typeof raw === 'number') {
        if (Number.isNaN(raw)) return { $n: 'NaN' };
        if (raw === Infinity) return { $n: 'Inf' };
        if (raw === -Infinity) return { $n: '-Inf' };
        if (Object.is(raw, -0)) return { $n: '-0' };
        return raw;
      }
      if (raw instanceof Map) return { $map: [...raw.entries()] };
      if (raw instanceof Set) return { $set: [...raw.values()] };
      return v;
    }),
  );
}

describe('engine parity with rangeboard', () => {
  it('runTrial on the seed-4821 laydown deep-equals the frozen rangeboard result', () => {
    const scenario = structuredClone(input.scenario) as unknown as Scenario;
    const manifest = structuredClone(input.manifest) as unknown as TrialManifest;
    const result = runTrial(scenario, manifest);
    expect(result.report.events.length).toBeGreaterThan(0);
    expect(encodeValue(result)).toEqual(expected);
  });
});
