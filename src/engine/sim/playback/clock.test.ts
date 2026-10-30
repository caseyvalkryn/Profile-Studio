// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSweepClock, DT, stepCount, stepIndex } from './clock';

it('DT is the 0.5 s engine step and stepIndex rounds a sample time to its step count', () => {
  expect(DT).toBe(0.5);
  expect(stepIndex(0.2)).toBe(0);
  expect(stepIndex(0.74)).toBe(1);
  // Two samples DT apart never share a step: 1.0 s is step 2, 1.5 s is step 3.
  expect(stepIndex(1.0)).toBe(2);
  expect(stepIndex(1.5)).toBe(3);
  // stepCount at DT is stepIndex; at a finer step the count grows.
  expect(stepCount(1.5, DT)).toBe(stepIndex(1.5));
  expect(stepCount(1.5, 0.1)).toBe(15);
});

describe('SweepClock', () => {
  /** Today's loop: the sample times of `for (t = from; t <= end; t += DT)`. */
  const legacy = (fromS: number, endS: number): number[] => {
    const out: number[] = [];
    for (let t = fromS; t <= endS; t += DT) out.push(t);
    return out;
  };

  it('with no request reproduces the fixed-step sample times exactly', () => {
    for (const fromS of [0, 3.3, 12.7]) {
      const clock = createSweepClock(DT, fromS);
      const times = clock.samples(120);
      const expected = legacy(fromS, 120);
      expect(times.length).toBe(expected.length);
      for (let i = 0; i < times.length; i += 1) expect(times[i]).toBe(expected[i]);
    }
    // Off-grid starts accumulate in the same order as the old loop, bit for bit.
    const clock = createSweepClock(DT, 3.3);
    let t = 3.3;
    for (let i = 0; i < 50; i += 1) {
      const next = clock.next(t);
      expect(next).toBe(t + DT);
      t = next;
    }
  });

  it('honours a fine step only inside the requested window', () => {
    const clock = createSweepClock(DT, 0);
    clock.requestFineStep('gun-1', 1.2, 1.7, 0.1);
    const times = clock.samples(3);
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    // Base grid to 1.0, the window opens at 1.2, five 0.1 s steps land on 1.7,
    // then the next base grid time (2.0) and the base step onward.
    expect(times.map(round)).toEqual([0, 0.5, 1.0, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.0, 2.5, 3.0]);
    expect(clock.stepAt(1.0)).toBe(DT);
    expect(clock.stepAt(1.3)).toBe(0.1);
    expect(clock.stepAt(1.7)).toBe(DT);
    expect(clock.requests).toEqual([{ effectorId: 'gun-1', fromS: 1.2, toS: 1.7, stepS: 0.1 }]);
  });

  it('takes the finest step where windows overlap and clamps a coarse request to the base step', () => {
    const clock = createSweepClock(DT, 0);
    clock.requestFineStep('de-1', 0.5, 1.5, 0.25);
    clock.requestFineStep('gun-1', 1.0, 1.2, 0.1);
    clock.requestFineStep('ignored', 2.0, 2.5, 2);
    clock.requestFineStep('empty', 3.0, 3.0, 0.1);
    clock.requestFineStep('bad', 3.0, 3.5, 0);
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    expect(clock.samples(3).map(round)).toEqual([
      0, 0.5, 0.75, 1.0, 1.1, 1.2, 1.45, 1.5, 2.0, 2.5, 3.0,
    ]);
    expect(clock.requests.length).toBe(3);
    expect(clock.requests[2]!.stepS).toBe(DT);
  });

  it('applies a request made while the sweep runs at the next step', () => {
    const clock = createSweepClock(DT, 0);
    const times: number[] = [];
    for (let t = 0; t <= 2; t = clock.next(t)) {
      times.push(t);
      if (t === 1.0) clock.requestFineStep('gun-1', 1.0, 1.3, 0.1);
    }
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    expect(times.map(round)).toEqual([0, 0.5, 1.0, 1.1, 1.2, 1.3, 1.5, 2.0]);
  });

  it('rejects a non-positive base step', () => {
    expect(() => createSweepClock(0)).toThrow();
  });
});
