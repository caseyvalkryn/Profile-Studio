import '../../../ui/test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { testVignette } from '../../../engine/testVignette';
import type { Vignette } from '../../../domain/types';
import { useDocument } from '../../../state/document';
import { useUi, UI_DEFAULTS } from '../../../state/ui';
import Readout from './Readout';
import { useReadout } from './store';
import type { ReadoutAt, ReadoutSource } from './types';

/**
 * A hand-built source with the legacy at() names. Margin is the first waypoint's hold in
 * seconds, so a test sets it by editing the record.
 */
const atFor =
  (v: Vignette): ReadoutAt =>
  (threatId) => {
    const t = v.threats.find((x) => x.id === threatId);
    if (!t) return null;
    const src: ReadoutSource = {
      x: 0,
      y: 1852,
      z: 30.48,
      r: 1852,
      brg: 180,
      hdg: 180,
      spd: 20.5778,
      vc: 20.5778,
      tta: 90,
      window: 40,
      margin: t.path[0]!.holdS,
      covering: ['S-01'],
    };
    return src;
  };

const setHold = (id: string, s: number) =>
  act(() =>
    useDocument.getState().edit(`set ${id} hold`, (d) => {
      d.threats.find((t) => t.id === id)!.path[0]!.holdS = s;
    }),
  );

const lines = () => screen.queryAllByRole('listitem').map((li) => li.getAttribute('aria-label'));

beforeEach(() => {
  useDocument.getState().open(testVignette());
  useUi.setState({ ...UI_DEFAULTS, panels: { ...UI_DEFAULTS.panels, readout: true } });
  useReadout.setState({ pinned: null, dragBase: null });
});

describe('Readout', () => {
  it('is hidden when the readout panel is off', () => {
    useUi.setState({ panels: { ...UI_DEFAULTS.panels, readout: false } });
    render(<Readout atFor={atFor} />);
    expect(screen.queryByRole('region', { name: 'Readout' })).toBeNull();
  });

  it('serves as the strip tab when the strip shows the readout', () => {
    useUi.setState({ panels: { ...UI_DEFAULTS.panels, readout: false } });
    const { rerender } = render(<Readout variant="strip" atFor={atFor} />);
    expect(screen.queryByRole('region', { name: 'Readout' })).toBeNull();
    act(() => useUi.setState({ stripTab: 'readout' }));
    rerender(<Readout variant="strip" atFor={atFor} />);
    expect(screen.getByRole('region', { name: 'Readout' })).toBeInTheDocument();
  });

  it('writes one mono line per track with the legacy fields', () => {
    setHold('T-01', 12);
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(<Readout atFor={atFor} />);
    const li = screen.getByLabelText('T-01 readout');
    expect(li).toHaveTextContent(
      'T-011.00 nm100 ft AGL40 kt+40 ktTo asset 1:30Window 0:40Margin +0:12S-01',
    );
  });

  it('follows the selection, then the hover, else every track', () => {
    const { rerender } = render(<Readout atFor={atFor} />);
    expect(lines()).toEqual(['T-01 readout', 'T-02 readout']);
    act(() => useUi.setState({ hoverKey: 'k-T-02' }));
    rerender(<Readout atFor={atFor} />);
    expect(lines()).toEqual(['T-02 readout']);
    act(() => useUi.setState({ selectedKeys: ['k-T-01'] }));
    rerender(<Readout atFor={atFor} />);
    expect(lines()).toEqual(['T-01 readout']);
  });

  it('pins a baseline and shows the change against it', () => {
    setHold('T-01', 16);
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(<Readout atFor={atFor} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
    expect(screen.getByText(/^vs pinned \d\d:\d\d$/)).toBeInTheDocument();
    setHold('T-01', 20);
    expect(screen.getByLabelText('T-01 readout')).toHaveTextContent('Margin +0:20 (+0:04)');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText(/vs pinned/)).toBeNull();
  });

  it('shows the change against the pre-drag record during a drag', () => {
    setHold('T-01', 16);
    const before = useDocument.getState().doc!;
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(<Readout atFor={atFor} />);
    act(() => useReadout.getState().setDragBaseline(before));
    setHold('T-01', 12);
    const margin = screen.getByText(/^Margin/);
    expect(margin).toHaveTextContent(/^Margin \+0:12 \(-0:04\)$/);
    expect(screen.getByText('(-0:04)')).toHaveClass('text-state-warning');
    act(() => useReadout.getState().setDragBaseline(null));
    expect(screen.getByText(/^Margin/)).toHaveTextContent(/^Margin \+0:12$/);
  });
});
