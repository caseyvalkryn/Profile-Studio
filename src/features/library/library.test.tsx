import '../../ui/test-utils';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Vignette } from '../../domain/types';
import { testEffector, testSensor, testThreat, testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { useUi } from '../../state/ui';
import legacyText from './__fixtures__/legacy-v4-cuas-001.json?raw';
import LibraryScreen, { UNDO_MS } from './LibraryScreen';
import { libraryCommands } from './commands';
import { useToast } from '../shell/toastStore';
import { nextProfileIdOf, UNTITLED, useLibraryRequests } from './newProfile';
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
      [...store.values()].map(real.listingOf).sort((a, b) => (a.updated < b.updated ? 1 : -1)),
    ),
    listWithRecords: vi.fn(async () => ({
      list: [...store.values()]
        .map(real.listingOf)
        .sort((a, b) => (a.updated < b.updated ? 1 : -1)),
      records: Object.fromEntries([...store.values()].map((v) => [v.id, structuredClone(v)])),
    })),
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
        <Route path="/brief" element={<p>Brief page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const savedNames = () =>
  screen.queryAllByTestId('saved-card').map((r) => within(r).getByRole('heading').textContent);

function seedSaved(
  name: string,
  updated: string,
  question = '',
  collection = '',
  over: Partial<Vignette> = {},
) {
  const v = testVignette({
    id: `id-${name}`,
    name,
    updated,
    collection,
    questions: question ? [{ key: `q-${name}`, id: 'Q-01', text: question, note: '' }] : [],
    ...over,
  });
  store.set(v.id, v);
  return v;
}

const cardOf = (name: string) =>
  screen
    .getAllByTestId('saved-card')
    .find((c) => within(c).getByRole('heading').textContent === name)!;

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
    expect(await screen.findByText('Saved profiles appear here.')).toBeInTheDocument();
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

  it('lists saved profiles newest first', async () => {
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
      fireEvent.click(within(cardOf('Alpha')).getByRole('button', { name: 'Delete' }));
      expect(within(cardOf('Alpha')).getByText('Delete Alpha?')).toBeInTheDocument();
      fireEvent.click(within(cardOf('Alpha')).getByRole('button', { name: 'Yes' }));
    };

    // No keeps the profile and brings the actions back.
    fireEvent.click(within(cardOf('Alpha')).getByRole('button', { name: 'Delete' }));
    expect(within(cardOf('Alpha')).getByRole('button', { name: 'No' })).toHaveFocus();
    fireEvent.click(within(cardOf('Alpha')).getByRole('button', { name: 'No' }));
    expect(within(cardOf('Alpha')).getByRole('button', { name: 'Open' })).toBeInTheDocument();

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
    await waitFor(() => expect(useToast.getState().text).toBe('Imported 1 profile.'));
    expect(persist.saveVignette).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(savedNames()).toEqual(['Single Group 1 ingress with loiter']));
  });

  it('shows the import error text', async () => {
    renderLibrary();
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import JSON file'), { target: { files: [file] } });
    expect(await screen.findByText('This file is not JSON.')).toBeInTheDocument();
  });

  it('search narrows templates and saved profiles by name, question, collection, class and id', async () => {
    seedSaved('Range day', '2026-10-20T00:00:00Z', 'How far out does the radar detect?');
    seedSaved('Swarm night', '2026-10-21T00:00:00Z', '', 'North range');
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['Range day', 'Swarm night']));
    const search = screen.getByLabelText('Search profiles');

    fireEvent.change(search, { target: { value: 'north range' } });
    await waitFor(() => expect(savedNames()).toEqual(['Swarm night']));
    fireEvent.change(search, { target: { value: 'id-Range' } });
    expect(savedNames()).toEqual(['Range day']);
    expect(screen.getByTestId('library-count')).toHaveTextContent('1 of 2 profiles');
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No profile matches. Clear the search.')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'hover' } });
    expect(screen.getAllByRole('button', { name: /^Open template/ })).toHaveLength(1);
    expect(savedNames()).toEqual([]);

    fireEvent.change(search, { target: { value: 'radar detect' } });
    expect(screen.queryAllByRole('button', { name: /^Open template/ })).toHaveLength(0);
    await waitFor(() => expect(savedNames()).toEqual(['Range day']));

    fireEvent.change(search, { target: { value: 'swarm' } });
    expect(savedNames()).toEqual(['Swarm night']);

    fireEvent.change(search, { target: { value: 'custom' } });
    expect(savedNames()).toEqual(['Range day', 'Swarm night']);
  });

  it('groups saved profiles by collection, sections by name, newest profile first', async () => {
    seedSaved('South', '2026-10-25T00:00:00Z', '', 'South range');
    seedSaved('Old north', '2026-10-01T00:00:00Z', '', 'North range');
    seedSaved('Loose', '2026-10-30T00:00:00Z');
    seedSaved('New north', '2026-10-20T00:00:00Z', '', 'North range');
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['Loose', 'New north', 'Old north', 'South']));
    const groups = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(groups).toEqual([
      'Templates',
      'Saved profiles',
      'No collection',
      'North range',
      'South range',
    ]);
    expect(screen.getByTestId('library-count')).toHaveTextContent('4 profiles · 3 collections');
  });

  it('shows the metadata line "id vN · class · n cards · n paths"', async () => {
    const v = seedSaved('Alpha', '2026-10-20T00:00:00Z', '', 'Range', {
      class: 'Counter-UAS',
      version: 3,
    });
    v.threats = v.threats.slice(0, 1);
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['Alpha']));
    expect(within(cardOf('Alpha')).getByTestId('saved-meta')).toHaveTextContent(
      'id-Alpha v3 · Counter-UAS · 0 cards · 1 path',
    );
  });

  it('draws the thumbnail from the first card when the profile has one', async () => {
    const base = testVignette();
    const card = {
      key: 'c1',
      id: 'c1',
      name: 'Side',
      view: {
        kind: 'elevation' as const,
        centre: { x: 0, y: 0 },
        zoom: 1,
        yawDeg: -35,
        pitchDeg: 55,
        ref: 'asset',
        elevationMode: 'fromAsset' as const,
      },
      layers: {},
      displays: { timeline: false, chart: false, readout: false },
      clip: null,
      focus: [],
      tS: null,
      caption: '',
      notes: '',
    };
    seedSaved('Carded', '2026-10-21T00:00:00Z', '', '', { cards: [card] });
    seedSaved('Plain', '2026-10-20T00:00:00Z', '', '', { areas: base.areas });
    renderLibrary();
    const svgOf = (name: string) => screen.getByRole('img', { name }).querySelector('svg');
    await waitFor(() => expect(svgOf('Carded first card')).not.toBeNull());
    expect(svgOf('Carded first card')!.getAttribute('data-proj')).toBe('elev');
    await waitFor(() => expect(svgOf('Plain map')).not.toBeNull());
    expect(svgOf('Plain map')!.getAttribute('data-proj')).toBe('plan');
    expect(within(cardOf('Carded')).getByTestId('saved-meta')).toHaveTextContent('1 card ·');
    // one store read draws every thumbnail: no load per profile (lane 11.1)
    expect(persist.loadVignette).not.toHaveBeenCalled();
    expect(persist.listWithRecords).toHaveBeenCalledTimes(1);
  });

  it('New in a fresh store opens Build with Untitled profile and one defended asset', async () => {
    const stop = persist.startAutosave(persist.saveVignette, undefined, 10);
    const focus0 = useLibraryRequests.getState().nameFocus;
    renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }));
    expect(await screen.findByText('Build page')).toBeInTheDocument();
    const doc = useDocument.getState().doc!;
    expect(doc.name).toBe(UNTITLED);
    expect(doc.areas.map((a) => a.kind)).toEqual(['asset']);
    expect(doc.threats).toEqual([]);
    expect(useUi.getState().workspace).toBe('build');
    expect(useLibraryRequests.getState().nameFocus).toBe(focus0 + 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(store.size).toBe(0);
    stop();
  });

  it('a rename of the new profile saves it and shows in the Library', async () => {
    const stop = persist.startAutosave(persist.saveVignette, undefined, 10);
    const view = renderLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }));
    expect(await screen.findByText('Build page')).toBeInTheDocument();
    useDocument.getState().edit('Rename profile', (d) => {
      d.name = 'North fence';
    });
    await waitFor(() => expect(store.size).toBe(1));
    stop();
    view.unmount();
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['North fence']));
  });

  it('the template menu lists Blank last and opens a copy', async () => {
    renderLibrary();
    fireEvent.keyDown(screen.getByRole('button', { name: 'From template' }), { key: 'Enter' });
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Point defence, single quadrotor',
      'Hover track hold',
      'Blank',
    ]);
    fireEvent.click(items[1]!);
    expect(await screen.findByText('Build page')).toBeInTheDocument();
    expect(useDocument.getState().doc!.name).toBe('Hover track hold');
  });

  it('Brief opens the profile and routes to /brief', async () => {
    seedSaved('Alpha', '2026-10-20T00:00:00Z');
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['Alpha']));
    fireEvent.click(within(cardOf('Alpha')).getByRole('button', { name: 'Brief' }));
    expect(await screen.findByText('Brief page')).toBeInTheDocument();
    expect(useDocument.getState().doc!.id).toBe('id-Alpha');
  });

  it('Duplicate saves a copy named "<name> copy"', async () => {
    seedSaved('Alpha', '2026-10-20T00:00:00Z');
    renderLibrary();
    await waitFor(() => expect(savedNames()).toEqual(['Alpha']));
    fireEvent.click(within(cardOf('Alpha')).getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(savedNames()).toEqual(['Alpha copy', 'Alpha']));
  });
});

