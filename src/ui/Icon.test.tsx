import './test-utils';
import { render, screen } from '@testing-library/react';
import { Play } from 'lucide-react';
import { Icon } from './Icon';

describe('Icon', () => {
  it('renders the label as visible text beside the icon', () => {
    const { container } = render(<Icon icon={Play} label="Run" />);
    expect(screen.getByText('Run')).toBeVisible();
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('stroke-width', String((1.25 * 24) / 16));
  });

  it('renders the icon alone with the label as its accessible name', () => {
    render(
      <button>
        <Icon icon={Play} label="Run" iconOnly />
      </button>,
    );
    expect(screen.queryByText('Run')).toBeNull();
    expect(screen.getByRole('img', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });
});
