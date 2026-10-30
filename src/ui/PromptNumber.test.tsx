import './test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { PromptNumber } from './PromptNumber';

describe('PromptNumber', () => {
  it('submits the entered number and closes', () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PromptNumber
        open
        onOpenChange={onOpenChange}
        title="Set speed"
        label="Speed"
        value={25}
        unit="m/s"
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Set speed' })).toBeInTheDocument();
    const input = screen.getByLabelText('Speed');
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledWith(42);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Cancel closes without submitting', () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PromptNumber
        open
        onOpenChange={onOpenChange}
        title="Set range"
        label="Range"
        value={1000}
        unit="m"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
