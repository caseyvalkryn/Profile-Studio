import './test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';
import { ContextMenu } from './ContextMenu';
import { Menu } from './Menu';
import type { MenuItem } from './types';

const items = (onFit: () => void): MenuItem[] => [
  { id: 'add', label: 'Add here', children: [{ id: 'threat', label: 'Threat' }] },
  { id: 'paste', label: 'Paste here', shortcut: '⌘V', disabledReason: 'Nothing copied' },
  { id: 'fit', label: 'Fit view', shortcut: 'F', onSelect: onFit },
];

describe('Menu', () => {
  afterEach(() => vi.useRealTimers());

  it('shows shortcuts, runs an item, and a disabled item shows its reason', () => {
    const onFit = vi.fn();
    render(<Menu items={items(onFit)} trigger={<Button>Open</Button>} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open' }), { key: 'Enter' });

    const fit = screen.getByRole('menuitem', { name: /Fit view/ });
    expect(fit).toHaveTextContent('F');
    expect(screen.getByRole('menuitem', { name: /Add here/ })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );

    const paste = screen.getByRole('menuitem', { name: /Paste here/ });
    expect(paste).toHaveAttribute('aria-disabled', 'true');
    expect(paste).toHaveTextContent('⌘V');

    vi.useFakeTimers();
    fireEvent.pointerMove(paste.firstElementChild as Element);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Nothing copied');
    vi.useRealTimers();

    fireEvent.click(fit);
    expect(onFit).toHaveBeenCalledTimes(1);
  });
});

describe('ContextMenu', () => {
  it('opens on right-click with the same items', () => {
    render(
      <ContextMenu items={items(() => {})}>
        <div>Map</div>
      </ContextMenu>,
    );
    fireEvent.contextMenu(screen.getByText('Map'));
    expect(screen.getByRole('menuitem', { name: /Fit view/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Paste here/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
