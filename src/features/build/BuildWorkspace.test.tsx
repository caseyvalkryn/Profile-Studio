import '../../ui/test-utils';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { App } from '../../App';
import { registerCommands } from '../../commands/commands';
import { bindKeys } from '../../commands/keys';
import { testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { useRuns } from '../../state/runs';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { M_PER_NM } from '../shared/units';
import BuildWorkspace from './BuildWorkspace';
import type { RunEntry } from '../../state/runs';

vi.mock('maplibre-gl', () => import('./map/__mocks__/maplibre-gl'));

const reset = () =>
  act(() => {
    useDocument.getState().close();
    useUi.setState({ ...UI_DEFAULTS });
    useRuns.setState({
      results: {},
      order: [],
      activeKey: null,
      compareKeys: [],
      sweep: null,
      doneNoteKey: null,
      sweepNoteKey: null,
    });
  });

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={['/build']}>
      <App />
    </MemoryRouter>,
  );

describe('Build workspace', () => {
  beforeEach(reset);

  it('renders the library, map, inspector and timeline regions', async () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    expect(screen.getByRole('complementary', { name: 'Asset library' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Timeline' })).toBeInTheDocument();
    expect(await screen.findByTestId('map-view')).toBeInTheDocument();
  });

  it('Run is disabled with a reason when no vignette is open', () => {
    render(<BuildWorkspace />);
    const run = screen.getByRole('button', { name: /^Run/ });
    expect(run).toHaveAttribute('aria-disabled', 'true');
    expect(run).toHaveAccessibleDescription('Open a profile first');
    fireEvent.click(run);
    expect(useRuns.getState().activeKey).toBeNull();
  });

  it('the palette opens on Cmd+K and lists Run with its shortcut', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    const run = within(dialog)
      .getAllByRole('option')
      .find((o) => o.textContent?.startsWith('Run'))!;
    expect(run).toBeDefined();
    expect(within(run).getByLabelText('Shortcut Ctrl+Enter')).toBeInTheDocument();
  });

  it('the shortcut sheet opens on ? and shows the same shortcut labels', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    const sheet = await screen.findByRole('dialog', { name: 'Keys in Build' });
    const rows = within(sheet).getAllByRole('row');
    const run = rows.find((r) => r.textContent?.endsWith('Run'))!;
    expect(run).toHaveTextContent('Ctrl+Enter');
    expect(rows.some((r) => r.textContent === 'EscCancel, close or go back')).toBe(true);
  });

  it('the units toggle changes the range shown in the inspector', () => {
    act(() => {
      useDocument.getState().open(testVignette());
      useUi.getState().setSelection(['k-S-01']);
    });
    render(<BuildWorkspace />);
    // Unfocused fields show readout precision (F-09): 5000 m is 2.70 nm.
    expect(screen.getByLabelText('Range')).toHaveValue((5000 / M_PER_NM).toFixed(2));
    fireEvent.click(screen.getByRole('button', { name: 'nm · ft · kt' }));
    expect(useUi.getState().units).toBe('si');
    expect(screen.getByLabelText('Range')).toHaveValue('5.00');
  });
});

describe('Escape order (edit.escape)', () => {
  let unbind: () => void;
  beforeEach(() => {
    reset();
    registerCommands();
    unbind = bindKeys(window);
  });
  afterEach(() => unbind());

  const esc = () => act(() => void fireEvent.keyDown(window, { key: 'Escape' }));

  it('cancels a drag, then the path being drawn, then disarms, then clears selection, then the loop', () => {
    act(() => {
      useDocument.getState().open(testVignette());
      const ui = useUi.getState();
      ui.setSelection(['k-S-01']);
      ui.setLoop({ startS: 5, endS: 20 });
      ui.setArmed({ group: 'sensor', kind: 'radar' });
      ui.setTool('place');
      ui.setDrawing(true);
      useDocument.getState().beginDrag('Set range');
      useDocument.getState().updateDrag((d) => {
        d.sensors[0]!.rangeM = 9000;
      });
    });

    esc();
    expect(useDocument.getState().drag).toBeNull();
    expect(useDocument.getState().doc!.sensors[0]!.rangeM).toBe(5000);
    expect(useUi.getState().pathSignal.seq).toBe(0);

    esc();
    expect(useUi.getState().pathSignal).toEqual({ seq: 1, action: 'cancel' });
    // The map answers the signal by ending the draft.
    act(() => useUi.getState().setDrawing(false));
    expect(useUi.getState().armed).not.toBeNull();

    esc();
    expect(useUi.getState().armed).toBeNull();
    expect(useUi.getState().tool).toBe('select');
    expect(useUi.getState().selectedKeys).toEqual(['k-S-01']);

    esc();
    expect(useUi.getState().selectedKeys).toEqual([]);
    expect(useUi.getState().loop).not.toBeNull();

    esc();
    expect(useUi.getState().loop).toBeNull();
  });
});

