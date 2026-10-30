import './test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';
import { Tooltip, TooltipProvider } from './Tooltip';

describe('Tooltip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens after 400 ms and shows the shortcut', () => {
    render(
      <TooltipProvider>
        <Button tooltip="Undo the last edit" shortcut="⌘Z">
          Undo
        </Button>
      </TooltipProvider>,
    );
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Undo' }));
    act(() => vi.advanceTimersByTime(399));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Undo the last edit');
    expect(tip).toHaveTextContent('⌘Z');
  });

  it('works without an explicit provider', () => {
    render(
      <Tooltip content="Fit view" shortcut="F">
        <button>Fit</button>
      </Tooltip>,
    );
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Fit' }));
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Fit view');
  });
});
