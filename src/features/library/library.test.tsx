import '../../ui/test-utils';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Vignette } from '../../domain/types';
import { testEffector, testSensor, testThreat, testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { useUi } from '../../state/ui';
import legacyText from './__fixtures__/legacy-v4-cuas-001.json?raw';
import LibraryScreen, { UNDO_MS } from './LibraryScreen';
import type { Template } from './types';

// An in-memory store behind the persist db functions. importJson and exportJson stay real.
const store = new Map<string, Vignette>();
vi.mock('../../state/persist', async (orig) => {
  const real = await orig<typeof import('../../state/persist')>();
  return {
    ...real,
    saveVignette: vi.fn(async (v: Vignette) => void store.set(v.id, structuredClone(v))),
    loadVignette: vi.fn(async (id: string) => store.get(id) ?? null),
    deleteVignette: vi.fn(async (id: string) => void store.delete(id)),
    listVignettes: vi.fn(async () =>
      [...store.values()]
        .map((v) => ({ id: v.id, name: v.name, updated: v.updated }))
        .sort((a, b) => (a.updated < b.updated ? 1 : -1)),
    ),
  };
});
const persist = await import('../../state/persist');

const tpl = (id: string, name: string, question: string, steps: Template['steps']): Template => ({
  id,
  name,
  question,
  steps,
  mainMeasures: [],
  make: () =>
    testVignette({
      id: `tpl-${id}`,
      sensors: [testSensor('RDR-1', 'radar', 4000)],
      effectors: [testEffector('EW-1')],
      threats: [testThreat('T1', 'g1-quad-isr')],
    }),
});

const TEMPLATES: Template[] = [
  tpl('blank', 'Blank', '', []),
  tpl('point', 'Point defence, single quadrotor', 'Does the layer defeat a Group 1 quad?', [
    'find',
    'fix',
    'engage',
  ]),
  tpl('hover', 'Hover track hold', 'Does the track hold through a 60 s hover?', ['track']),
];

function renderLibrary(templates = TEMPLATES) {
  return render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route path="/library" element={<LibraryScreen templates={templates} />} />
        <Route path="/build" element={<p>Build page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const savedNames = () =>
  screen.queryAllByTestId('saved-row').map((r) => within(r).getAllByRole('button')[0]!.textContent);

function seedSaved(name: string, updated: string, question = '') {
  const v = testVignette({
    id: `id-${name}`,
    name,
    updated,
    questions: question ? [{ key: `q-${name}`, id: 'Q-01', text: question, note: '' }] : [],
  });
  store.set(v.id, v);
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  useDocument.getState().close();
});

describe('LibraryScreen', () => {
  it('renders templates in order with Blank last and a chip per step', async () => {
    renderLibrary();
    const cards = screen.getAllByRole('button', { name: /^Open template/ });
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Open template Point defence, single quadrotor',
      'Open template Hover track hold',
      'Open template Blank',
    ]);
    const chips = within(cards[0]!).getByLabelText('F2T2EA steps');
    expect([...chips.children].map((c) => c.textContent)).toEqual(['Find', 'Fix', 'Engage']);
    expect(within(cards[0]!).getByRole('img')).toBeInTheDocument();
    expect(await screen.findByText('Saved vignettes appear here.')).toBeInTheDocument();
  });

  it('opens a template as an unsaved copy and goes to Build', async () => {
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Open template Hover track hold' }));
    expect(await screen.findByText('Build page')).toBeInTheDocument();
    expect(persist.saveVignette).not.toHaveBeenCalled();
    const doc = useDocument.getState().doc!;
    expect(doc.id).not.toBe('tpl-hover');
    expect(doc.name).toBe('Hover track hold');
    expect(useUi.getState().workspace).toBe('build');
  });

  it('saves the template copy only after its first edit', async () => {
    const stop = persist.startAutosave(persist.saveVignette, undefined, 10);
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Open template Hover track hold' }));
    expect(await screen.findByText('Build page')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(store.size).toBe(0);
    useDocument.getState().edit('Move', (d) => {
      d.sensors[0]!.x += 100;
    });
    await waitFor(() => expect(store.size).toBe(1));
    const saved = [...store.values()][0]!;
    expect(saved.id).toBe(useDocument.getState().doc!.id);
    expect(saved.name).toBe('Hover track hold');
    stop();
  });

  it('lists saved vignettes newest first', async () => {
    seedSaved('Old', '2026-10-01T00:00:00Z');
    seedSaved('New', '2026-10-29T00:00:00Z');
    seedSaved('Mid', '2026-10-15T00:00:00Z');
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['New', 'Mid', 'Old']));
  });

  it('deletes with undo and writes the delete only after the timer', async () => {
    seedSaved('Alpha', '2026-10-20T00:00:00Z');
    seedSaved('Bravo', '2026-10-21T00:00:00Z');
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['Bravo', 'Alpha']));

    const del = async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Alpha' }), {
        key: 'Enter',
      });
      fireEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    };

    vi.useFakeTimers({ shouldAdvanceTime: true });
    await del();
    expect(screen.getByText(/Deleted Alpha\./)).toBeInTheDocument();
    expect(savedNames()).toEqual(['Bravo']);
    act(() => vi.advanceTimersByTime(UNDO_MS - 100));
    expect(persist.deleteVignette).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(savedNames()).toEqual(['Bravo', 'Alpha']);
    act(() => vi.advanceTimersByTime(UNDO_MS));
    expect(persist.deleteVignette).not.toHaveBeenCalled();

    await del();
    act(() => vi.advanceTimersByTime(UNDO_MS));
    expect(persist.deleteVignette).toHaveBeenCalledWith('id-Alpha');
    expect(screen.queryByText(/Deleted Alpha\./)).not.toBeInTheDocument();
    expect(savedNames()).toEqual(['Bravo']);
    vi.useRealTimers();
  });

  it('imports a legacy v4 JSON file, saves it and lists it', async () => {
    renderLibrary();
    const input = screen.getByLabelText('Import JSON file');
    const file = new File([legacyText], 'cuas-001.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Imported 1 vignette')).toBeInTheDocument();
    expect(persist.saveVignette).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(savedNames()).toEqual(['Single Group 1 ingress with loiter']));
  });

  it('shows the import error text', async () => {
    renderLibrary();
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import JSON file'), { target: { files: [file] } });
    expect(await screen.findByText('This file is not JSON.')).toBeInTheDocument();
  });

  it('search narrows templates and saved vignettes by name and question', async () => {
    seedSaved('Range day', '2026-10-20T00:00:00Z', 'How far out does the radar detect?');
    seedSaved('Swarm night', '2026-10-21T00:00:00Z');
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['Swarm night', 'Range day']));
    const search = screen.getByLabelText('Search templates and saved vignettes');

    fireEvent.change(search, { target: { value: 'hover' } });
    expect(screen.getAllByRole('button', { name: /^Open template/ })).toHaveLength(1);
    expect(savedNames()).toEqual([]);

    fireEvent.change(search, { target: { value: 'radar detect' } });
    expect(screen.queryAllByRole('button', { name: /^Open template/ })).toHaveLength(0);
    await waitFor(() => expect(savedNames()).toEqual(['Range day']));

    fireEvent.change(search, { target: { value: 'swarm' } });
    expect(savedNames()).toEqual(['Swarm night']);
  });
});