describe('libraryCommands', () => {
  it('exports the four commands; the template options put Blank last', () => {
    expect(libraryCommands.map((c) => c.id)).toEqual([
      'profile.new',
      'profile.newFromTemplate',
      'library.export',
      'library.search',
    ]);
    const search = libraryCommands[3]!;
    expect(search).toMatchObject({ label: 'Search the library', shortcut: '/' });
    expect(search.workspaces).toEqual(['library']);
    const fromTpl = libraryCommands[1]!;
    expect(fromTpl.needsArg).toBe(true);
    expect(fromTpl.options!.at(-1)).toEqual({ value: 'blank', label: 'Blank' });
    expect(libraryCommands[0]!.shortcut).toBe('Mod+N');
  });

  it('profile.new opens Untitled profile and asks the shell for /build and the name field', async () => {
    store.clear();
    seedSaved('Alpha', '2026-10-20T00:00:00Z');
    store.set('PROF-1', { ...store.get('id-Alpha')!, id: 'PROF-1' });
    const before = useLibraryRequests.getState();
    libraryCommands[0]!.run({} as never);
    await waitFor(() => expect(useDocument.getState().doc?.name).toBe(UNTITLED));
    expect(useDocument.getState().doc!.id).toBe('PROF-2');
    const after = useLibraryRequests.getState();
    expect(after.route?.path).toBe('/build');
    expect(after.nameFocus).toBe(before.nameFocus + 1);
  });
});

describe('profile ids', () => {
  it('a new profile takes the lowest free PROF-n', () => {
    expect(nextProfileIdOf([])).toBe('PROF-1');
    expect(nextProfileIdOf(['PROF-1', 'PROF-3', 'cuas-001'])).toBe('PROF-2');
  });
});
