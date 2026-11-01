import '../../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testVignette } from '../../../engine/testVignette';
import { previewOf, useDocument } from '../../../state/document';
import { useRuns, type RunEntry } from '../../../state/runs';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { fmtTime } from '../../shared/units';
import { GUTTER_W, LANE_H, PAD_R, laneY } from './layout';
import { STEPS } from './steps';
import Timeline from './Timeline';
import { advanceTime, usePlayback } from './usePlayback';

const W = 800;
const px = (t: number, tmax: number) => GUTTER_W + (t / tmax) * (W - GUTTER_W - PAD_R);
/** True when a mark from y to y + h sits inside lane `i` of row `row`. */
const inLane = (el: Element, row: number, i: number) => {
  const y = Number(el.getAttribute('y'));
  const h = Number(el.getAttribute('height'));
  return y >= laneY(row, i) && y + h <= laneY(row, i) + LANE_H;
};

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

  it('names the six F2T2EA lanes in the gutter of each row', () => {
    render(<Timeline width={W} />);
    const rows = screen.getAllByTestId('timeline-row');
    rows.forEach((r, row) => {
      const labels = within(r).getAllByTestId('timeline-lane-label');
      expect(labels.map((l) => l.textContent)).toEqual([
        'Find',
        'Fix',
        'Track',
        'Target',
        'Engage',
        'Assess',
      ]);
      labels.forEach((l, i) => {
        expect(Number(l.getAttribute('x'))).toBeLessThan(GUTTER_W);
        const y = Number(l.getAttribute('y'));
        expect(y).toBeGreaterThan(laneY(row, i));
        expect(y).toBeLessThanOrEqual(laneY(row, i) + LANE_H);
      });
    });
  });

  it('draws each stage window and mark in the lane of its step', () => {
    const p = previewOf(useDocument.getState().doc!);
    render(<Timeline width={W} />);
    const rows = screen.getAllByTestId('timeline-row');
    const th = p.threats['k-T-01']!;
    const windows = within(rows[0]!).getAllByTestId('timeline-window');
    expect(windows.length).toBeGreaterThan(0);
    for (const el of [...windows, ...within(rows[0]!).getAllByTestId('timeline-mark')]) {
      const i = STEPS.findIndex((s) => s.key === el.getAttribute('data-step'));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(inLane(el, 0, i)).toBe(true);
    }
    const w = windows[0]!;
    const step = w.getAttribute('data-step') as keyof typeof th.stages;
    expect(Number(w.getAttribute('x'))).toBeCloseTo(px(th.stages[step]!.t, p.tmaxS), 6);
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

  it('keeps a copy of the time axis in a sticky strip above the rows (review 7.R F-08)', () => {
    const p = previewOf(useDocument.getState().doc!);
    render(<Timeline width={W} />);
    const sticky = screen.getByTestId('timeline-axis-sticky');
    expect(sticky).toHaveClass('sticky', 'top-0');
    expect(sticky.getAttribute('height')).toBe('20');
    const labels = (el: Element) => [...el.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels(sticky)).toEqual(labels(screen.getByTestId('timeline-axis')));
    fireEvent.pointerDown(sticky, { clientX: px(p.tmaxS / 4, p.tmaxS), button: 0, pointerId: 1 });
    expect(useUi.getState().tS).toBeCloseTo(p.tmaxS / 4, 6);
  });

  it('overlays the run mean as a second mark', () => {
    const entry: RunEntry = {
      key: 'r1',
      n: 2,
      seed: 1,
      status: 'done',
      progress: { done: 2, total: 2 },
      error: null,
      detail: null,
      predictions: [],
      docId: 'doc',
      docUpdated: '2026-01-01T00:00:00.000Z',
      note: null,
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
    expect(inLane(runMarks[0]!, 0, 0)).toBe(true);
    expect(runMarks[0]!.getAttribute('aria-label')).toBe('Find run mean t+0:15');
  });

  it('the right-click menu lists Set time here, Loop from here, Clear loop and Add event here', () => {
    const p = previewOf(useDocument.getState().doc!);
    render(<Timeline width={W} />);
    const target = screen.getByTestId('timeline-svg').parentElement!;
    fireEvent.contextMenu(target, { clientX: px(30, p.tmaxS) });
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Set time here',
      'Loop from here',
      'Clear loop',
      // Legacy timeline menu row, registered with menuCommands in lane 9.2.6.
      'Add event here',
    ]);
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
