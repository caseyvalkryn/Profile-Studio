import './test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { Palette } from './Palette';
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
});
