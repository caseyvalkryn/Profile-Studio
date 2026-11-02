import '../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { boardDerived } from '../build/board/derived';
import { BOARD_DEFAULTS, useBoard } from '../build/board/store';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import BriefWorkspace, { PrintDeck } from './BriefWorkspace';
import { testDeck } from './testDeck';

beforeEach(() => {
  useUi.setState({ ...UI_DEFAULTS, workspace: 'brief' });
  useBoard.setState({ ...BOARD_DEFAULTS });
  useDocument.getState().open(testDeck());
});

const head = () => screen.getByTestId('brief-head').textContent;
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
    const time = screen.getByRole('spinbutton', { name: 'Time s' });
    fireEvent.focus(time);
    fireEvent.change(time, { target: { value: '120' } });
    fireEvent.blur(time);
    expect(useDocument.getState().doc!.cards[0]!.tS).toBe(120);
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

  it('with no cards: the profile name, the question and the add button', () => {
    useDocument.getState().open({ ...testDeck(), cards: [] });
    render(<BriefWorkspace />);
    expect(screen.getByRole('heading', { name: 'test vignette' })).toBeInTheDocument();
    expect(screen.getAllByText('Does the radar hold the hover?').length).toBeGreaterThan(0);
    expect(screen.getByText(/No cards yet/)).toBeInTheDocument();
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
  it('the Timeline button shows the shared strip for the card; the stage follows the time cursor', () => {
    render(<BriefWorkspace />);
    expect(screen.queryByRole('group', { name: 'Timeline' })).toBeNull();
    expect(screen.getByTestId('brief-time')).toHaveTextContent('full run');
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    expect(screen.getByRole('group', { name: 'Timeline' })).toBeInTheDocument();
    expect(useDocument.getState().doc!.cards[0]!.displays.timeline).toBe(true);
    expect(useDocument.getState().history).toEqual(['set card c1 timeline']);
    fireEvent.click(screen.getByRole('button', { name: 'Next key point' }));
    const { tS, timeOn } = useUi.getState();
    expect(timeOn).toBe(true);
    expect(tS).toBeGreaterThan(0);
    expect(screen.getByTestId('brief-time')).toHaveTextContent(`t+${Math.floor(tS / 60)}:`);
    // the next card keeps its own displays
    fireEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(screen.queryByRole('group', { name: 'Timeline' })).toBeNull();
  });

  it('the Readout button shows the live line of the threat in focus at the time cursor', () => {
    render(<BriefWorkspace />);
    expect(screen.queryByTestId('brief-readout')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Readout' }));
    expect(screen.getByTestId('brief-readout')).toHaveTextContent('T-01 · time is off');
    act(() => {
      useUi.getState().setTime(20);
      useUi.getState().setTimeOn(true);
    });
    expect(screen.getByTestId('brief-readout')).toHaveTextContent(
      /^T-01 · [\d.]+ nm · \d+ ft AGL · \d+ kt · closing -?\d+ kt · /,
    );
    expect(screen.getByRole('checkbox', { name: 'Readout' })).toBeChecked();
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
