import './ui/test-utils';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

describe('App shell', () => {
  it('shows the three workspaces in the top bar', async () => {
    render(
      <MemoryRouter initialEntries={['/build']}>
        <App />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Workspaces' });
    for (const name of ['Library', 'Build', 'Brief']) {
      expect(nav).toHaveTextContent(name);
    }
    expect(screen.getByRole('link', { name: 'Build' })).toHaveAttribute('aria-current', 'page');
    // No storage in jsdom, so start-up opens nothing and Build shows its empty state.
    expect(await screen.findByRole('main', { name: 'Build' })).toBeInTheDocument();
  });
});
