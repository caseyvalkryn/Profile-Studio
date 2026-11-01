import './ui/test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { TEMPLATES } from './domain/templates';
import type { Vignette } from './domain/types';
import { testVignette } from './engine/testVignette';
import { useDocument } from './state/document';
import { setDb, type VignetteDb } from './state/persist';

// An in-memory store behind persist, so start-up and the Library read and write it.
const store = new Map<string, Vignette>();
const fakeDb = {
  get: async (_: string, id: string) => store.get(id),
  put: async (_: string, v: Vignette) => void store.set(v.id, structuredClone(v)),
  delete: async (_: string, id: string) => void store.delete(id),
  getAll: async () => [...store.values()],
} as unknown as VignetteDb;

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  store.clear();
  setDb(fakeDb);
  act(() => useDocument.getState().open(testVignette()));
});

afterAll(() => setDb(null));

describe('routes', () => {
  it('/ renders the Library with the 8 templates; opening one goes to Build', async () => {
    useDocument.setState({ doc: null });
    at('/');
    const cards = await screen.findAllByRole('button', { name: /^Open template/ });
    expect(cards).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: `Open template ${TEMPLATES[0]!.name}` }));
    expect(await screen.findByRole('main', { name: 'Build' })).toBeInTheDocument();
    expect(useDocument.getState().doc?.name).toBe(TEMPLATES[0]!.name);
    expect(store.size).toBe(0); // a template copy saves after its first edit (review 7 FR-07)
  });

  it('/build with no vignette stored or open links to the Library', async () => {
    useDocument.setState({ doc: null });
    at('/build');
    expect(await screen.findByText('No profile open.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Open one from the Library' }));
    expect(await screen.findAllByRole('button', { name: /^Open template/ })).toHaveLength(8);
  });

  it('start-up opens the newest stored vignette on the requested route', async () => {
    useDocument.setState({ doc: null });
    const old = testVignette({ id: 'old', name: 'Old', updated: '2026-10-01T00:00:00.000Z' });
    const ne = testVignette({ id: 'new', name: 'New', updated: '2026-10-29T00:00:00.000Z' });
    store.set(old.id, old).set(ne.id, ne);
    at('/build');
    expect(await screen.findByRole('main', { name: 'Build' })).toBeInTheDocument();
    expect(useDocument.getState().doc?.id).toBe('new');
  });

  it('/results and /report land in Build (plan 10.1)', async () => {
    for (const path of ['/results', '/report']) {
      const { unmount } = at(path);
      expect(await screen.findByRole('main', { name: 'Build' })).toBeInTheDocument();
      unmount();
    }
  });
});
