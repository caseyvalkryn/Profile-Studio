import '../../ui/test-utils';
import { render, screen } from '@testing-library/react';
import { testVignette } from '../../engine/testVignette';
import { Thumbnail } from './Thumbnail';

describe('Library thumbnail', () => {
  it('draws the board card render (src/board, thumb mode) under its title', () => {
    render(<Thumbnail vignette={testVignette()} title="Test map" />);
    const img = screen.getByRole('img', { name: 'Test map' });
    const svg = img.querySelector('svg.board.thumb');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('data-proj')).toBe('plan');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 200 120');
  });

  it('shows the placeholder for an empty profile', () => {
    const v = testVignette({ threats: [], sensors: [], effectors: [], nodes: [], areas: [] });
    render(<Thumbnail vignette={v} title="Empty map" />);
    expect(screen.getByRole('img', { name: 'Empty map' }).querySelector('svg')).toBeNull();
  });
});
