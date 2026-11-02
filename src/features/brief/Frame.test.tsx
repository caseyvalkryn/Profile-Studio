import '../../ui/test-utils';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { boardDerived, boardScene } from '../build/board/derived';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import Frame from './Frame';
import { daText, frameOf, marginText, sliceItems, sliceText } from './frameData';
import { testDeck } from './testDeck';

beforeEach(() => {
  useUi.setState({ ...UI_DEFAULTS, workspace: 'brief' });
  useDocument.getState().open(testDeck());
});

const v = () => useDocument.getState().doc!;
const at = (t: number) => useUi.setState({ tS: t, timeOn: true });

describe('the frame of a card (lane 13.2)', () => {
  it('names the step reached, the next step, the holders, the margin and the DA time', () => {
    const f = frameOf(boardScene(v()), boardDerived(v()), 200, [v().threats[0]!.key], 'asset');
    expect(f.threats.map((x) => x.id)).toEqual(['T-01']);
    const t1 = f.threats[0]!;
    expect(t1.reached?.label).toBe('Fix');
    expect(t1.next?.label).toBe('Track');
    expect(t1.holders).toEqual([{ id: 'S-01', kind: 'radar' }]);
    expect(marginText(t1.margin)).toBe('margin +181 s');
    expect(marginText(-4.6)).toBe('margin -5 s');
    expect(daText(t1.daT, 200)).toBe('DA in 4:52');
    expect(daText(t1.daT, null)).toBe('DA at t+8:12');
    expect(sliceText({ t0S: 10, t1S: 40, rate: 2 })).toBe('t+0:10 to t+0:40 · x2');
  });

  it('the panel on card 2 at t+3:20: one block, the countdown moves the time', () => {
    at(200);
    render(<Frame v={v()} card={v().cards[1]!} />);
    const panel = screen.getByTestId('brief-frame');
    expect(within(panel).getByRole('heading', { name: 'Frame at t+3:20' })).toBeInTheDocument();
    const blocks = screen.getAllByTestId('brief-frame-threat');
    expect(blocks).toHaveLength(1);
    expect(within(blocks[0]!).getByTestId('brief-frame-step')).toHaveTextContent('Fix');
    expect(within(blocks[0]!).getByTestId('brief-frame-holders')).toHaveTextContent('S-01');
    expect(blocks[0]!).toHaveTextContent(/Range[\d.]+ nm/);
    expect(blocks[0]!).toHaveTextContent('margin +181 s');
    const next = within(blocks[0]!).getByRole('button', { name: /^Move the time to T-01 Track/ });
    expect(next).toHaveTextContent('Track in 1:37');
    fireEvent.click(next);
    expect(useUi.getState().tS).toBe(boardDerived(v()).stages['T-01']!.track!.t);
    expect(screen.queryByTestId('brief-slice-list')).toBeNull();
  });

  it('with time off reads Full run, with every threat when the focus names none', () => {
    render(<Frame v={v()} card={v().cards[0]!} />);
    expect(screen.getByRole('heading', { name: 'Full run' })).toBeInTheDocument();
    expect(screen.getAllByTestId('brief-frame-threat')).toHaveLength(2);
    expect(screen.getAllByTestId('brief-frame-step')[0]).toHaveTextContent('Assess');
  });

  it('a slice lists its key points, events and window changes in time order', () => {
    const doc = v();
    doc.events = [
      {
        key: 'k-ev1',
        id: 'EV-1',
        tS: 295,
        type: 'detect',
        label: 'Cue',
        threatKey: doc.threats[0]!.key,
        sensorKey: doc.sensors[1]!.key,
      },
    ];
    doc.cards[1]!.clip = { t0S: 290, t1S: 300, rate: 1, beatsS: [] };
    useDocument.getState().open(doc);
    const items = sliceItems(boardScene(v()), boardDerived(v()), { t0S: 290, t1S: 300 }, [
      doc.threats[0]!.key,
    ]);
    expect(items.map((i) => i.text)).toEqual([
      'S-02 window opens on T-01',
      'E-01 window opens on T-01',
      // the authored detect sets Find to its time; a key point sorts before an event at a tie
      'T-01 Find · S-02',
      'T-01 Detect · S-02 · Cue',
      'T-01 Track · S-02',
    ]);
    at(200);
    render(<Frame v={v()} card={v().cards[1]!} />);
    const list = screen.getByTestId('brief-slice-list');
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(5);
    fireEvent.click(rows[3]!);
    expect(useUi.getState().tS).toBe(295);
  });
});
