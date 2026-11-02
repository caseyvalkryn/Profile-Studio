import '../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { boardDerived } from '../build/board/derived';
import { BOARD_DEFAULTS, useBoard } from '../build/board/store';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import BriefWorkspace, { PrintDeck } from './BriefWorkspace';
import { captureStage } from './screenshot';
import { testDeck } from './testDeck';

vi.mock('./screenshot', async (orig) => ({
  ...(await orig<typeof import('./screenshot')>()),
  captureStage: vi.fn(() => Promise.resolve(true)),
}));

beforeEach(() => {
  useUi.setState({ ...UI_DEFAULTS, workspace: 'brief' });
  useBoard.setState({ ...BOARD_DEFAULTS });
  useDocument.getState().open(testDeck());
});

const head = () => screen.getByTestId('brief-head').textContent;
const strip = () => screen.getByTestId('brief-timeline');
const stageProj = () =>
  screen.getByTestId('brief-stage').querySelector('svg.board')?.getAttribute('data-proj');

describe('Brief workspace', () => {
  it('opens on the first card at its view, with the strip, head and caption', () => {
    render(<BriefWorkspace />);
    expect(head()).toBe('1 of 2 · V-test');
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    const stage = screen.getByRole('region', { name: 'Stage' });
    expect(within(stage).getByText('Every ring to scale.')).toBeInTheDocument();
    const strip = screen.getByRole('complementary', { name: 'Cards' });
    const cards = within(strip).getAllByRole('button', { name: /^Card \d/ });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute('aria-current', 'true');
    expect(cards[1]).not.toHaveAttribute('aria-current');
    expect(cards[1]!.querySelector('svg.board.thumb')?.getAttribute('data-proj')).toBe('axon');
    expect(
      within(cards[1]!).getByText('3D · t+200 s · default 3D view · T-01'),
    ).toBeInTheDocument();
    expect(stageProj()).toBe('plan');
    expect(useUi.getState().view).toBe('plan');
  });

  it('Next and Previous move the card; the stage and Build follow', () => {
    render(<BriefWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(head()).toBe('2 of 2 · V-test');
    expect(stageProj()).toBe('axon');
    expect(useUi.getState()).toMatchObject({ view: '3d', tS: 200, timeOn: true });
    // The focus dims the rest: the threat in focus keeps its path strong.
    const svg = screen.getByTestId('brief-stage').querySelector('svg.board')!;
    expect(svg.querySelectorAll('.dim').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(head()).toBe('1 of 2 · V-test');
    fireEvent.click(screen.getByRole('button', { name: 'Previous card' }));
    expect(head()).toBe('2 of 2 · V-test');
  });

  it('a strip click opens that card', () => {
    render(<BriefWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Card 2: The loiter' }));
    expect(head()).toBe('2 of 2 · V-test');
  });

  it('stashes the Build view on mount and restores it on unmount', () => {
    useUi.getState().setView('elevation');
    useBoard.getState().set({ yaw: 12 });
    const { unmount } = render(<BriefWorkspace />);
    expect(useUi.getState().buildStash).toMatchObject({ view: 'elevation', yaw: 12 });
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(useUi.getState().view).toBe('3d');
    unmount();
    expect(useUi.getState().view).toBe('elevation');
    expect(useBoard.getState().yaw).toBe(12);
    expect(useUi.getState().buildStash).toBeNull();
  });

  it('renames the card in one undo step across the keystrokes', () => {
    render(<BriefWorkspace />);
    const name = screen.getByRole('textbox', { name: 'Card name' });
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: 'Overvie' } });
    fireEvent.change(name, { target: { value: 'Overview 2' } });
    expect(screen.getByRole('heading', { name: 'Overview 2' })).toBeInTheDocument();
    expect(useDocument.getState().past).toHaveLength(0);
    fireEvent.blur(name);
    expect(useDocument.getState().history).toEqual(['rename card c1']);
    useDocument.getState().undo();
    expect(useDocument.getState().doc!.cards[0]!.name).toBe('Overview');
  });

  it('camera, time, focus ids and a layer toggle are one undo step each', () => {
    render(<BriefWorkspace />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Camera' }), {
      target: { value: 'elev' },
    });
    expect(useDocument.getState().doc!.cards[0]!.view.kind).toBe('elevation');
    const time = screen.getByRole('textbox', { name: 'Card time' });
    fireEvent.focus(time);
    fireEvent.change(time, { target: { value: '2:00' } });
    fireEvent.blur(time);
    expect(useDocument.getState().doc!.cards[0]!.tS).toBe(120);
    // shown in m:ss, as the Slice field beside it (F-08)
    expect(time).toHaveValue('2:00');
    const focus = screen.getByRole('textbox', { name: 'Focus ids' });
    fireEvent.change(focus, { target: { value: 'T-02' } });
    fireEvent.blur(focus);
    expect(useDocument.getState().doc!.cards[0]!.focus).toEqual([
      useDocument.getState().doc!.threats[1]!.key,
    ]);
    const layers = screen.getByRole('group', { name: 'Card layers' });
    fireEvent.click(within(layers).getByRole('checkbox', { name: 'Telemetry' }));
    expect(useDocument.getState().doc!.cards[0]!.layers).toMatchObject({
      telemetry: true,
      target: true,
    });
    expect(useDocument.getState().history).toEqual([
      'set card c1 camera',
      'set card c1 time',
      'set card c1 focus',
      'set card c1 layers',
    ]);
  });

  it('Up, Down and Delete in the notes panel move and remove the card', () => {
    render(<BriefWorkspace />);
    expect(screen.getByRole('button', { name: 'Move card up' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move card down' }));
    expect(useDocument.getState().doc!.cards.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(head()).toBe('2 of 2 · V-test');
    fireEvent.click(screen.getByRole('button', { name: 'Delete card' }));
    expect(useDocument.getState().doc!.cards.map((c) => c.id)).toEqual(['c2']);
    expect(head()).toBe('1 of 1 · V-test');
  });

  it('with no cards: the build on the stage, the strip, the question and the add button', () => {
    useDocument.getState().open({ ...testDeck(), cards: [] });
    render(<BriefWorkspace />);
    expect(screen.getByRole('heading', { name: 'test vignette' })).toBeInTheDocument();
    expect(head()).toBe('Build view · V-test');
    expect(stageProj()).toBe('plan');
    expect(screen.getByTestId('brief-time')).toHaveTextContent('full run');
    expect(screen.getByTestId('brief-float-head')).toHaveTextContent('Full run');
    expect(screen.getByTestId('brief-readout')).toHaveTextContent('T-01');
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
    expect(strip()).not.toHaveClass('brief-tl-collapsed');
    expect(screen.getAllByTestId('brief-keypoints')).toHaveLength(
      useDocument.getState().doc!.threats.length,
    );
    expect(screen.getAllByText('Does the radar hold the hover?').length).toBeGreaterThan(0);
    expect(screen.getByText(/No cards yet. The stage shows the build./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add card from current scene' }));
    expect(head()).toBe('1 of 1 · V-test');
    expect(screen.getByRole('heading', { name: 'Card 1' })).toBeInTheDocument();
  });

  it('prints one page per card with its render, caption and notes', () => {
    const v = testDeck();
    render(<PrintDeck v={v} />);
    const pages = screen.getAllByTestId('brief-page');
    expect(pages).toHaveLength(2);
    expect(pages[1]!.querySelector('svg.board')?.getAttribute('data-proj')).toBe('axon');
    expect(pages[1]!.textContent).toContain('At t+200 s the aircraft hovers.');
    expect(pages[1]!.textContent).toContain('Pause here.');
  });
});

describe('Brief timeline, readout, frames and key points', () => {
  it('the Timeline button collapses the strip to its play bar and opens it again', () => {
    render(<BriefWorkspace />);
    expect(screen.getByRole('group', { name: 'Timeline' })).toBeInTheDocument();
    expect(strip()).not.toHaveClass('brief-tl-collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(useDocument.getState().doc!.cards[0]!.displays.timeline).toBe(false);
    expect(strip()).toHaveClass('brief-tl-collapsed');
    expect(screen.getByRole('toolbar', { name: 'Play bar' })).toBeInTheDocument();
    expect(useDocument.getState().history).toEqual(['set card c1 timeline']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Timeline' }));
    expect(strip()).not.toHaveClass('brief-tl-collapsed');
  });

  it('the strip moves the time cursor and the stage follows it', () => {
    render(<BriefWorkspace />);
    expect(screen.getByTestId('brief-time')).toHaveTextContent('full run');
    fireEvent.click(screen.getByRole('button', { name: 'Next key point' }));
    const { tS, timeOn } = useUi.getState();
    expect(timeOn).toBe(true);
    expect(tS).toBeGreaterThan(0);
    expect(screen.getByTestId('brief-time')).toHaveTextContent(`t+${Math.floor(tS / 60)}:`);
  });

  it('each card keeps its own Timeline display', () => {
    const v = testDeck();
    v.cards[1]!.displays.timeline = false;
    useDocument.getState().open(v);
    render(<BriefWorkspace />);
    expect(strip()).not.toHaveClass('brief-tl-collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(strip()).toHaveClass('brief-tl-collapsed');
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
  });

  it('Save a screenshot captures the stage under the profile, card and time name', () => {
    const capture = vi.mocked(captureStage);
    capture.mockClear();
    render(<BriefWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a screenshot' }));
    const svg = screen.getByTestId('brief-stage').querySelector('svg.board');
    expect(capture).toHaveBeenLastCalledWith(svg, 320, 300, 'V-test-c1-full-run.png');
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save a screenshot' }));
    expect(capture).toHaveBeenLastCalledWith(expect.anything(), 320, 300, 'V-test-c2-t+3-20.png');
  });

  it('Save a screenshot with no cards names the build', () => {
    const capture = vi.mocked(captureStage);
    capture.mockClear();
    useDocument.getState().open({ ...testDeck(), cards: [] });
    render(<BriefWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a screenshot' }));
    expect(capture).toHaveBeenCalledWith(expect.anything(), 320, 300, 'V-test-build-full-run.png');
  });

  it('a frame with no cards saves the Build view as card 1 and keeps the strip open', () => {
    useDocument.getState().open({ ...testDeck(), cards: [] });
    render(<BriefWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Save a frame as a card' }));
    const cards = useDocument.getState().doc!.cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 'c1', name: 'Card 1', displays: { timeline: true } });
    expect(head()).toBe('1 of 1 · V-test');
    expect(strip()).not.toHaveClass('brief-tl-collapsed');
  });

  it('the Readout button floats the frame panel on the stage: the threat in focus at the time cursor', () => {
    render(<BriefWorkspace />);
    expect(screen.queryByTestId('brief-readout')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Readout' }));
    const float = () => screen.getByTestId('brief-readout');
    expect(float()).toHaveClass('brief-float');
    expect(screen.getByTestId('brief-float-head')).toHaveTextContent('Full run');
    expect(within(float()).getByText('T-01')).toBeInTheDocument();
    act(() => {
      useUi.getState().setTime(20);
      useUi.getState().setTimeOn(true);
    });
    expect(screen.getByTestId('brief-float-head')).toHaveTextContent('Frame at t+0:20');
    expect(within(float()).getAllByText('Range')[0]!.nextElementSibling).toHaveTextContent(/nm$/);
    expect(within(float()).getAllByTestId('brief-frame-holders').length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: 'Readout' })).toBeChecked();
  });

  it('the wheel zooms the card about the cursor as one undo step; the head and the Zoom field show it', () => {
    vi.useFakeTimers();
    try {
      render(<BriefWorkspace />);
      expect(screen.queryByTestId('brief-zoom-head')).toBeNull();
      const stage = screen.getByTestId('brief-stage');
      fireEvent.wheel(stage, { deltaY: -200, clientX: 0, clientY: 0 });
      fireEvent.wheel(stage, { deltaY: -200, clientX: 0, clientY: 0 });
      const view = () => useDocument.getState().doc!.cards[0]!.view;
      expect(view().zoom).toBeCloseTo(Math.exp(400 * 0.0015), 2);
      expect(view().centre).not.toEqual({ x: 0, y: 0 });
      expect(useDocument.getState().past).toHaveLength(0);
      act(() => void vi.advanceTimersByTime(300));
      expect(useDocument.getState().past.map((e) => e.label)).toEqual(['zoom card c1']);
      expect(screen.getByTestId('brief-zoom-head')).toHaveTextContent('x1.82');
      expect(screen.getByRole('spinbutton', { name: 'Zoom' })).toHaveValue(1.82);
      fireEvent.click(screen.getByRole('button', { name: 'Fit the card' }));
      expect(view()).toMatchObject({ zoom: 1, centre: { x: 0, y: 0 } });
      expect(useDocument.getState().past.map((e) => e.label)).toEqual([
        'zoom card c1',
        'fit card c1',
      ]);
      expect(screen.getByRole('button', { name: 'Fit the card' })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a drag pans a Plan card and orbits a 3D card, one undo step each; a click records nothing', () => {
    render(<BriefWorkspace />);
    const stage = screen.getByTestId('brief-stage');
    fireEvent.pointerDown(stage, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 50, clientY: 50 });
    expect(useDocument.getState().past).toHaveLength(0);
    fireEvent.pointerDown(stage, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 90, clientY: 70 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 110, clientY: 70 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 110, clientY: 70 });
    const c1 = useDocument.getState().doc!.cards[0]!.view;
    expect(c1.zoom).toBe(1);
    expect(c1.centre.x).toBeLessThan(0);
    expect(useDocument.getState().past.map((e) => e.label)).toEqual(['pan card c1']);
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    const { yawDeg: yaw0, pitchDeg: pitch0 } = useDocument.getState().doc!.cards[1]!.view;
    fireEvent.pointerDown(stage, { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(stage, { pointerId: 2, clientX: 100, clientY: 0 });
    fireEvent.pointerUp(stage, { pointerId: 2, clientX: 100, clientY: 0 });
    const c2 = useDocument.getState().doc!.cards[1]!.view;
    expect(c2.yawDeg).toBeCloseTo(yaw0 + 100 * 0.45, 5);
    expect(c2.pitchDeg).toBe(pitch0);
    expect(useDocument.getState().past.map((e) => e.label)).toEqual([
      'pan card c1',
      'orbit card c2',
    ]);
  });

  it('C saves a frame after the current card at the current time and opens it', () => {
    render(<BriefWorkspace />);
    act(() => {
      useUi.getState().setTime(42);
      useUi.getState().setTimeOn(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save a frame as a card' }));
    const v = useDocument.getState().doc!;
    expect(v.cards.map((c) => c.name)).toEqual(['Overview', 'Overview at t+0:42', 'The loiter']);
    expect(v.cards[1]).toMatchObject({ id: 'c3', tS: 42, caption: '', view: { kind: 'plan' } });
    expect(useDocument.getState().history).toEqual(['save frame c3']);
    expect(head()).toBe('2 of 3 · V-test');
    expect(screen.getByTestId('brief-aids')).toHaveTextContent('Next: 3 The loiter');
  });

  it('the key points list each F2T2EA step of the threat; a press moves the time there', () => {
    render(<BriefWorkspace />);
    const list = screen.getAllByTestId('brief-keypoints');
    expect(list).toHaveLength(useDocument.getState().doc!.threats.length);
    const first = within(list[0]!).getAllByRole('button')[0]!;
    expect(first).toHaveAccessibleName(/^T-01 Find at t\+\d+:\d\d$/);
    expect(first).toHaveAttribute('title', expect.stringContaining('first sensor window'));
    fireEvent.click(first);
    const d = boardDerived(useDocument.getState().doc!);
    expect(useUi.getState()).toMatchObject({ timeOn: true, tS: d.stages['T-01']!.find!.t });
    expect(screen.getByText('Definitions')).toBeInTheDocument();
  });
});

describe('Brief frame and slice (lane 13.2)', () => {
  const card2 = () => useDocument.getState().doc!.cards[1]!;
  const commit = (testId: string, value: string) => {
    const f = screen.getByTestId(testId);
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value } });
    fireEvent.keyDown(f, { key: 'Enter' });
    fireEvent.blur(f);
  };

  it('the Slice field sets from, to and rate, one undo step each; bad text reverts; Clear clears', () => {
    render(<BriefWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(screen.queryByTestId('brief-slice-head')).toBeNull();
    commit('brief-slice-from', '1:00');
    expect(card2().clip).toEqual({ t0S: 60, t1S: 90, rate: 1, beatsS: [] });
    commit('brief-slice-to', '2:00');
    commit('brief-slice-to', '0:30'); // before the start: reverts
    commit('brief-slice-from', 'soon'); // not a time: reverts
    expect(screen.getByTestId('brief-slice-from')).toHaveValue('1:00');
    fireEvent.change(screen.getByTestId('brief-slice-rate'), { target: { value: '2' } });
    expect(card2().clip).toEqual({ t0S: 60, t1S: 120, rate: 2, beatsS: [] });
    expect(useDocument.getState().history).toEqual([
      'set card c2 slice',
      'set card c2 slice',
      'set card c2 slice',
    ]);
    // the head reads the slice beside the live time; the card opens at the slice start
    expect(screen.getByTestId('brief-slice-head')).toHaveTextContent('t+1:00 to t+2:00 · x2');
    expect(screen.getByTestId('brief-time')).toHaveTextContent('t+1:00');
    expect(useUi.getState()).toMatchObject({ loop: { startS: 60, endS: 120 }, rate: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Clear the slice' }));
    expect(card2().clip).toBeNull();
    expect(screen.queryByTestId('brief-slice-head')).toBeNull();
    expect(useUi.getState().loop).toBeNull();
  });

  it('Set the slice from the loop is disabled with a reason until a loop is set', () => {
    render(<BriefWorkspace />);
    const scissors = screen.getByRole('button', { name: 'Set the slice from the loop' });
    expect(scissors).toHaveAttribute('aria-disabled', 'true');
    expect(scissors).toHaveAccessibleDescription(
      'Set a loop on the timeline first (Shift and drag)',
    );
    fireEvent.click(scissors);
    expect(useDocument.getState().history).toEqual([]);
    act(() => useUi.getState().setLoop({ startS: 10, endS: 40 }));
    expect(scissors).not.toHaveAttribute('aria-disabled');
    fireEvent.click(scissors);
    expect(useDocument.getState().doc!.cards[0]!.clip).toMatchObject({ t0S: 10, t1S: 40 });
    expect(screen.getByTestId('brief-slice-head')).toHaveTextContent('t+0:10 to t+0:40 · x1');
  });

  it('the Frame panel tops the notes; an empty caption says what to write; aids name the times', () => {
    const v = testDeck();
    v.cards[0]!.caption = '';
    useDocument.getState().open(v);
    render(<BriefWorkspace />);
    const notes = screen.getByRole('complementary', { name: 'Notes' });
    expect(notes.querySelector('section')).toBe(screen.getByTestId('brief-frame'));
    expect(screen.getByTestId('brief-caption')).toHaveTextContent(
      'Write what the viewer must see over the full run.',
    );
    expect(screen.getByRole('textbox', { name: 'Caption' })).toHaveValue('');
    expect(screen.getByTestId('brief-aids')).toHaveTextContent('Next: 2 The loiter at t+3:20');
    act(() => {
      useUi.getState().setTime(100);
      useUi.getState().setTimeOn(true);
    });
    expect(screen.getByTestId('brief-aids-step')).toHaveTextContent('T-01 Fix');
    // the key points: the latest reached reads "now", the later ones are future
    const kp = within(screen.getAllByTestId('brief-keypoints')[0]!).getAllByRole('button');
    expect(kp[1]).toHaveAttribute('data-state', 'tl-current');
    expect(kp[1]).toHaveTextContent('now');
    expect(kp[0]).toHaveAttribute('data-state', 'tl-reached');
    expect(kp[2]).toHaveAttribute('data-state', 'tl-future');
  });

  it('prints the frame time or the slice under the name and the frame lines as a table', () => {
    const v = testDeck();
    v.cards[0]!.clip = { t0S: 10, t1S: 40, rate: 2, beatsS: [] };
    render(<PrintDeck v={v} />);
    const pages = screen.getAllByTestId('brief-page');
    expect(pages[0]!.querySelector('.brief-page-time')).toHaveTextContent('t+0:10 to t+0:40 · x2');
    expect(pages[1]!.querySelector('.brief-page-time')).toHaveTextContent('t+3:20');
    const rows = pages[1]!.querySelectorAll('.brief-page-frame tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('T-01');
    expect(rows[0]!.textContent).toContain('Track in 1:37');
  });
});
