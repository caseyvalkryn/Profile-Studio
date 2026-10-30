import '../../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testVignette } from '../../../engine/testVignette';
import { previewOf, useDocument } from '../../../state/document';
import { useRuns, type RunEntry } from '../../../state/runs';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { fmtTime } from './format';
import Timeline from './Timeline';
import { advanceTime, usePlayback } from './usePlayback';

const W = 800;
// Gutter 64 px, right pad 12 px: the axis spans 724 px.
const px = (t: number, tmax: number) => 64 + (t / tmax) * (W - 64 - 12);

beforeEach(() => {
  useDocument.getState().open(testVignette());
  useUi.setState({ ...UI_DEFAULTS });
  useRuns.setState({ results: {}, order: [], activeKey: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Timeline', () => {
  it('renders one row per threat with six F2T2EA lanes', () => {
    render(<Timeline width={W} />);
    const rows = screen.getAllByTestId('timeline-row');
    expect(rows.map((r) => r.getAttribute('data-threat'))).toEqual(['T-01', 'T-02']);
    for (const r of rows) {
      const lanes = within(r).getAllByTestId('timeline-lane');
      expect(lanes.map((l) => l.getAttribute('data-step'))).toEqual([
        'find',
        'fix',
        'track',
        'target',
        'engage',
        'assess',
      ]);
    }
  });

  it('places marks at the preview step times', () => {
    const p = previewOf(useDocument.getState().doc!);
    render(<Timeline width={W} />);
    const row = screen.getAllByTestId('timeline-row')[0]!;
    const marks = within(row).getAllByTestId('timeline-mark');
    const th = p.threats['k-T-01']!;
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) {
      const step = m.getAttribute('data-step') as keyof typeof th.stages;
      const st = th.stages[step]!;
      expect(Number(m.getAttribute('x'))).toBeCloseTo(px(st.t, p.tmaxS) - 1, 6);
    }
    expect(within(row).getByTestId('timeline-da')).toBeInTheDocument();
  });

  it('a click on the axis sets the time', () => {
    const p = previewOf(useDocument.getState().doc!);
    render(<Timeline width={W} />);
    fireEvent.pointerDown(screen.getByTestId('timeline-svg'), {
      clientX: px(p.tmaxS / 2, p.tmaxS),
      button: 0,
      pointerId: 1,
    });
    expect(useUi.getState().tS).toBeCloseTo(p.tmaxS / 2, 6);
  });

  it('overlays the run mean as a second mark', () => {
    const entry: RunEntry = {
      key: 'r1',
      n: 2,
      seed: 1,
      status: 'done',
      progress: { done: 2, total: 2 },
      error: null,
      result: {
        rows: [],
        scores: [],
        trace: [10, 20].map((t, run) => ({
          run,
          threat: 'T-01',
          times: {
            detect: t,
            track: null,
            identify: null,
            target: null,
            engage: null,
            effect: null,
            arrival: null,
          },
          positions: {},
          status: 'ok',
        })),
      } as unknown as RunEntry['result'],
    };
    useRuns.setState({ results: { r1: entry }, order: ['r1'], activeKey: 'r1' });
    render(<Timeline width={W} />);
    const runMarks = screen
      .getAllByTestId('timeline-mark')
      .filter((m) => m.getAttribute('data-kind') === 'run');
    expect(runMarks).toHaveLength(1);
    expect(runMarks[0]!.getAttribute('data-step')).toBe('find');
    expect(runMarks[0]!.getAttribute('aria-label')).toBe('Find run mean t+0:15');
  });

  it('the right-click menu lists Set time here and Loop from here', () => {
    const p = previewOf(useDocument.getState().doc!);
    render(<Timeline width={W} />);
    const target = screen.getByTestId('timeline-svg').parentElement!;
    fireEvent.contextMenu(target, { clientX: px(30, p.tmaxS) });
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Set time here', 'Loop from here']);
    fireEvent.click(screen.getByRole('menuitem', { name: /Loop from here/ }));
    expect(useUi.getState().loop).toEqual({ startS: expect.closeTo(30, 6), endS: p.tmaxS });
    expect(screen.getByTestId('timeline-loop')).toBeInTheDocument();
  });
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
