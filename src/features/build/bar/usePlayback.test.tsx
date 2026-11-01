import '../../../ui/test-utils';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testVignette } from '../../../engine/testVignette';
import { previewOf, useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { fmtTime } from '../../shared/units';
import { advanceTime, usePlayback } from './usePlayback';

beforeEach(() => {
  useDocument.getState().open(testVignette());
  useUi.setState({ ...UI_DEFAULTS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePlayback', () => {
  function Clock() {
    usePlayback();
    return null;
  }

  it('advances time by dt times rate and stops at tmaxS', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const tmax = previewOf(useDocument.getState().doc!).tmaxS;
    render(<Clock />);
    render(<Clock />); // a second user shares the one loop
    act(() => useUi.setState({ rate: 2, playing: true }));
    act(() => vi.advanceTimersByTime(1000));
    expect(useUi.getState().tS).toBeGreaterThan(1.8);
    expect(useUi.getState().tS).toBeLessThan(2.1);
    act(() => vi.advanceTimersByTime(tmax * 1000));
    expect(useUi.getState().tS).toBe(tmax);
    expect(useUi.getState().playing).toBe(false);
  });

  it('wraps inside the loop range', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<Clock />);
    act(() => useUi.setState({ tS: 10, loop: { startS: 10, endS: 15 }, playing: true }));
    act(() => vi.advanceTimersByTime(7000));
    const t = useUi.getState().tS;
    expect(t).toBeGreaterThanOrEqual(10);
    expect(t).toBeLessThan(15);
    expect(useUi.getState().playing).toBe(true);
  });

  it('advanceTime wraps, clamps and stops', () => {
    expect(advanceTime(14, 2, { startS: 10, endS: 15 }, 100)).toEqual({ tS: 11, stop: false });
    expect(advanceTime(99, 2, null, 100)).toEqual({ tS: 100, stop: true });
    expect(advanceTime(5, 1, null, 100)).toEqual({ tS: 6, stop: false });
  });

  it('formats time as t+m:ss', () => {
    expect(fmtTime(0)).toBe('t+0:00');
    expect(fmtTime(75.4)).toBe('t+1:15');
  });
});
