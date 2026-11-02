import '../../ui/test-utils';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { testVignette } from '../../engine/testVignette';
import type { Vignette } from '../../domain/types';
import { previewOf, useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { testSensor, testThreat } from '../../engine/testVignette';
import { boardDerived } from '../build/board/derived';
import { menuItemsFor } from '../commands/adapter';
import { fmtTime } from '../shared/units';
import { actionSpan, wantsFit } from './fit';
import { STAGE_DEFINITION, keyPoints } from './stages';
import Timeline, { GUT_L, buildLanes, parseTime, runEnd, tickSteps } from './Timeline';
import { boardScene } from '../build/board/derived';
import { currentContext, get } from '../../commands/registry';
import { testCard } from '../brief/testDeck';
import { sliceFromLoop, timelineCommands } from './commands';
import { CARDS_H, DA_H, GUT_WIDE, cardMarks, gutterFor, pointStates } from './layout';

/** A long ingress: one threat from 30 km, seen only in the last part of its run. */
function ingress(): Vignette {
  const v = testVignette();
  v.threats = [testThreat('T-01', 'g1-quad-isr', 30000)];
  v.sensors = [testSensor('S-01', 'radar', 5000)];
  return v;
}

/** jsdom lays nothing out: the strip takes its 800 px fallback, 716 px of axis after the gutter. */
const PLOT_W = 800 - GUT_L - 12;
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
    // the shorter labels (no prefix) let a 300 s major fit at 41 px
    expect(tickSteps(2400, 330 / 2400)).toEqual({ major: 300, minor: 60 });
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
    // glyphs only in the lane; the names live in the legend (lane 12.4)
    expect(within(lane).queryByText('Find')).toBeNull();
    expect(lane.querySelectorAll('[data-testid="tl-stage"] text')).toHaveLength(0);
  });

  it('a run over three times its action span opens on the span, until a zoom by hand', () => {
    const v = ingress();
    open(v);
    const d = boardDerived(v);
    const span = actionSpan(d)!;
    expect(wantsFit(d)).toBe(true);
    const { unmount } = render(<Timeline mode="build" />);
    expect(useUi.getState().tview).toEqual(span);
    expect(within(axis() as HTMLElement).queryByText('0:00')).toBeNull();
    // a hand zoom holds through a document change
    act(() => useUi.getState().setTview({ t0S: 0, t1S: 100 }));
    act(() => useDocument.getState().edit('move', (dd) => void (dd.threats[0]!.path[0]!.x += 500)));
    expect(useUi.getState().tview).toEqual({ t0S: 0, t1S: 100 });
    unmount();
    // the test vignette's action starts at once: no fit
    open(testVignette());
    render(<Timeline mode="build" />);
    expect(useUi.getState().tview).toBeNull();
  });

  it('the context menu fits the run or the action span', () => {
    const items = () =>
      menuItemsFor('timeline', { pointer: { x: 0, y: 0, tS: 0 }, onArg: () => {} });
    const labels = items().map((i) => i.label);
    const at = labels.indexOf('Clear loop');
    expect(labels.slice(at, at + 3)).toEqual(['Clear loop', 'Fit run', 'Fit action']);
    expect(items().find((i) => i.label === 'Fit action')!.disabledReason).toBe(
      'No coverage window yet',
    );
    const v = ingress();
    open(v);
    act(() => items().find((i) => i.label === 'Fit action')!.onSelect!());
    expect(useUi.getState().tview).toEqual(actionSpan(boardDerived(v)));
    act(() => items().find((i) => i.label === 'Fit run')!.onSelect!());
    expect(useUi.getState().tview).toBeNull();
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
    // the loop: two pressed toggles, the whole run and the range; a second press turns it off
    const all = screen.getByRole('button', { name: 'Loop all' });
    fireEvent.click(all);
    expect(useUi.getState().loop).toEqual({ startS: 0, endS: d.tmax });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(all);
    expect(useUi.getState().loop).toBeNull();
    act(() => useUi.getState().setTview({ t0S: 10, t1S: 50 }));
    fireEvent.click(screen.getByRole('button', { name: 'Loop range' }));
    expect(useUi.getState().loop).toEqual({ startS: 10, endS: 50 });
    expect(screen.getByRole('button', { name: 'Loop range' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    act(() => useUi.getState().setLoop(null));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(useUi.getState().playing).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(useUi.getState().playing).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Time off' }));
    expect(useUi.getState().timeOn).toBe(false);
    expect(screen.getByRole('button', { name: 'Time off' })).toBeDisabled();
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
    // the lane area takes the hint's height, not the grip's
    const lanesEl = screen.getByRole('group', { name: 'Timeline' }).querySelector('.tl-lanes')!;
    expect((lanesEl as HTMLElement).style.height).toBe('');
    fireEvent.pointerDown(axis(), { button: 0, clientX: xAt(1) });
    expect(useUi.getState().tS).toBe(60);
  });

  it('the grip sets the lane area height: a drag, the arrow keys, a double click to reset', () => {
    render(<Timeline mode="build" />);
    const grip = screen.getByRole('separator', { name: 'Resize timeline' });
    expect(grip).toHaveAttribute('aria-valuenow', '200');
    fireEvent.pointerDown(grip, { button: 0, clientY: 500 });
    fireEvent.pointerMove(grip, { clientY: 300 });
    fireEvent.pointerUp(grip, { clientY: 300 });
    expect(useUi.getState().tlH).toBe(400);
    expect(grip).toHaveAttribute('aria-valuenow', '400');
    fireEvent.keyDown(grip, { key: 'ArrowUp' });
    expect(useUi.getState().tlH).toBe(416);
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    expect(useUi.getState().tlH).toBe(384);
    fireEvent.doubleClick(grip);
    expect(useUi.getState().tlH).toBe(UI_DEFAULTS.tlH);
    act(() => useUi.getState().setTlH(2000));
    expect(useUi.getState().tlH).toBe(720);
    act(() => useUi.getState().setTlH(10));
    expect(useUi.getState().tlH).toBe(96);
  });

  it('a lane takes its content height; the rows grow to 24 px with room, the area scrolls past tlH', () => {
    const v = doc();
    const scene = boardScene(v);
    const d = boardDerived(v);
    const small = buildLanes(scene, d, 0);
    expect(small.lanes.every((L) => L.layout === 'band')).toBe(true);
    // one threat at 400 px: 24 px rows, the area at the content height
    const one = testVignette();
    one.threats = [one.threats[0]!];
    const lane1 = buildLanes(boardScene(one), boardDerived(one), 400);
    expect(lane1.lanes[0]!.layout).toBe('rows');
    expect(lane1.lanes[0]!.pitch).toBe(24);
    expect(lane1.height).toBeLessThan(400);
    expect(lane1.lanes[0]!.h).toBe(2 + 14 + 2 + 14 + 4 + 3 * 24);
    // eight threats at 400 px: the band, the lanes past the cap
    const eight = testVignette();
    eight.threats = Array.from({ length: 8 }, (_, i) => ({
      ...eight.threats[0]!,
      key: `k-T-${i}`,
      id: `T-${i}`,
      path: eight.threats[0]!.path.map((p) => ({ ...p, key: `${p.key}-${i}` })),
    }));
    const lane8 = buildLanes(boardScene(eight), boardDerived(eight), 400);
    expect(lane8.lanes.every((L) => L.layout === 'band')).toBe(true);
    expect(lane8.height).toBeGreaterThan(400);

    render(<Timeline mode="build" />);
    expect(screen.getAllByTestId('tl-row').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'Coverage and key points by threat' })).toHaveAttribute(
      'height',
      String(buildLanes(scene, d, 200).height),
    );
    const lanesEl = screen.getByRole('group', { name: 'Timeline' }).querySelector('.tl-lanes')!;
    expect((lanesEl as HTMLElement).style.maxHeight).toBe('200px');
    const sys = scene.scene.systems.find((s) => d.windows[s.id]?.[v.threats[0]!.id]?.length)!;
    expect(screen.getAllByText(sys.id).length).toBeGreaterThan(0);
    // the row's pill: 10 by 6 in the row's fill, before the id in the text ink
    const pill = screen.getAllByTestId('tl-row')[0]!.querySelector('rect.tl-bar')!;
    expect(pill).toHaveAttribute('width', '10');
    expect(pill).toHaveAttribute('height', '6');
    expect(pill).toHaveAttribute('rx', '1.5');
    act(() => useUi.getState().setTlH(96));
    expect(screen.queryAllByTestId('tl-row')).toHaveLength(0);
  });

  it('the DA row, the engage margin bracket and the split letter', () => {
    render(<Timeline mode="build" />);
    const v = doc();
    const d = boardDerived(v);
    expect(screen.getAllByTestId('tl-da-bar')).toHaveLength(2);
    const margin = screen.getAllByTestId('tl-margin')[0]!;
    const ws = d.window[v.threats[0]!.id]!;
    expect(margin.querySelector('title')!.textContent).toBe(
      `Latest engage ${fmtTime(ws.latest!)}, margin ${Math.round(ws.margin!)} s`,
    );
    expect(margin.textContent).toContain(`margin ${Math.round(ws.margin!)} s`);
    expect(screen.queryAllByTestId('tl-split')).toHaveLength(d.splits.length);
  });

  it('the stage glyphs, the legend and the cursor readout', () => {
    render(<Timeline mode="build" />);
    const stages = screen.getAllByTestId('tl-stage');
    const find = stages.find((s) => s.getAttribute('data-stage') === 'find')!;
    expect(find.querySelector('circle.tl-gl-open')).not.toBeNull();
    const da = stages.find((s) => s.getAttribute('data-stage') === 'da');
    if (da) expect(da.querySelector('rect.tl-gl-da')).not.toBeNull();
    const legend = screen.getByTestId('tl-legend');
    // each entry: a swatch svg, then its name
    expect(
      Array.from(legend.querySelectorAll('span')).map((s) => s.lastChild!.textContent),
    ).toEqual([
      'Find',
      'Fix',
      'Track',
      'Target',
      'Engage',
      'Assess',
      'DA',
      'Sensor',
      'Effector',
      'EW',
      'Event',
    ]);
    // Find and Fix sit 3 s apart: within 10 px, so Fix stacks 10 px lower on its hairline
    const fix = stages.find((s) => s.getAttribute('data-stage') === 'fix')!;
    expect(find).toHaveAttribute('data-level', '0');
    expect(fix).toHaveAttribute('data-level', '1');
    // the axis labels carry no prefix; the cursor chip and the clock keep it
    const labs = Array.from(axis().querySelectorAll('.tl-tlab')).map((t) => t.textContent);
    expect(labs).toContain('0:00');
    expect(labs).toContain('2:00');
    expect(labs.some((l) => l!.startsWith('t+'))).toBe(false);
    act(() => {
      useUi.getState().setTimeOn(true);
      useUi.getState().setTime(75);
    });
    expect(screen.getByTestId('tl-cursor-time')).toHaveTextContent('t+1:15');
    expect(screen.getByTestId('tl-cursor-time')).not.toHaveClass('tl-cursor-time-l');
    // near the right edge the chip flips to the cursor's left
    act(() => useUi.getState().setTime(runEnd(previewOf(doc()).tmaxS)));
    expect(screen.getByTestId('tl-cursor-time')).toHaveClass('tl-cursor-time-l');
  });

  it('an event draws its label beside the bead when there is room', () => {
    open(withEvent());
    render(<Timeline mode="build" />);
    expect(within(screen.getByTestId('tl-bead')).getByText('First detection')).toBeInTheDocument();
  });
});

