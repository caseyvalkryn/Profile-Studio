import '../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { testVignette } from '../../engine/testVignette';
import type { Vignette } from '../../domain/types';
import { previewOf, useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { boardDerived } from '../build/board/derived';
import { STAGE_DEFINITION, keyPoints } from './stages';
import Timeline, { parseTime, runEnd, tickSteps } from './Timeline';

const GUT_L = 48;
/** jsdom lays nothing out: the strip takes its 800 px fallback, 740 px of axis after the gutter. */
const PLOT_W = 740;
const xAt = (f: number) => GUT_L + f * PLOT_W;

function withEvent(): Vignette {
  const v = testVignette();
  v.events = [
    {
      key: 'k-e1',
      id: 'e1',
      tS: 40,
      type: 'detect',
      label: 'First detection',
      threatKey: v.threats[0]!.key,
      sensorKey: null,
    },
  ];
  return v;
}

const open = (v: Vignette) =>
  act(() => {
    useUi.setState({ ...UI_DEFAULTS });
    useDocument.getState().open(v);
  });
const doc = () => useDocument.getState().doc!;
const axis = () => screen.getByRole('group', { name: 'Timeline' }).querySelector('.tl-axis')!;

beforeEach(() => open(testVignette()));

describe('timeline helpers', () => {
  it('parses a time as m:ss, seconds or t+m:ss', () => {
    expect(parseTime('2:55')).toBe(175);
    expect(parseTime('175')).toBe(175);
    expect(parseTime('t+1:05')).toBe(65);
    expect(parseTime('1:05.5')).toBe(65.5);
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('')).toBeNull();
  });

  it('picks at most eight labelled majors that fit', () => {
    expect(tickSteps(60, 740 / 60)).toEqual({ major: 10, minor: 2 });
    expect(tickSteps(600, 740 / 600)).toEqual({ major: 120, minor: 30 });
    expect(runEnd(12)).toBe(60);
    expect(runEnd(300)).toBe(300);
  });
});

