import { testSensor, testThreat, testVignette } from '../../engine/testVignette';
import { boardDerived } from '../build/board/derived';
import { actionSpan, actionStart, runEnd, wantsFit } from './fit';

describe('the action span', () => {
  it('is null for the test vignette, whose first window opens at once', () => {
    const d = boardDerived(testVignette());
    expect(actionStart(d)).toBeLessThan(1);
    expect(actionSpan(d)).toBeNull();
    expect(wantsFit(d)).toBe(false);
  });

  it('runs from the first window less a lead of 10 percent or 30 s to the run end', () => {
    const v = testVignette();
    v.threats = [testThreat('T-01', 'g1-quad-isr', 30000)];
    v.sensors = [testSensor('S-01', 'radar', 5000)];
    const d = boardDerived(v);
    const start = actionStart(d);
    const end = runEnd(d.tmax);
    expect(start).toBeGreaterThan(end / 2);
    const span = actionSpan(d)!;
    const lead = Math.max(30, 0.1 * (end - start));
    expect(span.t0S).toBeCloseTo(start - lead, 0);
    expect(span.t1S).toBe(end);
    expect(wantsFit(d)).toBe(true);
    // a window early in a short run: the lead is the 30 s floor
    const short = testVignette();
    short.threats = [testThreat('T-01', 'g1-quad-isr', 7000)];
    const ds = boardDerived(short);
    const ss = actionSpan(ds);
    if (ss) expect(actionStart(ds) - ss.t0S).toBeGreaterThanOrEqual(30);
  });

  it('falls back to the key points (the DA entry), then to zero, with no coverage window', () => {
    const v = testVignette();
    v.sensors = [];
    v.effectors = [];
    const d = boardDerived(v);
    const da = Math.min(...Object.values(d.daEntry).map((t) => t ?? Infinity));
    expect(actionStart(d)).toBe(da);
    v.areas = [];
    const bare = boardDerived({ ...v });
    expect(actionStart(bare)).toBe(0);
    expect(actionSpan(bare)).toBeNull();
  });
});
