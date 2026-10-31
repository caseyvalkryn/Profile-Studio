import './ui/test-utils';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from './App';

// Build now renders the map; jsdom has no WebGL.
vi.mock('maplibre-gl', () => import('./features/build/map/__mocks__/maplibre-gl'));

describe('App shell', () => {
  it('shows the five workspaces in the top bar', async () => {
    render(
      <MemoryRouter initialEntries={['/build']}>
        <App />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Workspaces' });
    for (const name of ['Library', 'Build', 'Results', 'Report', 'Brief']) {
      expect(nav).toHaveTextContent(name);
    }
    expect(screen.getByRole('link', { name: 'Build' })).toHaveAttribute('aria-current', 'page');
    // No storage in jsdom, so start-up opens nothing and Build shows its empty state.
    expect(await screen.findByRole('main', { name: 'Build' })).toBeInTheDocument();
  });
});
