import './test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { Palette } from './Palette';
import type { PaletteRow } from './Palette';
import type { PaletteItem } from './types';

function setup() {
  const undo = vi.fn();
  const del = vi.fn();
  const onOpenChange = vi.fn();
  const items: PaletteItem[] = [
    { id: 'edit.undo', label: 'Undo', group: 'Edit', shortcut: '⌘Z', onSelect: undo },
    {
      id: 'edit.delete',
      label: 'Delete selection',
      group: 'Edit',
      shortcut: 'Del',
      disabledReason: 'Nothing selected',
      onSelect: del,
    },
    { id: 'view.fit', label: 'Fit view', group: 'View', shortcut: 'F', onSelect: vi.fn() },
  ];
  render(<Palette open onOpenChange={onOpenChange} items={items} />);
  return { undo, del, onOpenChange };
}

describe('Palette', () => {
  it('groups items and shows shortcuts and disabled reasons', () => {
    setup();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Undo/ })).toHaveTextContent('⌘Z');
    const del = screen.getByRole('option', { name: /Delete selection/ });
    expect(del).toHaveTextContent('Nothing selected');
    expect(del).toHaveAttribute('aria-disabled', 'true');
  });

  it('filters by label and Enter runs onSelect and closes', () => {
    const { undo, onOpenChange } = setup();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'fit' } });
    expect(screen.getByRole('option', { name: /Fit view/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Undo/ })).toBeNull();

    fireEvent.change(input, { target: { value: 'undo' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not run a disabled item', () => {
    const { del } = setup();
    fireEvent.click(screen.getByRole('option', { name: /Delete selection/ }));
    expect(del).not.toHaveBeenCalled();
  });

  it('shows a data column, row hints, band headers and group hints', () => {
    const rows: PaletteRow[] = [
      { id: 'a', label: 'Quadrotor ISR', group: 'Threats', band: 'Group 1', bandNote: 'Under 20 lb', data: '23 kt  705 ft', onSelect: vi.fn() },
      { id: 'b', label: '3D radar', group: 'Sensors', data: '2.16 nm', hint: 'S', onSelect: vi.fn() },
    ];
    render(<Palette open onOpenChange={vi.fn()} items={rows} groupHints={{ Sensors: 'S' }} />);
    expect(screen.getByRole('option', { name: /Quadrotor ISR/ })).toHaveTextContent('23 kt 705 ft');
    expect(screen.getByRole('option', { name: /3D radar/ })).toHaveTextContent('S');
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Under 20 lb')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quad' } });
    expect(screen.queryByText('Group 1')).toBeNull();
  });

  it('opens on focus groups with an All button; typing searches every group', () => {
    const onShowAll = vi.fn();
    const rows: PaletteRow[] = [
      { id: 'a', label: 'Quadrotor ISR', group: 'Threats', onSelect: vi.fn() },
      { id: 'b', label: '3D radar', group: 'Sensors', onSelect: vi.fn() },
    ];
    render(
      <Palette open onOpenChange={vi.fn()} items={rows} focusGroups={['Sensors']} onShowAll={onShowAll} />,
    );
    expect(screen.queryByRole('option', { name: /Quadrotor/ })).toBeNull();
    expect(screen.getByRole('option', { name: /3D radar/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onShowAll).toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quad' } });
    expect(screen.getByRole('option', { name: /Quadrotor/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });
});