/** A press: down and up at one point. */
const press = (el: Element) => {
  fireEvent.pointerDown(el, { button: 0, clientX: 100 });
  fireEvent.pointerUp(el, { clientX: 100 });
};

/** The test vignette with three cards: no time, a frame at 0:30 and a slice from 0:10 to 0:40. */
function withCards(): Vignette {
  const v = testVignette();
  v.cards = [
    testCard(),
    testCard({ key: 'k-c2', id: 'c2', name: 'Frame', tS: 30 }),
    testCard({
      key: 'k-c3',
      id: 'c3',
      name: 'Slice',
      tS: 10,
      clip: { t0S: 10, t1S: 40, rate: 2, beatsS: [] },
    }),
  ];
  return v;
}

describe('the strip as the plan clock (lane 13.1)', () => {
  it('buildLanes puts the Cards row under the DA row and the lanes under it', () => {
    const v = withCards();
    const scene = boardScene(v);
    const d = boardDerived(v);
    const a = buildLanes(scene, d, 200);
    const b = buildLanes(scene, d, 200, true);
    expect(a.cardsTop).toBeNull();
    expect(b.cardsTop).toBe(2 + (b.daRow ? DA_H + 1 : 0));
    expect(b.lanes[0]!.top).toBe(a.lanes[0]!.top + CARDS_H + 1);
    // a card without a time draws nothing; the numbers are the deck places
    expect(cardMarks(v.cards).map((m) => [m.n, m.t])).toEqual([
      [2, 30],
      [3, 10],
    ]);
  });

  it('the Cards row: a marker per timed card, the slice band, the title', () => {
    open(withCards());
    render(<Timeline mode="build" />);
    const cards = screen.getAllByTestId('tl-card');
    expect(cards.map((c) => c.textContent)).toEqual([
      'Card 2 · Frame · t+0:302',
      'Card 3 · Slice · t+0:10 to t+0:403',
    ]);
    expect(screen.getAllByTestId('tl-card-slice')).toHaveLength(1);
    expect(screen.getByTestId('tl-cards-row')).toHaveTextContent('Cards');
    // in Build no card is current until one is keyed
    expect(document.querySelector('.tl-card-cur')).toBeNull();
  });

  it('a Cards row press in Build sets the time and the slice as the loop', () => {
    open(withCards());
    render(<Timeline mode="build" />);
    const [frame, slice] = screen.getAllByTestId('tl-card');
    press(frame!);
    expect(useUi.getState()).toMatchObject({ tS: 30, timeOn: true, loop: null, cardKey: null });
    press(slice!);
    expect(useUi.getState()).toMatchObject({ tS: 10, loop: { startS: 10, endS: 40 } });
  });

  it('a Cards row press in Brief opens the card; the current card draws in the accent', () => {
    open(withCards());
    render(<Timeline mode="brief" />);
    const frame = screen.getAllByTestId('tl-card')[0]!;
    expect(frame).not.toHaveClass('tl-card-cur');
    press(frame);
    expect(useUi.getState().cardKey).toBe('k-c2');
    expect(useUi.getState().timeOn).toBe(false);
    expect(screen.getAllByTestId('tl-card')[0]).toHaveClass('tl-card-cur');
  });

  it('a row press selects its system; the board selection and hover light its rows', () => {
    render(<Timeline mode="build" />);
    const row = screen.getAllByTestId('tl-row')[0]!;
    const key = row.getAttribute('data-select-key')!;
    expect(row).not.toHaveClass('tl-lit');
    press(row.querySelector('.tl-hit')!);
    expect(useUi.getState().selectedKeys).toEqual([key]);
    expect(row).toHaveClass('tl-lit');
    // a window of that system lights too; a hover on another row sets the shared hover
    const lit = screen.getAllByTestId('tl-window').filter((w) => w.classList.contains('tl-lit'));
    expect(lit.length).toBeGreaterThan(0);
    const other = screen
      .getAllByTestId('tl-row')
      .find((r) => r.getAttribute('data-select-key') !== key)!;
    fireEvent.pointerMove(other, { clientX: 20 });
    expect(useUi.getState().hoverKey).toBe(other.getAttribute('data-select-key'));
    expect(other).toHaveClass('tl-lit');
    // a selection made on the board or the inspector lights the rows the same way
    act(() => useUi.getState().setSelection([other.getAttribute('data-select-key')!]));
    expect(row).not.toHaveClass('tl-lit');
    // in Brief the row press selects too
    act(() => useUi.getState().setSelection([]));
    cleanupStrip();
    render(<Timeline mode="brief" />);
    press(screen.getAllByTestId('tl-row')[0]!.querySelector('.tl-hit')!);
    expect(useUi.getState().selectedKeys).toEqual([key]);
  });

  it('a glyph press sets the time and selects the system that gives the step', () => {
    render(<Timeline mode="brief" />);
    const v = doc();
    const d = boardDerived(v);
    const id = v.threats[0]!.id;
    const pts = keyPoints(d, id);
    const lane = screen.getAllByTestId('tl-lane')[0]!;
    const find = within(lane)
      .getAllByTestId('tl-stage')
      .find((g) => g.getAttribute('data-stage') === 'find')!;
    press(find);
    const sys = boardScene(v).scene.systems.find((s) => s.id === pts[0]!.system)!;
    expect(useUi.getState()).toMatchObject({
      tS: Math.round(pts[0]!.t * 10) / 10,
      timeOn: true,
      selectedKeys: [sys.key],
    });
    // the DA glyph selects the threat
    const da = within(lane)
      .getAllByTestId('tl-stage')
      .find((g) => g.getAttribute('data-stage') === 'da');
    if (da) {
      press(da);
      expect(useUi.getState().selectedKeys).toEqual([v.threats[0]!.key]);
    }
  });

  it('the glyph state classes at the cursor: reached, current with a halo, future', () => {
    expect(pointStates([{ t: 1 }, { t: 2 }, { t: 3 }], 2, true)).toEqual([
      'tl-reached',
      'tl-current',
      'tl-future',
    ]);
    expect(pointStates([{ t: 1 }, { t: 2 }], 2, false)).toEqual([null, null]);
    render(<Timeline mode="build" />);
    const lane = screen.getAllByTestId('tl-lane')[0]!;
    const glyphs = () => within(lane).getAllByTestId('tl-stage');
    // time off: every glyph draws as before
    const states = (g: Element) => /tl-(reached|current|future)/.test(g.getAttribute('class')!);
    expect(glyphs().some(states)).toBe(false);
    const pts = keyPoints(boardDerived(doc()), doc().threats[0]!.id);
    const at = pts[2]!;
    act(() => {
      useUi.getState().setTimeOn(true);
      useUi.getState().setTime(at.t);
    });
    const g = glyphs();
    expect(g[0]).toHaveClass('tl-reached');
    const cur = g.find((x) => x.getAttribute('data-stage') === at.stage)!;
    expect(cur).toHaveClass('tl-current');
    expect(cur.querySelector('.tl-halo')).not.toBeNull();
    expect(document.querySelectorAll('.tl-halo').length).toBeGreaterThanOrEqual(1);
    expect(g[g.length - 1]).toHaveClass('tl-future');
  });

  it('the step word after a short threat id widens the gutter; the chip names the step', () => {
    // the test vignette's four-character ids leave no room: the gutter stays at 56 px
    expect(gutterFor(buildLanes(boardScene(doc()), boardDerived(doc())).lanes)).toBe(GUT_L);
    const v = testVignette();
    v.threats[0]!.id = 'T1';
    v.threats[1]!.id = 'T2';
    open(v);
    render(<Timeline mode="build" />);
    expect(gutterFor(buildLanes(boardScene(v), boardDerived(v)).lanes)).toBe(GUT_WIDE);
    expect(screen.queryAllByTestId('tl-step')).toHaveLength(0);
    const pts = keyPoints(boardDerived(v), 'T1');
    act(() => {
      useUi.getState().setTimeOn(true);
      useUi.getState().setTime(pts[2]!.t);
    });
    const lane = screen.getAllByTestId('tl-lane')[0]!;
    expect(within(lane).getByTestId('tl-step')).toHaveTextContent(pts[2]!.label);
    expect(screen.getByTestId('tl-cursor-time')).toHaveTextContent(fmtTime(pts[2]!.t));
    expect(screen.getByTestId('tl-cursor-time')).not.toHaveTextContent('·');
    act(() => useUi.getState().setSelection([v.threats[0]!.key]));
    expect(screen.getByTestId('tl-cursor-time')).toHaveTextContent(
      `${fmtTime(pts[2]!.t)} · ${pts[2]!.label}`,
    );
  });

  it('Save a frame here and Save the loop as a slice', async () => {
    const [frame, slice] = timelineCommands;
    expect(frame!.label).toBe('Save a frame here');
    expect(slice!.label).toBe('Save the loop as a slice');
    // registered by lane 13.W, so the strip's menu lists them through menuItemsFor
    expect(get(frame!.id)).toBe(frame);
    const ctx = currentContext({ x: 0, y: 0, tS: 42 });
    expect(frame!.when(ctx)).toBe(true);
    expect(frame!.when(currentContext(null))).toBe('Right-click the timeline first');
    expect(slice!.when(ctx)).toBe('Set a loop first: Shift and drag on the axis');
    act(() => frame!.run(ctx));
    expect(useUi.getState()).toMatchObject({ tS: 42, timeOn: true });
    expect(doc().cards).toHaveLength(1);
    expect(doc().cards[0]!.tS).toBe(42);
    act(() => useUi.getState().setLoop({ startS: 5, endS: 20 }));
    expect(slice!.when(currentContext(null))).toBe(true);
    await expect(sliceFromLoop()).resolves.toBeTypeOf('boolean');
  });
});

/** Unmount every rendered strip (between two renders in one test). */
function cleanupStrip() {
  cleanup();
}
