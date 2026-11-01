import './ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { TEMPLATES } from './domain/templates';
import type { Vignette } from './domain/types';
import { run } from './engine/run';
import { testVignette } from './engine/testVignette';
import { useDocument } from './state/document';
import { setDb, type VignetteDb } from './state/persist';
import { useRuns } from './state/runs';

// An in-memory store behind persist, so start-up and the Library read and write it.
const store = new Map<string, Vignette>();
const fakeDb = {
  get: async (_: string, id: string) => store.get(id),
  put: async (_: string, v: Vignette) => void store.set(v.id, structuredClone(v)),
  delete: async (_: string, id: string) => void store.delete(id),
  getAll: async () => [...store.values()],
} as unknown as VignetteDb;

function withRun(): Vignette {
  const base = testVignette({
    hypotheses: [
      {
        key: 'h1',
        id: 'H-01',
        question: '',
        measure: '1.1.2',
        op: '>=',
        value: 3000,
        prediction: { low: 2000, high: 5000 },
        lockedAt: '2026-10-30T14:05:00.000Z',
      },
    ],
  });
  const rows = run(base, 10, 7).rows;
  return {
    ...base,
    runs: [{ key: 'run-1', id: 'R-1', createdAt: base.updated, n: 10, seed: 7, rows }],
  };
}

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
  useRuns.setState({ results: {}, order: [], activeKey: null, compareKeys: [], sweep: null });
  act(() => useDocument.getState().open(withRun()));
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
    at('/results');
    expect(await screen.findByRole('heading', { level: 1, name: 'Results' })).toBeInTheDocument();
    expect(useDocument.getState().doc?.id).toBe('new');
  });

  it('/results renders the Results workspace heading', async () => {
    at('/results');
    expect(await screen.findByRole('heading', { level: 1, name: 'Results' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Results' })).toBeInTheDocument();
  });

  it('/report renders the seven section titles and the map snapshot', async () => {
    at('/report');
    await screen.findByRole('heading', { level: 2, name: '1. Question' });
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual([
      '1. Question',
      '2. Hypothesis and prediction',
      '3. Setup',
      '4. Results',
      '5. Evaluation',
      '6. Scope of inference',
      '7. Next test',
    ]);
    expect(screen.getByTestId('map-snapshot')).toBeInTheDocument();
  });

  it('a picked chart in the report renders a ChartFrame title', async () => {
    at('/report');
    const box = await screen.findByRole('checkbox', { name: /1\.1\.2/ });
    fireEvent.click(box);
    const figure = document.querySelector<HTMLElement>('[data-chart="1.1.2"]')!;
    const title = await within(figure).findByTestId('chart-title');
    expect(title).toHaveTextContent('H-01: 1.1.2');
  });
});
