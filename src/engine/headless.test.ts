// @vitest-environment node
// Acceptance 12.11: the engine package builds and runs headless in Node with no DOM.
import { describe, expect, it } from 'vitest';

describe('engine headless (acceptance 12.11)', () => {
  it('imports the engine entry and run.ts and runs replicates with no window or document', async () => {
    expect('window' in globalThis).toBe(false);
    expect('document' in globalThis).toBe(false);
    const engine = await import('./index');
    const { run } = await import('./run');
    const { testVignette } = await import('./testVignette');
    expect(Object.keys(engine).length).toBeGreaterThan(0);
    const v = testVignette();
    expect(v.threats.length).toBeGreaterThan(0);
    const result = run(v, 20, 7);
    expect(result.rows).toHaveLength(20 * v.threats.length);
    expect(run(v, 20, 7).rows).toEqual(result.rows);
  });
});
