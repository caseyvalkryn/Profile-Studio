import '../../../ui/test-utils';
import { act, render, screen } from '@testing-library/react';
import fixture from '../../../../fixtures/legacy-derive/CUAS-001.json';
import { importLegacyV4 } from '../../../domain/migrate';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { placeTip } from './place';
import { Tip, TIP_DELAY_MS } from './Tip';

const seed = () => importLegacyV4(JSON.parse(JSON.stringify(fixture.input)));
const rect = { left: 0, top: 0, width: 1000, height: 800 };
const size = { w: 200, h: 60 };

describe('placeTip', () => {
  it('sits 12 px below and right of the pointer', () => {
    expect(placeTip(rect, { x: 100, y: 100 }, size)).toEqual({ x: 112, y: 112 });
  });
  it('flips left at the right edge and up at the bottom edge', () => {
    expect(placeTip(rect, { x: 900, y: 100 }, size)).toEqual({ x: 688, y: 112 });
    expect(placeTip(rect, { x: 100, y: 760 }, size)).toEqual({ x: 112, y: 688 });
    expect(placeTip(rect, { x: 990, y: 790 }, size)).toEqual({ x: 778, y: 718 });
  });
  it('stays 4 px inside the bounds when a flip would leave them', () => {
    const small = { left: 50, top: 20, width: 220, height: 70 };
    expect(placeTip(small, { x: 150, y: 60 }, size)).toEqual({ x: 54, y: 24 });
  });
});

describe('Tip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    act(() => {
      useUi.setState({ ...UI_DEFAULTS });
      useDocument.getState().open(seed());
    });
  });
  afterEach(() => vi.useRealTimers());

  it('appears after 400 ms of a stable hover, not before, with the id, name and facts', () => {
    const rdr = useDocument.getState().doc!.sensors.find((s) => s.id === 'RDR-1')!;
    render(<Tip pointer={{ x: 300, y: 200 }} />);
    act(() => useUi.getState().setHover(rdr.key));
    act(() => vi.advanceTimersByTime(TIP_DELAY_MS - 1));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('RDR-1 3D radar');
    expect(tip).toHaveTextContent('Range 2.16 nm');
    expect(tip).toHaveTextContent(/First see T1 at \S+/);
    // A new hover key hides it and restarts the delay; clearing the hover hides it.
    const eo = useDocument.getState().doc!.sensors.find((s) => s.id === 'EO-1')!;
    act(() => useUi.getState().setHover(eo.key));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(TIP_DELAY_MS));
    expect(screen.getByRole('tooltip')).toHaveTextContent('EO-1');
    act(() => useUi.getState().setHover(null));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