describe('run feedback (F-08, FR-03)', () => {
  beforeEach(reset);
  afterEach(() => vi.useRealTimers());

  /** The open vignette with run R-1 stored, and the store as a finished run leaves it. */
  const finishRun = () => {
    act(() => {
      useDocument.getState().open(testVignette());
      useDocument.getState().apply('Run', (d) => {
        d.runs.unshift({ key: 'run-a', id: 'R-1', createdAt: '', n: 10, seed: 1, rows: [] });
      });
    });
    act(() =>
      useRuns.setState({
        activeKey: 'run-a',
        doneNoteKey: 'run-a',
        results: {
          'run-a': {
            key: 'run-a',
            docId: useDocument.getState().doc!.id,
            status: 'done',
            progress: { done: 10, total: 10 },
          } as RunEntry,
        },
      }),
    );
  };

  it('says the run finished, links to Results and stays until the vignette is edited', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/build']}>
        <BuildWorkspace />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/done/)).toBeNull();
    finishRun();
    expect(screen.getByText('Run R-1 done')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View results' })).toHaveAttribute('href', '/results');
    // No timer: the note outlasts the old 6 s limit.
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Run R-1 done')).toBeInTheDocument();
    act(() =>
      useDocument.getState().edit('Rename profile', (d) => {
        d.name = 'edited';
      }),
    );
    expect(screen.queryByText('Run R-1 done')).toBeNull();
  });

  it('clears the note when the user opens Results', async () => {
    finishRun();
    renderApp();
    expect(screen.getByText('Run R-1 done')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Results' }));
    await waitFor(() => expect(useRuns.getState().doneNoteKey).toBeNull());
    fireEvent.click(await screen.findByRole('link', { name: 'Build' }));
    expect(await screen.findByRole('main', { name: 'Build' })).toBeInTheDocument();
    expect(screen.queryByText('Run R-1 done')).toBeNull();
  });

  it('shows sweep progress as test points done of total (FR-09)', () => {
    act(() =>
      useDocument
        .getState()
        .open(
          testVignette({ sweep: { factors: [{ kind: 'threat-speed', levels: [10, 20, 30] }] } }),
        ),
    );
    act(() =>
      useRuns.setState({
        sweep: {
          key: 's',
          docId: useDocument.getState().doc!.id,
          factors: [],
          status: 'running',
          progress: { done: 1, total: 3 },
          result: null,
          error: null,
        },
      }),
    );
    render(<BuildWorkspace />);
    const status = screen.getByRole('status', { name: 'Sweep progress' });
    expect(status).toHaveTextContent('Sweep running 1/3 test points');
  });

  it('an edit after the sweep clears "Sweep done" (review 7.R F-12)', () => {
    act(() =>
      useDocument
        .getState()
        .open(
          testVignette({ sweep: { factors: [{ kind: 'threat-speed', levels: [10, 20, 30] }] } }),
        ),
    );
    act(() =>
      useRuns.setState({
        sweep: {
          key: 's-done',
          docId: useDocument.getState().doc!.id,
          factors: [],
          status: 'done',
          progress: { done: 3, total: 3 },
          result: null,
          error: null,
        },
        sweepNoteKey: 's-done',
      }),
    );
    render(
      <MemoryRouter>
        <BuildWorkspace />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sweep done')).toBeInTheDocument();
    act(() => useDocument.getState().edit('Move', (d) => void (d.sensors[0]!.x += 100)));
    expect(screen.queryByText('Sweep done')).toBeNull();
    // the sweep result is still there; only the note clears
    expect(useRuns.getState().sweep?.status).toBe('done');
    act(() => useRuns.setState({ sweepNoteKey: 's-done' }));
    expect(screen.getByText('Sweep done')).toBeInTheDocument();
    act(() => useRuns.getState().dismissDoneNote());
    expect(screen.queryByText('Sweep done')).toBeNull();
  });

  it('browser back into Results clears the run-done note (review 7.R F-05)', async () => {
    act(() => useDocument.getState().open(testVignette()));
    act(() => useRuns.setState({ doneNoteKey: 'k-1' }));
    // A history entry straight to /results, as browser back or forward gives, with no link click.
    render(
      <MemoryRouter initialEntries={['/build', '/results']} initialIndex={1}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(useRuns.getState().doneNoteKey).toBeNull());
  });
});
