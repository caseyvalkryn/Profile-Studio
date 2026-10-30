import './ui/test-utils';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from './App';

// Build now renders the map; jsdom has no WebGL.
vi.mock('maplibre-gl', () => import('./features/build/map/__mocks__/maplibre-gl'));

describe('App shell', () => {
  it('shows the four workspaces in the top bar', () => {
    render(
      <MemoryRouter initialEntries={['/build']}>
        <App />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Workspaces' });
    for (const name of ['Library', 'Build', 'Results', 'Report']) {
      expect(nav).toHaveTextContent(name);
    }
    expect(screen.getByRole('link', { name: 'Build' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('main', { name: 'Build' })).toBeInTheDocument();
  });
});
