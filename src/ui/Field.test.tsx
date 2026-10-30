import './test-utils';
import { fireEvent, render, screen } from '@testing-library/react';
import { Field } from './Field';

describe('Field', () => {
  it('shows the unit and the source note', () => {
    render(
      <Field label="Speed" value={25} unit="m/s" source="Entered by planner" onCommit={() => {}} />,
    );
    expect(screen.getByText('m/s')).toBeInTheDocument();
    expect(screen.getByLabelText('Speed')).toHaveAccessibleDescription('Entered by planner');
  });

  it('commits on Enter and reverts on Escape', () => {
    const onCommit = vi.fn();
    render(<Field label="Speed" value={25} unit="m/s" onCommit={onCommit} />);
    const input = screen.getByLabelText('Speed');
    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(30);

    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('25');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('steps with arrows, Shift by 10 times, and rejects non-numbers', () => {
    const onCommit = vi.fn();
    render(<Field label="Range" value={1} step={0.5} onCommit={onCommit} />);
    const input = screen.getByLabelText('Range');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveValue('1.5');
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    expect(input).toHaveValue('6.5');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('1');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
