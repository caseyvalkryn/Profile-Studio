import '../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../App';
import { registerCommands, setBoardCancel } from '../../commands/commands';
import { currentContext, execute, get } from '../../commands/registry';
import { bindKeys } from '../../commands/keys';
import { testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { useLibraryRequests } from '../library/newProfile';
import { useToast } from '../shell/toastStore';
import { M_PER_NM } from '../shared/units';
import BuildWorkspace from './BuildWorkspace';
import { cancel } from './board/Board';
import { useBoard, BOARD_DEFAULTS } from './board/store';
import { saveCard, SAVED_TOAST, SAVED_TOAST_3D } from './cards/cards';

const reset = () =>
  act(() => {
    useDocument.getState().close();
    useUi.setState({ ...UI_DEFAULTS });
  });

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={['/build']}>
      <App />
    </MemoryRouter>,
  );

describe('Build workspace', () => {
  beforeEach(reset);

  it('renders the rail, the bar, the map, the scrub, the thumbnails and the inspector', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    expect(screen.getByRole('navigation', { name: 'Scene' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Build bar' })).toBeInTheDocument();
    const map = screen.getByRole('region', { name: 'Map' });
    expect(within(map).getByTestId('board-stage')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Time' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Other views' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    // Lane 10.3: no timeline, no readout panel, no Fit, Ref or units in the bar.
    expect(screen.queryByRole('region', { name: 'Timeline' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Readout' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fit' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Ref' })).toBeNull();
  });

  it('the 3D button switches the board to the 3D view', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    const view = screen.getByRole('group', { name: 'View' });
    fireEvent.click(within(view).getByRole('button', { name: '3D' }));
    expect(useUi.getState().view).toBe('3d');
    expect(within(view).getByRole('button', { name: '3D' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Elevation opens From asset and shows the mode segments only in Elevation', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    expect(useUi.getState().elevationMode).toBe('fromAsset');
    expect(screen.queryByRole('group', { name: 'Elevation mode' })).toBeNull();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'View' })).getByRole('button', {
        name: 'Elevation',
      }),
    );
    const seg = screen.getByRole('group', { name: 'Elevation mode' });
    expect(within(seg).getByRole('button', { name: 'From asset' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(seg).getByRole('button', { name: 'Along path' }));
    expect(useUi.getState().elevationMode).toBe('alongPath');
    // a pressed segment keeps its mode
    fireEvent.click(within(seg).getByRole('button', { name: 'Along path' }));
    expect(useUi.getState().elevationMode).toBe('alongPath');
    expect(within(seg).getByRole('button', { name: 'Along path' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('T turns the time cursor on and off', () => {
    act(() => useDocument.getState().open(testVignette()));
    const unbind = bindKeys(window);
    render(<BuildWorkspace />);
    const value = screen.getByTestId('scrub-value');
    expect(useUi.getState().timeOn).toBe(false);
    expect(value).toHaveTextContent('full run');
    act(() => void fireEvent.keyDown(window, { key: 't' }));
    expect(useUi.getState().timeOn).toBe(true);
    expect(value).toHaveTextContent(/^\d+ s$/);
    act(() => void fireEvent.keyDown(window, { key: 't' }));
    expect(useUi.getState().timeOn).toBe(false);
    unbind();
  });

  it('view.ref cycles the range reference and names it in its label', () => {
    registerCommands();
    act(() => useDocument.getState().open(testVignette()));
    act(() => useBoard.setState({ ...BOARD_DEFAULTS }));
    const doc = useDocument.getState().doc!;
    const ids = [...doc.sensors, ...doc.effectors, ...doc.nodes].map((x) => x.id);
    expect(get('view.ref')!.label).toBe('Range reference: asset');
    act(() => void execute('view.ref'));
    expect(useBoard.getState().ref).toBe('asset-edge');
    expect(get('view.ref')!.label).toBe('Range reference: asset edge');
    act(() => void execute('view.ref'));
    expect(useBoard.getState().ref).toBe(ids[0]);
    for (let i = 1; i < ids.length; i++) act(() => void execute('view.ref'));
    act(() => void execute('view.ref'));
    expect(useBoard.getState().ref).toBe('asset');
  });

  it('the palette opens on Cmd+K and lists Undo with its shortcut', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    const undo = within(dialog)
      .getAllByRole('option')
      .find((o) => o.textContent?.startsWith('Undo'))!;
    expect(undo).toBeDefined();
    expect(within(undo).getByLabelText('Shortcut Ctrl+Z')).toBeInTheDocument();
  });

  it('the shortcut sheet opens on ? and shows the same shortcut labels', async () => {
    renderApp();
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    const sheet = await screen.findByRole('dialog', { name: 'Keys in Build' });
    const rows = within(sheet).getAllByRole('row');
    const undo = rows.find((r) => r.textContent?.endsWith('Undo'))!;
    expect(undo).toHaveTextContent('Ctrl+Z');
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
    registerCommands();
    act(() => void execute('view.units'));
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

  it('closes a dialog, then the palette, then cancels on the board, before the selection', () => {
    let boardBusy = true;
    setBoardCancel(() => {
      const was = boardBusy;
      boardBusy = false;
      return was;
    });
    try {
      act(() => {
        useDocument.getState().open(testVignette());
        const ui = useUi.getState();
        ui.setSelection(['k-S-01']);
        ui.setDialog('export');
        ui.setPaletteOpen(true);
      });
      esc();
      expect(useUi.getState().dialog).toBeNull();
      expect(useUi.getState().paletteOpen).toBe(true);
      esc();
      expect(useUi.getState().paletteOpen).toBe(false);
      expect(boardBusy).toBe(true);
      esc();
      expect(boardBusy).toBe(false);
      expect(useUi.getState().selectedKeys).toEqual(['k-S-01']);
      esc();
      expect(useUi.getState().selectedKeys).toEqual([]);
    } finally {
      setBoardCancel(cancel);
    }
  });

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

describe('Build bar, scrub, thumbnails and cards (lane 10.3)', () => {
  let unbind: () => void;
  beforeEach(() => {
    reset();
    registerCommands();
    unbind = bindKeys(window);
    act(() => useBoard.setState({ ...BOARD_DEFAULTS }));
  });
  afterEach(() => unbind());

  const withEvent = () => {
    const v = testVignette();
    v.events = [
      {
        key: 'k-e1',
        id: 'e1',
        tS: 40,
        type: 'detect',
        label: 'First detection',
        threatKey: v.threats[0]!.key,
        sensorKey: null,
      },
    ];
    return v;
  };

  it('the readout reads the scene, then the selected threat in the display units', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    const doc = useDocument.getState().doc!;
    const line = screen.getByTestId('bar-readout');
    expect(line).toHaveTextContent(
      new RegExp(`^${doc.threats.length} paths? · 0 events · \\d+ s$`),
    );
    act(() => useUi.getState().setSelection([doc.threats[0]!.key]));
    expect(line).toHaveTextContent(
      new RegExp(`^${doc.threats[0]!.id} · [\\d.]+ nm · \\d+ kt · \\d+ s$`),
    );
    act(() => useUi.getState().setUnits('si'));
    expect(line).toHaveTextContent(/ km · \d+ m\/s · /);
  });

  it('the scrub: Time turns time on, the range sets ui.tS and is off while time is off', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    const range = screen.getByRole('slider', { name: 'Scene time' });
    expect(range).toBeDisabled();
    expect(Number(range.getAttribute('max'))).toBeGreaterThanOrEqual(60);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Time' }));
    expect(useUi.getState().timeOn).toBe(true);
    expect(range).toBeEnabled();
    fireEvent.change(range, { target: { value: '42' } });
    expect(useUi.getState().tS).toBe(42);
    expect(screen.getByTestId('scrub-value')).toHaveTextContent('42 s');
  });

  it('a bead sits at its event time; a click sets the time there and selects the event', () => {
    act(() => useDocument.getState().open(withEvent()));
    render(<BuildWorkspace />);
    const bead = screen.getByTestId('scrub-bead');
    expect(bead).toHaveAttribute('title', 'First detection');
    fireEvent.click(bead);
    expect(useUi.getState().timeOn).toBe(true);
    expect(useUi.getState().tS).toBe(40);
    expect(useUi.getState().selectedKeys).toEqual(['k-e1']);
  });

  it('the five layer toggles write the board layers; Telemetry drives telemetry and target', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    const group = screen.getByRole('group', { name: 'Layers' });
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes.map((b) => b.parentElement!.textContent)).toEqual([
      'Reach',
      'Events',
      'Envelopes',
      'Telemetry',
      'Labels',
    ]);
    const tele = within(group).getByRole('checkbox', { name: 'Telemetry' });
    expect(tele).not.toBeChecked();
    fireEvent.click(tele);
    expect(useBoard.getState().layers).toMatchObject({ telemetry: true, target: true });
    fireEvent.click(within(group).getByRole('checkbox', { name: 'Reach' }));
    expect(useBoard.getState().layers.reach).toBe(false);
  });

  it('the thumbnails render the two other cameras; a click switches the view', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    const thumbs = within(screen.getByRole('group', { name: 'Other views' }));
    expect(thumbs.queryByRole('button', { name: 'Plan thumbnail' })).toBeNull();
    const elev = thumbs.getByRole('button', { name: 'Elevation thumbnail' });
    expect(thumbs.getByRole('button', { name: '3D thumbnail' })).toBeInTheDocument();
    expect(elev.querySelector('svg.board.thumb')).not.toBeNull();
    fireEvent.click(elev);
    expect(useUi.getState().view).toBe('elevation');
    expect(thumbs.getByRole('button', { name: 'Plan thumbnail' })).toBeInTheDocument();
    expect(thumbs.queryByRole('button', { name: 'Elevation thumbnail' })).toBeNull();
  });

  it('Add waypoints arms the path placement on the selected threat', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    const doc = useDocument.getState().doc!;
    act(() => useUi.getState().setSelection([doc.threats[0]!.key]));
    const btn = screen.getByRole('button', { name: 'Add waypoints' });
    fireEvent.click(btn);
    expect(useUi.getState().armed).toEqual({ group: 'threat', type: doc.threats[0]!.type });
    expect(useBoard.getState().placing?.kind).toBe('aircraft');
    expect(useBoard.getState().placing?.pathId).toBe(doc.threats[0]!.id);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(useBoard.getState().placing).toBeNull();
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('C saves the view as a card in one undo step and toasts', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    const doc0 = useDocument.getState().doc!;
    act(() => {
      useUi.getState().setView('3d');
      useUi.getState().setTimeOn(true);
      useUi.getState().setTime(200);
      useUi.getState().setSelection([doc0.threats[0]!.key]);
      useBoard.getState().set({ yaw: -20, pitch: 40, ref: doc0.sensors[0]!.id });
    });
    act(() => void fireEvent.keyDown(window, { key: 'c' }));
    const doc = useDocument.getState().doc!;
    expect(doc.cards).toHaveLength(1);
    const c = doc.cards[0]!;
    expect(c).toMatchObject({
      id: 'c1',
      name: 'Card 1',
      tS: 200,
      focus: [doc0.threats[0]!.key],
      displays: { timeline: false, chart: false, readout: false },
      clip: null,
      caption: '',
      notes: '',
      layers: {
        reach: true,
        events: true,
        envelopes: true,
        telemetry: false,
        target: true,
        labels: true,
      },
    });
    expect(c.view).toMatchObject({
      kind: '3d',
      yawDeg: -20,
      pitchDeg: 40,
      ref: doc0.sensors[0]!.key,
      elevationMode: 'fromAsset',
      // 3D has no inverse camera: the card keeps the fitted frame and the toast says so (11.1)
      centre: { x: 0, y: 0 },
      zoom: 1,
    });
    expect(useDocument.getState().history.at(-1)).toBe('Save card');
    expect(useToast.getState().text).toBe(SAVED_TOAST_3D);
    // The bar button saves the next one, with time off.
    act(() => useUi.getState().setTimeOn(false));
    fireEvent.click(screen.getByRole('button', { name: 'Save as card' }));
    expect(useDocument.getState().doc!.cards.map((x) => [x.id, x.name, x.tS])).toEqual([
      ['c1', 'Card 1', 200],
      ['c2', 'Card 2', null],
    ]);
    act(() => useDocument.getState().undo());
    expect(useDocument.getState().doc!.cards).toHaveLength(1);
  });

  it('saveCard(afterKey) places the card after that one', () => {
    act(() => useDocument.getState().open(testVignette()));
    const a = saveCard(null)!;
    saveCard(null);
    const c = saveCard(a)!;
    expect(useDocument.getState().doc!.cards.map((x) => x.key)[1]).toBe(c);
    expect(useToast.getState().text).toBe(SAVED_TOAST);
  });

  it('the card commands open, duplicate, move and delete, each in one undo step', () => {
    act(() => useDocument.getState().open(testVignette()));
    const k1 = saveCard(null)!;
    act(() => {
      useUi.getState().setView('elevation');
      useUi.getState().setTimeOn(true);
      useUi.getState().setTime(90);
    });
    const k2 = saveCard(null)!;
    const ids = () => useDocument.getState().doc!.cards.map((x) => x.id);
    const last = () => useDocument.getState().history.at(-1);
    // The card menu targets a card through the selection (menu targetContext).
    const run = (id: string, key: string) =>
      act(() => {
        useUi.getState().setSelection([key]);
        execute(id, currentContext(), key);
      });

    run('card.open', k1);
    expect(useUi.getState().view).toBe('plan');
    expect(useUi.getState().timeOn).toBe(false);
    run('card.open', k2);
    expect(useUi.getState().view).toBe('elevation');
    expect(useUi.getState().tS).toBe(90);

    run('card.duplicate', k1);
    expect(ids()).toEqual(['c1', 'c3', 'c2']);
    expect(last()).toBe('duplicate card c1');

    run('card.moveDown', k1);
    expect(ids()).toEqual(['c3', 'c1', 'c2']);
    expect(last()).toBe('move card c1 down');
    run('card.moveUp', k2);
    expect(ids()).toEqual(['c3', 'c2', 'c1']);
    expect(last()).toBe('move card c2 up');

    run('card.delete', k2);
    expect(ids()).toEqual(['c3', 'c1']);
    expect(last()).toBe('delete card c2');
    act(() => useDocument.getState().undo());
    expect(ids()).toEqual(['c3', 'c2', 'c1']);

    act(() => useUi.getState().setSelection([]));
    expect(get('card.delete')!.when(currentContext())).toBe('Select a card first');
  });

  it('Open in Brief asks the shell for /brief', () => {
    act(() => useDocument.getState().open(testVignette()));
    const k = saveCard(null)!;
    act(() => {
      useUi.getState().setSelection([k]);
      execute('card.openInBrief', currentContext(), k);
    });
    expect(useLibraryRequests.getState().route?.path).toBe('/brief');
    expect(useUi.getState().selectedKeys).toEqual([k]);
  });
});