describe('timeline strip', () => {
  it('draws one lane per threat with its coverage windows and its key points', () => {
    render(<Timeline mode="build" />);
    const v = doc();
    const d = boardDerived(v);
    const lanes = screen.getAllByTestId('tl-lane');
    expect(lanes).toHaveLength(v.threats.length);
    const id = v.threats[0]!.id;
    const lane = lanes[0]!;
    expect(within(lane).getByText(id)).toBeInTheDocument();
    const wins = Object.values(d.windows).reduce((n, by) => n + (by[id]?.length ?? 0), 0);
    expect(wins).toBeGreaterThan(0);
    expect(within(lane).getAllByTestId('tl-window')).toHaveLength(wins);
    const points = keyPoints(d, id);
    expect(points[0]!.stage).toBe('find');
    const ticks = within(lane).getAllByTestId('tl-stage');
    expect(ticks.map((t) => t.getAttribute('data-stage'))).toEqual(points.map((p) => p.stage));
    expect(ticks[0]!.querySelector('title')!.textContent).toContain(STAGE_DEFINITION.find);
    expect(within(lane).getByText('Find')).toBeInTheDocument();
  });

  it('the play bar: first, previous and next key point, last, rate, loop, play and pause', () => {
    render(<Timeline mode="build" />);
    const d = boardDerived(doc());
    fireEvent.click(screen.getByRole('button', { name: 'Next key point' }));
    expect(useUi.getState().timeOn).toBe(true);
    expect(useUi.getState().tS).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Previous key point' }));
    expect(useUi.getState().tS).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Time to end' }));
    expect(Math.abs(useUi.getState().tS - d.tmax)).toBeLessThan(0.06);
    fireEvent.click(screen.getByRole('button', { name: 'Time to start' }));
    expect(useUi.getState().tS).toBe(0);
    fireEvent.change(screen.getByRole('combobox', { name: 'Play rate' }), {
      target: { value: '8' },
    });
    expect(useUi.getState().rate).toBe(8);
    const loop = screen.getByRole('combobox', { name: 'Loop' });
    fireEvent.change(loop, { target: { value: 'all' } });
    expect(useUi.getState().loop).toEqual({ startS: 0, endS: d.tmax });
    expect(loop).toHaveValue('all');
    fireEvent.change(loop, { target: { value: 'off' } });
    expect(useUi.getState().loop).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(useUi.getState().playing).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(useUi.getState().playing).toBe(false);
  });

  it('Shift and a drag on the axis set the loop range; a double click clears it', () => {
    render(<Timeline mode="build" />);
    const end = runEnd(previewOf(doc()).tmaxS);
    const ax = axis();
    fireEvent.pointerDown(ax, { button: 0, shiftKey: true, clientX: xAt(0.1) });
    fireEvent.pointerMove(ax, { clientX: xAt(0.5) });
    fireEvent.pointerUp(ax, { clientX: xAt(0.5) });
    const loop = useUi.getState().loop!;
    expect(loop.startS).toBeCloseTo(end * 0.1, 0);
    expect(loop.endS).toBeCloseTo(end * 0.5, 0);
    fireEvent.doubleClick(ax);
    expect(useUi.getState().loop).toBeNull();
  });

  it('Ctrl and the wheel zoom the span about the pointer; the overview double click fits the run', () => {
    render(<Timeline mode="build" />);
    const end = runEnd(previewOf(doc()).tmaxS);
    expect(screen.queryByRole('slider', { name: 'Time zoom span' })).toBeNull();
    const plot = axis().parentElement!;
    fireEvent.wheel(plot, { ctrlKey: true, deltaY: -400, clientX: xAt(0.5) });
    const tv = useUi.getState().tview!;
    expect(tv.t1S - tv.t0S).toBeCloseTo(end * Math.exp(-1), 0);
    expect(tv.t0S).toBeLessThan(end / 2);
    expect(tv.t1S).toBeGreaterThan(end / 2);
    const ov = screen.getByRole('slider', { name: 'Time zoom span' });
    fireEvent.doubleClick(ov);
    expect(useUi.getState().tview).toBeNull();
  });

  it('a bead drag in Build moves the event in one undo step; in Brief a press only sets the time', () => {
    open(withEvent());
    const { unmount } = render(<Timeline mode="build" />);
    const end = runEnd(previewOf(doc()).tmaxS);
    let bead = screen.getByTestId('tl-bead');
    fireEvent.pointerDown(bead, { button: 0, clientX: 100 });
    fireEvent.pointerMove(bead, { clientX: xAt(0.5) });
    fireEvent.pointerUp(bead, { clientX: xAt(0.5) });
    expect(doc().events[0]!.tS).toBeCloseTo(end / 2, 0);
    expect(useDocument.getState().history).toEqual(['move event e1']);
    unmount();

    open(withEvent());
    render(<Timeline mode="brief" />);
    bead = screen.getByTestId('tl-bead');
    fireEvent.pointerDown(bead, { button: 0, clientX: 100 });
    fireEvent.pointerMove(bead, { clientX: xAt(0.5) });
    fireEvent.pointerUp(bead, { clientX: xAt(0.5) });
    expect(doc().events[0]!.tS).toBe(40);
    expect(useDocument.getState().history).toEqual([]);
    expect(useUi.getState()).toMatchObject({ timeOn: true, tS: 40, selectedKeys: ['k-e1'] });
  });

  it('a lane press selects the threat; the cursor hides while time is off', () => {
    render(<Timeline mode="build" />);
    const v = doc();
    const lane = screen.getAllByTestId('tl-lane')[0]!.querySelector('.tl-lane')!;
    expect(screen.getByTestId('tl-cursor')).toHaveAttribute('hidden');
    fireEvent.pointerDown(lane, { button: 0, clientX: 200 });
    fireEvent.pointerUp(lane, { clientX: 200 });
    expect(useUi.getState().selectedKeys).toEqual([v.threats[0]!.key]);
    expect(lane).toHaveClass('tl-sel');
    act(() => useUi.getState().setTimeOn(true));
    expect(screen.getByTestId('tl-cursor')).not.toHaveAttribute('hidden');
  });

  it('with no threat: the hint and an axis of at least a minute', () => {
    const v = testVignette();
    v.threats = [];
    open(v);
    render(<Timeline mode="build" />);
    expect(
      screen.getByText('Add a threat to see its coverage and key points.'),
    ).toBeInTheDocument();
    fireEvent.pointerDown(axis(), { button: 0, clientX: xAt(1) });
    expect(useUi.getState().tS).toBe(60);
  });
});
