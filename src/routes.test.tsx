import './ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from './App';
import type { Vignette } from './domain/types';
import { run } from './engine/run';
import { testVignette } from './engine/testVignette';
import { useDocument } from './state/document';
import { useRuns } from './state/runs';

vi.mock('maplibre-gl', () => import('./features/build/map/__mocks__/maplibre-gl'));
// Keep the start-up vignette from replacing the one each test opens.
vi.mock('./features/build/devVignette', () => ({ openStartVignette: async () => {} }));

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
  useRuns.setState({ results: {}, order: [], activeKey: null, compareKeys: [], sweep: null });
  act(() => useDocument.getState().open(withRun()));
});

describe('routes', () => {
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
