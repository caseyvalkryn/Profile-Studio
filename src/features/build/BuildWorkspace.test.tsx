import '../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../../App';
import { registerCommands, setBoardCancel } from '../../commands/commands';
import { bindKeys } from '../../commands/keys';
import { testVignette } from '../../engine/testVignette';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { M_PER_NM } from '../shared/units';
import BuildWorkspace from './BuildWorkspace';
import { cancel } from './board/Board';
import { boardDerived } from './board/derived';
import { useBoard, BOARD_DEFAULTS } from './board/store';
import { hText } from './inspector/parse';

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

  it('renders the rail, the board in the map region, the inspector and the timeline', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    expect(screen.getByRole('navigation', { name: 'Scene' })).toBeInTheDocument();
    const map = screen.getByRole('region', { name: 'Map' });
    expect(within(map).getByTestId('board-stage')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Timeline' })).toBeInTheDocument();
    // The readout panel is off by default (legacy).
    expect(screen.queryByRole('region', { name: 'Readout' })).toBeNull();
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
    const tl = screen.getByRole('region', { name: 'Timeline' });
    expect(useUi.getState().timeOn).toBe(false);
    expect(within(tl).getByText('time off')).toBeInTheDocument();
    act(() => void fireEvent.keyDown(window, { key: 't' }));
    expect(useUi.getState().timeOn).toBe(true);
    expect(within(tl).queryByText('time off')).toBeNull();
    act(() => void fireEvent.keyDown(window, { key: 't' }));
    expect(useUi.getState().timeOn).toBe(false);
    unbind();
  });

  it('the Ref select writes the board reference', () => {
    act(() => useDocument.getState().open(testVignette()));
    act(() => useBoard.setState({ ...BOARD_DEFAULTS }));
    render(<BuildWorkspace />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Ref' }), { target: { value: 'S-01' } });
    expect(useBoard.getState().ref).toBe('S-01');
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

describe('readout panel', () => {
  let unbind: () => void;
  beforeEach(() => {
    reset();
    registerCommands();
    unbind = bindKeys(window);
    act(() => useBoard.setState({ ...BOARD_DEFAULTS }));
  });
  afterEach(() => unbind());

  it('K shows and hides the readout above the inspector', () => {
    act(() => useDocument.getState().open(testVignette()));
    render(<BuildWorkspace />);
    expect(screen.queryByRole('region', { name: 'Readout' })).toBeNull();
    act(() => void fireEvent.keyDown(window, { key: 'k' }));
    expect(useUi.getState().panels.readout).toBe(true);
    expect(screen.getByRole('region', { name: 'Readout' })).toBeInTheDocument();
    act(() => void fireEvent.keyDown(window, { key: 'k' }));
    expect(screen.queryByRole('region', { name: 'Readout' })).toBeNull();
  });

  it('shows derived.at for the selected threat (range from the board reference)', () => {
    act(() => {
      useDocument.getState().open(testVignette());
      useUi.getState().setSelection(['k-T-01']);
      useUi.getState().setTime(30);
      useUi.getState().togglePanel('readout');
    });
    render(<BuildWorkspace />);
    const doc = useDocument.getState().doc!;
    const r = boardDerived(doc).at('T-01', 30, 'asset')!.r;
    const line = screen.getByRole('listitem', { name: 'T-01 readout' });
    expect(line).toHaveTextContent(hText(r, useUi.getState().units));
    // With S-01 as the reference the range is measured from S-01.
    act(() => useBoard.getState().set({ ref: 'S-01' }));
    act(() => useUi.getState().setTime(31));
    const r2 = boardDerived(doc).at('T-01', 31, 'S-01')!.r;
    expect(screen.getByRole('listitem', { name: 'T-01 readout' })).toHaveTextContent(
      hText(r2, useUi.getState().units),
    );
  });
});
